#!/usr/bin/env python3
"""Root-only retry and recorded-previous rollback. No arbitrary SHA/tag input."""
import argparse
import json
from pathlib import Path
import sys
import time
from agent import Store, finish, halt
from release import REPOSITORY, require, validate
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
    runtime.prepare_rollback(current,previous)
    deployment=github.repo('/deployments',{'ref':current['sha'],'task':'rollback','environment':'production',
        'auto_merge':False,'required_contexts':[],'production_environment':True,
        'payload':dict(previous,rollback_proof=current),'description':'Operator restore of recorded previous image set'})
    ident=deployment['id']
    state['active']={'id':ident,'manifest':current,'phase':'stopping'}; store.save(state)
    try:
        runtime.stop()
        runtime.backup(ident)
        require(runtime.migration_compatible(current),'migration state changed during rollback')
        runtime.start_server(previous)
        runtime.start_clients(previous)
        runtime.smoke(previous)
    except Exception:
        halt(runtime); finish(store,ident,'error',None,rollback=True); raise
    state=store.read(); state['current']=previous; state['previous']=None; state['paused']=True; store.save(state)
    finish(store,ident,'success',previous.get('sha'),rollback=True)
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
        from agent import reports
        reports(store,github)

if __name__=='__main__':
    try: main()
    except Exception:
        print('Operator action failed closed; inspect protected state and runbook',file=sys.stderr); sys.exit(1)
