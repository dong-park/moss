#!/usr/bin/env python3
"""Root-installed pull deployer. Payloads are data; executable paths are installed policy."""
import argparse
import contextlib
import fcntl
import json
import re
import os
from pathlib import Path
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from release import (ROLLBACK_RESULTS, RUNNING_STATES, Rejected, diagnose, digest, explain, release_label,
                     require, validate)


class Busy(BlockingIOError):
    """The shared deploy lock is held by the timer or another operator command."""


BUSY_EXIT=75  # EX_TEMPFAIL
BUSY_MESSAGE=('moss-deploy busy: the timer or another operator command holds the deploy lock; '
              'nothing was changed. Retry shortly.')


class Store:
    def __init__(self,path):
        self.path=Path(path); self.path.mkdir(mode=0o700,parents=True,exist_ok=True)
    @contextlib.contextmanager
    def lock(self):
        with (self.path/'lock').open('a') as lock:
            try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError: raise Busy() from None  # only contention on THIS lock means busy
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


def serving(release):
    return {'state':'serving','release':release_label(release),'sha':release.get('sha'),'images':release['images']}


def halt(runtime):
    try:
        (runtime.halt if hasattr(runtime,'halt') else runtime.stop)()
        return True
    except Exception:
        return False


def stopped(runtime):
    """Observed state after a failed attempt: every writer stopped, or unverified when stopping failed."""
    return {'state':'stopped' if halt(runtime) else 'unverified','release':None}


def finish(store,ident,outcome,*,running,rollback='not_attempted',requested=None,commit=None,failure=None,proof=None):
    """Commit the terminal attempt, any new current/previous release, its outbox report and the
    cleared active marker in ONE atomic journal write. A crash leaves either the old or new state."""
    require(rollback in ROLLBACK_RESULTS and running.get('state') in RUNNING_STATES,'invalid terminal record')
    state=store.read()
    if commit: state.update(commit)
    baseline=release_label(state['current'])
    # `sha` is the observed running source SHA: None when writers are stopped/unverified or the
    # running baseline is the unnamed legacy bootstrap. It is never the requested SHA.
    state['attempts'][str(ident)]={'outcome':outcome,'sha':running.get('sha'),'requested':requested,'running':running,
        'rollback':rollback,'baseline':baseline,'time':int(time.time()),
        'phases':(state.get('active') or {}).get('phases',{})}
    report={'id':ident,'state':outcome,'sha':running.get('sha'),'requested':requested,'baseline':baseline,
        'running':{'state':running['state'],'release':running.get('release')},'rollback':rollback}
    if failure is not None:  # data-free diagnose() record plus phase; visible in status and the local outbox
        state['attempts'][str(ident)]['failure']=failure; report['failure']=failure
    if proof is not None:  # see proven_history(); only reconcile may use it, after live verification
        state['attempts'][str(ident)]['proven_history']=proof
    state['reports'].append(report)
    state['active']=None
    if outcome == 'error': state['paused']=True
    store.save(state)


PROOF_PHASES=('clients','smoke','rollback')
PROOF_KEYS={'sha256','kind','requested','evidence_sha256','baseline_images'}


def proven_history(runtime,manifest,current):
    """Proof that the candidate server became ready on EXACTLY a signed rehearsed history of `manifest`,
    bound to that request, its verified evidence digest and the current baseline images. None when the
    runtime did not observe an exact rehearsed history (never derived from payload claims)."""
    observed=getattr(runtime,'observed_migrations',None); evidence=getattr(runtime,'evidence',None)
    if not observed or not isinstance(evidence,dict): return None
    migrations=evidence.get('migrations') or {}
    kind='candidate' if observed==migrations.get('candidate') else 'baseline' if observed==migrations.get('baseline') else None
    if kind is None: return None
    return {'sha256':digest(observed),'kind':kind,'requested':manifest['sha'],
            'evidence_sha256':manifest['evidence_sha256'],'baseline_images':current['images']}


