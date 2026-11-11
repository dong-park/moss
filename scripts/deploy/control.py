#!/usr/bin/env python3
"""Root-only retry and recorded-previous rollback. No arbitrary SHA/tag input."""
import argparse
import json
from pathlib import Path
import sys
import time
from agent import Store, deliver, finish, serving, stopped
from release import digest, release_label, require, validate
from runtime import GitHub, Runtime, load_config


def retry(store,github,ident):
    state=store.read()
    require(not state.get('active') and not state.get('paused'),'pause/intervention must be resolved first')
    deployment=github.repo(f'/deployments/{int(ident)}'); manifest=validate(deployment['payload'])
    require(deployment['environment']=='production' and deployment['task']=='deploy','not a verified release request')
    require(manifest['baseline']==state['current']['images'],'baseline changed; run a new compatibility rehearsal')
    require(manifest['sha']==github.main_sha(),'only current main can be retried')
    # New ID reruns every ordinary gate on the host. Do not alter the old terminal result.
    return github.repo('/deployments',{'ref':manifest['sha'],'task':'deploy','environment':'production',
        'auto_merge':False,'required_contexts':[],'production_environment':True,'payload':manifest,
        'description':f'Retry of verified deployment {int(ident)}'})['id']


def rollback(store,runtime,github):
    state=store.read(); current=validate(state['current']); previous=state.get('previous')
    require(previous is not None and not state.get('active'),'no recorded previous release or replacement active')
    # The verified evidence retained at deployment avoids the artifact-retention window; it must still
    # match the recorded release's signed digest. GitHub stays required for the rollback record and
    # the previous images' attestation.
    runtime.prepare_rollback(current,previous,evidence=state.get('current_evidence'))
    deployment=github.repo('/deployments',{'ref':current['sha'],'task':'rollback','environment':'production',
        'auto_merge':False,'required_contexts':[],'production_environment':True,
        'payload':dict(previous,rollback_proof=current),'description':'Operator restore of recorded previous image set'})
    ident=deployment['id']; requested=release_label(previous)
    state['active']={'id':ident,'manifest':current,'requested':requested,'phase':'stopping','phases':{}}; store.save(state)
    phase='stopping'
    try:
        runtime.stop()
        runtime.backup(ident)
        require(runtime.migration_compatible(current),'migration state changed during rollback')
        observed=getattr(runtime,'observed_migrations',None)
        value=store.read(); value['active']['phase']=phase='rollback'; store.save(value)
        runtime.start_server(previous)
        runtime.start_clients(previous)
        runtime.smoke(previous)
    except Exception:
        finish(store,ident,'error',running=stopped(runtime),requested=requested,
               rollback='failed' if phase=='rollback' else 'not_attempted'); raise
    finish(store,ident,'success',running=serving(previous),rollback='succeeded',requested=requested,
           commit={'current':previous,'previous':None,'paused':True,'current_evidence':None,
                   'current_migrations_sha256':digest(observed) if observed else None})
    return ident


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--config',default='/etc/moss-deploy/config.json')
    parser.add_argument('command',choices=['retry','rollback-previous'])
    parser.add_argument('deployment_id',type=int,nargs='?')
    args=parser.parse_args(); config=load_config(Path(args.config)); store=Store(config['state_dir'])
    with store.lock():
        github=GitHub(config); runtime=Runtime(config,github)
        if args.command=='retry':
            require(args.deployment_id is not None,'retry requires an existing deployment ID')
            print(retry(store,github,args.deployment_id))
        else:
            require(args.deployment_id is None,'rollback takes no arbitrary target')
            print(rollback(store,runtime,github))
        require(deliver(store,github),'result recorded locally; GitHub delivery pending (see status)')

if __name__=='__main__':
    try: main()
    except Exception:
        print('Operator action failed closed; inspect protected state and runbook',file=sys.stderr); sys.exit(1)
