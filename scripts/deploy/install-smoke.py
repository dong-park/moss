#!/usr/bin/env python3
"""Validate and install only the fixed members of a reviewed smoke runtime archive."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tarfile
from release import require

WRAPPER=b'#!/bin/sh\nset -eu\nexec "${BUN_BIN:-bun}" "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/smoke.mjs" "$@"\n'


def unpack(archive_path,directory):
    require(Path(archive_path).stat().st_size<=32*1024*1024,'oversized smoke runtime archive')
    with tarfile.open(archive_path,'r:gz') as archive:
        members=archive.getmembers()
        require({m.name for m in members}=={'smoke','smoke.mjs','manifest.json'} and len(members)==3,'unexpected archive members')
        require(all(m.isfile() and m.size<16*1024*1024 for m in members),'non-file or oversized archive member')
        content={m.name:archive.extractfile(m).read() for m in members}
    manifest=json.loads(content['manifest.json'])
    require(manifest.get('schemaVersion')==1 and manifest.get('self_contained') is True
            and manifest.get('runtime')=='bun' and manifest.get('entrypoint')=='smoke','incompatible smoke runtime')
    require(hashlib.sha256(content['smoke.mjs']).hexdigest()==manifest.get('bundle_sha256'),'bundle checksum mismatch')
    require(content['smoke']==WRAPPER,'unexpected runtime wrapper')
    for name,data in content.items():
        path=Path(directory)/name
        with path.open('xb') as output: output.write(data)
        path.chmod(0o700 if name=='smoke' else 0o600)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--archive',required=True);parser.add_argument('--directory',required=True)
    args=parser.parse_args();require(os.geteuid()==0,'administrative installation requires root')
    unpack(args.archive,args.directory)