def proof_for(state,attempt):
    """The attempt's proof, only if it is well formed and still bound to this attempt and the CURRENT baseline."""
    proof=attempt.get('proven_history')
    if not (isinstance(proof,dict) and set(proof)==PROOF_KEYS and proof['kind'] in ('candidate','baseline')
            and isinstance(proof['sha256'],str) and re.fullmatch(r'[0-9a-f]{64}',proof['sha256'])
            and proof['requested']==attempt.get('requested') and proof['baseline_images']==state['current']['images']
            and (attempt.get('failure') or {}).get('phase') in PROOF_PHASES): return None
    return proof


def recover(store,runtime):
    state=store.read(); active=state.get('active')
    if active:
        # A crash can occur between a Docker side effect and its journal write. Never infer DB safety.
        requested=active.get('requested',(active.get('manifest') or {}).get('sha'))
        failure={'phase':active['phase'],'code':'interrupted'}
        # A crash before the candidate proof (prepare..server) never carries one: that schema stays unknown.
        proof=active.get('proven_history') if active['phase'] in PROOF_PHASES else None
        if active['phase'] != 'prepare':
            finish(store,active['id'],'error',running=stopped(runtime),requested=requested,failure=failure,proof=proof,
                   rollback='failed' if active['phase']=='rollback' else 'not_attempted')
        else:
            finish(store,active['id'],'failure',running=serving(state['current']),requested=requested,failure=failure)


def apply(store,runtime,ident,manifest):
    validate(manifest)
    state=store.read()
    if str(ident) in state['attempts']: return
    require(not state.get('paused') and not state.get('active'), 'operator intervention or active release')
    current=state['current']; requested=manifest['sha']
    require(current['images'] == manifest['baseline'], 'baseline changed; new rehearsal required')
    state['active']={'id':ident,'manifest':manifest,'requested':requested,'phase':'prepare',
                     'phases':{'prepare':time.time()}}; store.save(state)
    phase='prepare'
    def journal(next_phase,proven=None):
        nonlocal phase
        phase=next_phase; value=store.read(); value['active']['phase']=phase
        if proven is not None: value['active']['proven_history']=proven  # same atomic write as the phase change
        value['active']['phases'][phase]=time.time(); store.save(value)
    failure=None; proof=None
    def end(outcome,running,rollback='not_attempted',commit=None):
        finish(store,ident,outcome,running=running,rollback=rollback,requested=requested,failure=failure,commit=commit,
               proof=proof if outcome=='error' else None)
    try:
        runtime.prepare(manifest,current)
        if runtime.main_sha() != manifest['sha']:
            end('inactive',serving(current)); return
        journal('stopping')
        runtime.stop()
        journal('backup'); runtime.backup(ident)
        journal('server'); runtime.start_server(manifest)
        require(runtime.migration_compatible(manifest),'unknown or incompatible migration state')
        # Durable BEFORE clients/smoke/rollback: a later crash or failed rollback keeps what was proven.
        proof=proven_history(runtime,manifest,current)
        journal('clients',proof); runtime.start_clients(manifest)
        journal('smoke'); runtime.smoke(manifest)
    except Exception as error:
        # Child-process details may contain credentials/personal data: only a data-free record is kept.
        failure=dict(diagnose(error),phase=phase)
        if phase == 'prepare': end('failure',serving(current)); return
        if phase in ('stopping','server'):
            # stopping: sync forced kill or failed persistence; the final backup cannot be claimed consistent.
            # server: a failed/timed-out candidate start (Flyway) leaves the schema UNKNOWN even when history
            # rows still equal the baseline (transactional rollback vs partial non-transactional DDL).
            end('error',stopped(runtime)); return
        # backup: the candidate never started. clients/smoke: the candidate server became ready and its
        # history was proven compatible, so the previous app set may be restored.
        if not halt(runtime):
            failure['recovery']='writer stop unverified'; end('error',{'state':'unverified','release':None}); return
        if phase != 'backup' and not runtime.migration_compatible(manifest):
            proof=None  # contradicted: the live history moved after the proof
            failure['recovery']='migration history not rehearsed'; end('error',{'state':'stopped','release':None}); return
        journal('rollback')
        try:
            runtime.start_server(current)
            runtime.start_clients(current)
            runtime.smoke(current)
            # Record the ACTUAL post-rollback history (candidate migrations stay applied); it must still be
            # exactly a rehearsed history of this release, or nothing proven is serving.
            if not runtime.migration_compatible(manifest):
                proof=None; raise Rejected('post-rollback migration history not rehearsed')
            observed=getattr(runtime,'observed_migrations',None)
        except Exception as rollback_error:
            failure['rollback']=dict(diagnose(rollback_error),phase='rollback')
            end('error',stopped(runtime),'failed'); return
        end('failure',serving(current),'succeeded',
            commit={'current_migrations_sha256':digest(observed) if observed else None}); return
    observed=getattr(runtime,'observed_migrations',None)
    finish(store,ident,'success',running=serving(manifest),requested=requested,
           commit={'previous':current,'current':manifest,'current_evidence':getattr(runtime,'evidence',None),
                   'current_migrations_sha256':digest(observed) if observed else None})


