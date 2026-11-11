#!/usr/bin/env python3
"""Root-installed pull deployer. Payloads are data; executable paths are installed policy."""
import argparse
import contextlib
import fcntl
import json
import os
from pathlib import Path
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from release import Rejected, require, validate


class Store:
    def __init__(self,path):
        self.path=Path(path); self.path.mkdir(mode=0o700,parents=True,exist_ok=True)
    @contextlib.contextmanager
    def lock(self):
        with (self.path/'lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            try: yield
            finally: fcntl.flock(lock,fcntl.LOCK_UN)
    def read(self):
        return json.loads((self.path/'state.json').read_text())
    def save(self,state):
        fd,name=tempfile.mkstemp(prefix='.state-',dir=self.path)
        try:
            with os.fdopen(fd,'w') as output:
                json.dump(state,output,sort_keys=True); output.flush(); os.fsync(output.fileno())
            os.replace(name,self.path/'state.json')
            directory=os.open(self.path,os.O_DIRECTORY)
            try: os.fsync(directory)
            finally: os.close(directory)
        finally:
            if os.path.exists(name): os.unlink(name)


def finish(store,ident,outcome,sha,rollback=False):
    state=store.read()
    state['attempts'][str(ident)]={'outcome':outcome,'sha':sha,'rollback':rollback,'time':int(time.time()),
                                 'phases':(state.get('active') or {}).get('phases',{})}
    state['reports'].append({'id':ident,'state':outcome,'sha':sha,'rollback':rollback})
    state['active']=None
    if outcome == 'error': state['paused']=True
    store.save(state)


def halt(runtime):
    try:
        (runtime.halt if hasattr(runtime,'halt') else runtime.stop)()
        return True
    except Exception:
        return False


def recover(store,runtime):
    state=store.read(); active=state.get('active')
    if active:
        # A crash can occur between a Docker side effect and its journal write. Never infer DB safety.
        if active['phase'] != 'prepare':
            halt(runtime)
            finish(store,active['id'],'error',None)
        else:
            finish(store,active['id'],'failure',state['current'].get('sha'))


def apply(store,runtime,ident,manifest):
    validate(manifest)
    state=store.read()
    if str(ident) in state['attempts']: return
    require(not state.get('paused') and not state.get('active'), 'operator intervention or active release')
    current=state['current']
    require(current['images'] == manifest['baseline'], 'baseline changed; new rehearsal required')
    state['active']={'id':ident,'manifest':manifest,'phase':'prepare','phases':{'prepare':time.time()}}; store.save(state)
    phase='prepare'
    def journal(next_phase):
        nonlocal phase
        phase=next_phase; value=store.read(); value['active']['phase']=phase
        value['active']['phases'][phase]=time.time(); store.save(value)
    try:
        runtime.prepare(manifest,current)
        if runtime.main_sha() != manifest['sha']:
            finish(store,ident,'inactive',current.get('sha')); return
        journal('stopping')
        runtime.stop()
        journal('backup'); runtime.backup(ident)
        journal('server'); runtime.start_server(manifest)
        require(runtime.migration_compatible(manifest),'unknown or incompatible migration state')
        journal('clients'); runtime.start_clients(manifest)
        journal('smoke'); runtime.smoke(manifest)
    except Exception:
        # Error details may contain credentials/personal data from a child process; never publish them.
        if phase == 'prepare': finish(store,ident,'failure',current.get('sha')); return
        if phase == 'stopping':
            # Includes sync forced kill or failed persistence. Cannot claim final backup was consistent.
            halt(runtime); finish(store,ident,'error',None); return
        try:
            require(halt(runtime),'writers could not be stopped')
            if phase not in ('backup',):
                require(runtime.migration_compatible(manifest),'migration safety unknown')
            runtime.start_server(current)
            runtime.start_clients(current)
            runtime.smoke(current)
        except Exception:
            halt(runtime); finish(store,ident,'error',None); return
        finish(store,ident,'failure',current.get('sha'),rollback=True); return
    state=store.read(); state['previous']=current; state['current']=manifest; store.save(state)
    finish(store,ident,'success',manifest['sha'])


def reports(store,github):
    while store.read()['reports']:
        state=store.read(); report=state['reports'][0]
        github.report(report)  # report failure leaves durable outbox; never repeats an application
        state['reports'].pop(0); store.save(state)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--config',default='/etc/moss-deploy/config.json')
    parser.add_argument('command',choices=['poll','dry-run','pause','resume','status','bootstrap'])
    args=parser.parse_args()
    from runtime import Runtime, GitHub, load_config
    config=load_config(Path(args.config)); store=Store(config['state_dir'])
    with store.lock():
        if args.command=='bootstrap':
            require(not (store.path/'state.json').exists(),'already initialized')
            baseline=json.loads(Path(config['bootstrap_file']).read_text())
            runtime=Runtime(config,GitHub(config)); runtime.bootstrap(baseline)
            store.save({'current':baseline,'previous':None,'active':None,'attempts':{},'reports':[],'paused':True})
            print('Baseline verified; paused until operator resumes'); return
        state=store.read()
        if args.command in ('pause','resume'):
            require(not state.get('active'),'cannot change pause during an active replacement')
            require(not (args.command=='resume' and any(x['outcome']=='error' for x in state['attempts'].values())),
                    'manual intervention recorded; repair and reviewed state reconciliation required')
            state['paused']=args.command=='pause'; store.save(state); return
        if args.command=='status':
            print(json.dumps({k:state.get(k) for k in ('paused','active','attempts')},sort_keys=True)); return
        github=GitHub(config); runtime=Runtime(config,github)
        if args.command=='dry-run':
            deployment=github.latest()
            require(deployment is not None,'no deployment request')
            manifest=validate(deployment['payload']); runtime.prepare(manifest,state['current'],pull=False)
            print(json.dumps({'deployment_id':deployment['id'],'sha':manifest['sha'],'images':manifest['images'],
                              'plan':['pull verified images','stop web/sync/server','consistent backup',
                                      'start server and verify migrations','start sync/web','authenticated public smoke']},sort_keys=True)); return
        recover(store,runtime)
        reports(store,github)
        if store.read().get('paused'): return
        deployment=github.latest()
        if deployment:
            ident=deployment['id']
            try:
                require(deployment.get('sha')==deployment.get('payload',{}).get('sha'),'deployment SHA mismatch')
                apply(store,runtime,ident,deployment['payload'])
            except Rejected:
                require(not store.read().get('active'),'active release needs reconciliation')
                finish(store,ident,'failure',store.read()['current'].get('sha'))
            reports(store,github)

if __name__=='__main__':
    try: main()
    except BlockingIOError: sys.exit(0)  # another timer/operator holds the shared lock
    except Exception:
        print('moss-deploy failed closed; inspect protected state and operator runbook',file=sys.stderr)
        sys.exit(1)
