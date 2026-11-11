import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import runtime
from release import Rejected

class RuntimeTest(unittest.TestCase):
    def test_failed_sync_stop_still_stops_server(self):
        rt=runtime.Runtime({'docker_config':'/tmp/test-only'},None)
        rt.container=lambda name:name
        rt.inspect=lambda name:{'state':{'Running':False,'ExitCode':1 if name=='sync' else 0,'OOMKilled':False}}
        calls=[]
        with patch.object(runtime,'command',side_effect=lambda argv,**kwargs:calls.append(argv) or b''):
            with self.assertRaises(Rejected):rt.stop()
        self.assertEqual([call[-1] for call in calls],['web','sync','server'])
    def test_preflight_compares_runtime_public_values(self):
        # A matching controller fingerprint cannot mask a different .env used by server.
        rt=runtime.Runtime({'docker_config':'/tmp/test-only','public_config':{
            'api_url':'https://moss.test','sync_url':'wss://sync.test','google_client_id':'id','terms_version':'v1'}},None)
        rendered={'services':{'server':{'environment':{'PUBLIC_BASE_URL':'https://evil.test','GOOGLE_CLIENT_ID':'id','MOSS_TERMS_VERSION':'v1'}},
                             'sync':{'environment':{'PUBLIC_BASE_URL':'https://moss.test'}}}}
        with self.assertRaises(Rejected):rt.verify_public_environment(rendered)

if __name__=='__main__':unittest.main()