PERMANENT_REPORT_ERRORS=(404,410,422)


def reports(store,github):
    """Deliver the durable outbox in order. A delivery failure is recorded on the entry (visible in
    status) and never deletes it. Permanently rejected entries move to `undeliverable` so they cannot
    block later results; any other failure is re-raised for the caller to decide policy."""
    index=0; failure=None
    while True:
        state=store.read()
        if index >= len(state['reports']): break
        report=state['reports'][index]
        try:
            github.report(report)
        except Exception as error:
            code=getattr(error,'code',None)
            permanent=isinstance(error,Rejected) or code in PERMANENT_REPORT_ERRORS
            delivery=dict(report.get('delivery') or {})
            delivery.update(failures=int(delivery.get('failures',0))+1,last_attempt=int(time.time()),
                            last_error=(f'http {code}' if isinstance(code,int) else type(error).__name__))
            report=dict(report,delivery=delivery)
            if permanent:
                state['reports'].pop(index); state.setdefault('undeliverable',[]).append(report)
            else:
                state['reports'][index]=report; index+=1; failure=failure or error
            store.save(state); continue
        state['reports'].pop(index); store.save(state)
    if failure is not None: raise failure


def deployment_manifest(deployment):
    """Shape-check untrusted API data before any attribute access; every defect is Rejected."""
    require(isinstance(deployment,dict) and type(deployment.get('id')) is int and deployment['id']>0,
            'invalid deployment record')
    payload=deployment.get('payload')
    require(isinstance(payload,dict),'deployment payload must be an object')
    validate(payload)
    require(deployment.get('sha')==payload['sha'],'deployment SHA mismatch')
    return payload


LOCAL_COMMANDS=('pause','status')


def deliver(store,github):
    try:
        reports(store,github); return True
    except Exception:
        return False  # entry and its delivery error stay durable and visible through status


def reconcile(store,runtime,ident):
    """Clear an `error` attempt only after live verification that the last verified release is what
    runs: approved topology, exact image IDs, the exact recorded Flyway history and authenticated smoke.
    It never edits migrations or restores data, and automation remains paused."""
    state=store.read(); attempt=state['attempts'].get(str(int(ident)))
    require(state.get('paused') and not state.get('active'),'reconcile only while paused and idle')
    require(attempt is not None and attempt['outcome']=='error' and not attempt.get('reconciled'),
            'no unreconciled error attempt')
    expected=state.get('current_migrations_sha256'); proof=proof_for(state,attempt)
    accepted={value for value in (expected,proof and proof['sha256']) if value}
    require(accepted,'no recorded migration history for the current release; manual review required')
    observed=runtime.observe(state['current'])
    require(observed['migrations_sha256'] in accepted,
            'live migration history differs from the last verified release; follow manual DB recovery')
    basis='current' if observed['migrations_sha256']==expected else 'attempt proof'
    attempt['reconciled']={'time':int(time.time()),'running':serving(state['current']),
                           'migrations_sha256':observed['migrations_sha256'],'basis':basis}
    # The verified live history becomes the current release's recorded history (same atomic write).
    state['current_migrations_sha256']=observed['migrations_sha256']
    store.save(state)


