#!/usr/bin/env python3
"""Stage reviewed, checksum-pinned amd64 tools; no credential or global config access."""
import argparse
import hashlib
import io
import os
from pathlib import Path
import platform
import subprocess
import tarfile
import tempfile
import urllib.request
import zipfile
from release import require

TOOLS = {
    'gh': ('https://github.com/cli/cli/releases/download/v2.103.3/gh_2.103.3_linux_amd64.tar.gz',
           '4c806978ffce1cec70853302a56d70ac6da4f19bae7adca4e1a8ab00633dd91d',
           'gh_2.103.3_linux_amd64/bin/gh'),
    'bun': ('https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-x64.zip',
            '951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f',
            'bun-linux-x64/bun'),
}


def stage(directory):
    require(platform.system()=='Linux' and platform.machine()=='x86_64','only reviewed linux/amd64 tools')
    directory=Path(directory);directory.mkdir(mode=0o700,parents=True,exist_ok=False)
    for name,(url,checksum,member) in TOOLS.items():
        with urllib.request.urlopen(url,timeout=120) as response: content=response.read(128*1024*1024+1)
        require(len(content)<=128*1024*1024 and hashlib.sha256(content).hexdigest()==checksum,'tool checksum mismatch')
        if name=='gh':
            with tarfile.open(fileobj=io.BytesIO(content),mode='r:gz') as archive:binary=archive.extractfile(member).read()
        else:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:binary=archive.read(member)
        target=directory/name
        with target.open('xb') as output:output.write(binary)
        target.chmod(0o700)
    gh_help=subprocess.check_output([str(directory/'gh'),'attestation','verify','--help'],text=True)
    for flag in ('--source-digest','--signer-digest','--source-ref','--signer-workflow','--deny-self-hosted-runners'):
        require(flag in gh_help,'provenance policy flag unavailable')
    require(subprocess.check_output([str(directory/'bun'),'--version'],text=True).strip()=='1.3.14','Bun version mismatch')
    print('Verified dedicated gh 2.103.3 policy flags and Bun 1.3.14')


if __name__=='__main__':
    parser=argparse.ArgumentParser();group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--check',action='store_true');group.add_argument('--install')
    args=parser.parse_args()
    if args.check:
        with tempfile.TemporaryDirectory(prefix='moss-tools-check-') as work:stage(Path(work)/'bin')
    else:
        require(os.geteuid()==0,'installation requires root')
        stage(Path(args.install))
