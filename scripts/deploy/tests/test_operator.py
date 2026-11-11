from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from agent import Store
from release import Rejected
from test_contract import manifest

# stdlib operator is already imported by Python: load our explicit module under a unique name.
import importlib.util
spec=importlib.util.spec_from_file_location('deploy_operator',Path(__file__).resolve().parents[1]/'control.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class RetryTest(unittest.TestCase):
    def test_no_arbitrary_sha_or_baseline_and_new_id(self):
        m=manifest()
        class API:
            def main_sha(self): return m['sha']
            def repo(self,path,body=None):
                if body:
                    self.body=body;return {'id':43}
                return dict(payload=m,environment='production',task='deploy')
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);old=manifest();old['images']=m['baseline']
            store.save(dict(current=old,paused=False,active=None))
            github=API();self.assertEqual(module.retry(store,github,42),43)
            self.assertEqual(github.body['payload'],m)
            github.main_sha=lambda:'f'*40
            with self.assertRaises(Rejected):module.retry(store,github,42)

if __name__=='__main__':unittest.main()