def main(args=None):
    """Raises on failure (Busy for lock contention); run() maps outcomes to exit codes."""
    args=args or parse()
    from runtime import Runtime, GitHub, load_config, load_local_config
    # pause/status need only the protected policy and journal: they keep working with an expired
    # token or low disk. Everything that talks to GitHub/Docker or re-enables automation preflights fully.
    config=(load_local_config if args.command in LOCAL_COMMANDS else load_config)(Path(args.config))
    store=Store(config['state_dir'])
    with store.lock():
        if args.command=='bootstrap':
            require(not (store.path/'state.json').exists(),'already initialized')
            baseline=json.loads(Path(config['bootstrap_file']).read_text())
            runtime=Runtime(config,GitHub(config)); runtime.bootstrap(baseline)
            store.save({'current':baseline,'previous':None,'active':None,'attempts':{},'reports':[],'paused':True,
                        'current_migrations_sha256':config['bootstrap_migrations_sha256']})
            print('Baseline verified; paused until operator resumes'); return
        state=store.read()
        if args.command in ('pause','resume'):
            require(not state.get('active'),'cannot change pause during an active replacement')
            require(not (args.command=='resume' and any(x['outcome']=='error' and not x.get('reconciled')
                                                          for x in state['attempts'].values())),
                    'manual intervention recorded; repair and run reconcile first')
            state['paused']=args.command=='pause'; store.save(state); return
        if args.command=='status':
            print(json.dumps({k:state.get(k) for k in ('paused','active','attempts','reports','undeliverable')},
                             sort_keys=True)); return
        github=GitHub(config); runtime=Runtime(config,github)
        if args.command=='reconcile':
            require(args.attempt is not None,'reconcile requires the error attempt ID')
            reconcile(store,runtime,args.attempt); print('Reconciled; automation remains paused'); return
        if args.command=='dry-run':
            deployment=github.latest()
            require(deployment is not None,'no deployment request')
            manifest=deployment_manifest(deployment); runtime.prepare(manifest,state['current'],pull=False)
            print(json.dumps({'deployment_id':deployment['id'],'sha':manifest['sha'],'images':manifest['images'],
                              'plan':['pull verified images','stop web/sync/server','consistent backup',
                                      'start server and verify migrations','start sync/web','authenticated public smoke']},sort_keys=True)); return
        recover(store,runtime)
        delivered=deliver(store,github)  # an undelivered result never blocks future valid requests
        if store.read().get('paused'):
            require(delivered,'result delivery pending'); return
        deployment=github.latest()
        if deployment:
            ident=deployment.get('id') if isinstance(deployment,dict) else None
            require(type(ident) is int and ident>0,'invalid deployment record')
            if str(ident) not in store.read()['attempts']:
                current=store.read()['current']
                try:
                    manifest=deployment_manifest(deployment)
                except Rejected as error:
                    # Invalid request data is terminal before any Docker action; writers are untouched.
                    finish(store,ident,'failure',running=serving(current),failure=dict(diagnose(error),phase='validate'))
                else:
                    try:
                        apply(store,runtime,ident,manifest)
                    except Rejected as error:
                        require(not store.read().get('active'),'active release needs reconciliation')
                        finish(store,ident,'failure',running=serving(current),requested=manifest['sha'],
                               failure=dict(diagnose(error),phase='validate'))
            delivered=deliver(store,github)
        require(delivered,'result delivery pending')

def parse(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument('--config',default='/etc/moss-deploy/config.json')
    parser.add_argument('command',choices=['poll','dry-run','pause','resume','status','bootstrap','reconcile'])
    parser.add_argument('attempt',type=int,nargs='?')
    return parser.parse_args(argv)


def run(argv=None):
    args=parse(argv)
    try:
        main(args)
    except Busy:
        if args.command=='poll': return 0  # the timer simply tries again next minute
        print(BUSY_MESSAGE,file=sys.stderr); return BUSY_EXIT
    except Exception as error:
        print('moss-deploy failed closed: '+explain(diagnose(error))+
              '. Inspect `status` and the operator runbook.',file=sys.stderr)
        return 1
    return 0


if __name__=='__main__':
    sys.exit(run())
