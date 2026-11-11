import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from test_contract import manifest

spec = importlib.util.spec_from_file_location('agent', Path(__file__).resolve().parents[1] / 'agent.py')
agent = importlib.util.module_from_spec(spec); spec.loader.exec_module(agent)

class FakeRuntime:
    def __init__(self): self.calls=[]; self.fail=None; self.migration_safe=True; self.main='a'*40
    def prepare(self,m,current): self.calls.append('prepare')
    def main_sha(self): return self.main
    def stop(self): self.calls.append('stop')
    def backup(self,attempt): self.calls.append('backup'); self.error('backup')
    def start_server(self,m): self.calls.append('server'); self.error('server')
    def migration_compatible(self,m): self.calls.append('migrations'); return self.migration_safe
    def start_clients(self,m): self.calls.append('clients'); self.error('clients')
    def smoke(self,m): self.calls.append('smoke'); self.error('smoke')
    def error(self,stage):
        if self.fail == stage: raise RuntimeError('injected failure')

class AgentTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.store=agent.Store(Path(self.tmp.name)); self.rt=FakeRuntime()
        self.m=manifest(); self.old=manifest(); self.old['images']=self.m['baseline']; self.old['sha']='d'*40
        self.store.save({'current':self.old,'attempts':{},'reports':[],'active':None})
    def tearDown(self): self.tmp.cleanup()
    def run_release(self): return agent.apply(self.store,self.rt,42,self.m)
    def test_idempotent_and_report_outage_does_not_redeploy(self):
        self.run_release(); calls=list(self.rt.calls); self.run_release()
        self.assertEqual(calls,self.rt.calls); self.assertEqual(self.store.read()['current'],self.m)
        self.assertEqual(self.store.read()['reports'][-1]['state'],'success')
    def test_stale_no_writer_stop(self):
        self.rt.main='e'*40; self.run_release(); self.assertNotIn('stop',self.rt.calls)
        self.assertEqual(self.store.read()['attempts']['42']['outcome'],'inactive')
    def test_backup_failure_restarts_old_no_candidate(self):
        self.rt.fail='backup'; self.run_release()
        self.assertEqual(self.store.read()['current'],self.old)
        self.assertNotIn('clients',self.rt.calls[:self.rt.calls.index('server')])
        self.assertEqual(self.store.read()['attempts']['42']['outcome'],'failure')
    def test_failed_new_clients_rollback_on_proven_migrations(self):
        self.rt.fail='clients'; self.run_release()
        self.assertEqual(self.store.read()['current'],self.old)
        self.assertEqual(self.store.read()['attempts']['42']['outcome'],'error') # rollback also fails => manual
    def test_unknown_migration_stops_writers_no_rollback(self):
        self.rt.fail='server'; self.rt.migration_safe=False; self.run_release()
        self.assertEqual(self.rt.calls.count('server'),1)
        self.assertEqual(self.store.read()['attempts']['42']['outcome'],'error')
        calls=list(self.rt.calls); self.run_release(); self.assertEqual(calls,self.rt.calls)
    def test_crash_after_stop_requires_intervention(self):
        state=self.store.read(); state['active']={'id':42,'phase':'server','manifest':self.m}; self.store.save(state)
        agent.recover(self.store,self.rt)
        self.assertEqual(self.rt.calls,['stop'])
        self.assertTrue(self.store.read()['paused'])
    def test_success_outbox_retry_does_not_reapply(self):
        self.run_release()
        class Offline:
            def report(self,value): raise OSError('offline')
        with self.assertRaises(OSError): agent.reports(self.store,Offline())
        self.assertEqual(len(self.store.read()['reports']),1)
        calls=list(self.rt.calls)
        class Online:
            def report(self,value): pass
        agent.reports(self.store,Online()); self.run_release()
        self.assertEqual(calls,self.rt.calls); self.assertEqual(self.store.read()['reports'],[])

    def test_prepare_failure_preserves_running_apps(self):
        def broken(*args): raise RuntimeError('expired registry credentials')
        self.rt.prepare=broken; self.run_release()
        self.assertNotIn('stop',self.rt.calls)
        self.assertEqual(self.store.read()['attempts']['42']['outcome'],'failure')

    def test_lock_excludes_manual_and_timer(self):
        with self.store.lock():
            with self.assertRaises(BlockingIOError):
                with agent.Store(Path(self.tmp.name)).lock(): pass

if __name__=='__main__': unittest.main()
