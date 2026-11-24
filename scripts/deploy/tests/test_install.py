import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from release import Rejected
spec=importlib.util.spec_from_file_location('install_smoke',Path(__file__).resolve().parents[1]/'install-smoke.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class InstallTest(unittest.TestCase):
    def test_unknown_members_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            archive=Path(directory)/'test.tar.gz';out=Path(directory)/'out';out.mkdir()
            with tarfile.open(archive,'w:gz') as tar:
                entry=tarfile.TarInfo('../escape');entry.size=1;tar.addfile(entry,io.BytesIO(b'x'))
            with self.assertRaises(Rejected):module.unpack(archive,out)
            self.assertEqual(list(out.iterdir()),[])
    def test_bundle_corruption_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            archive=Path(directory)/'test.tar.gz';out=Path(directory)/'out';out.mkdir()
            content={'smoke':module.WRAPPER,'smoke.mjs':b'tampered',
                     'manifest.json':json.dumps(dict(schemaVersion=1,self_contained=True,runtime='bun',entrypoint='smoke',bundle_sha256='0'*64)).encode()}
            with tarfile.open(archive,'w:gz') as tar:
                for name,data in content.items():
                    entry=tarfile.TarInfo(name);entry.size=len(data);tar.addfile(entry,io.BytesIO(data))
            with self.assertRaises(Rejected):module.unpack(archive,out)
            self.assertEqual(list(out.iterdir()),[])
