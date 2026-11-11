#!/usr/bin/env python3
"""Versioned data-only release contract and trusted GitHub run policy. No dependencies."""
import hashlib
import json
import re
from urllib.parse import urlsplit

SERVICES = ('web', 'server', 'sync')
REPOSITORY = 'dong-park/moss'
WORKFLOW = '.github/workflows/release.yml'
GATES = ('contract', 'ci / web-checks', 'ci / sync-checks', 'ci / mcp-checks', 'ci / deploy-checks', 'ci / server-checks',
         'audit / web', 'audit / server', 'build (web)', 'build (server)', 'build (sync)', 'rehearsal')
PUBLIC_KEYS = {'api_url', 'sync_url', 'google_client_id', 'terms_version'}

class Rejected(Exception):
    """Untrusted or incompatible input; never log its contents."""


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def require(condition, message):
    if not condition: raise Rejected(message)


def image_set(images):
    require(isinstance(images, dict) and set(images) == set(SERVICES), 'three fixed images required')
    for service, image in images.items():
        require(isinstance(image, str) and re.fullmatch(
            rf'ghcr\.io/dong-park/moss-{service}@sha256:[0-9a-f]{{64}}', image), 'untrusted image')


def validate(m):
    require(isinstance(m, dict) and len(canonical(m)) <= 16384, 'invalid payload size')
    require(set(m) == {'version','repository','environment','sha','platform','runtime_contract',
                      'config_sha256','run_id','run_attempt','images','baseline','evidence_sha256'}, 'unknown or missing fields')
    require(type(m['version']) is int and m['version'] == 1 and type(m['runtime_contract']) is int
            and m['runtime_contract'] == 1, 'unsupported contract')
    require(m['repository'] == REPOSITORY and m['environment'] == 'production', 'untrusted target')
    require(m['platform'] == 'linux/amd64', 'wrong platform')
    for field, length in [('sha',40),('config_sha256',64),('evidence_sha256',64)]:
        require(isinstance(m[field],str) and re.fullmatch(r'[0-9a-f]{'+str(length)+'}',m[field]), 'invalid digest')
    for field in ('run_id','run_attempt'):
        require(type(m[field]) is int and m[field] > 0, 'invalid run identity')
    image_set(m['images']); image_set(m['baseline'])
    return m


def fingerprint(values):
    require(isinstance(values,dict) and set(values) == PUBLIC_KEYS, 'public config keys mismatch')
    require(all(isinstance(v,str) and v and len(v) < 2048 and '\n' not in v for v in values.values()), 'missing public config')
    for key,scheme in (('api_url','https'),('sync_url','wss')):
        url=urlsplit(values[key])
        require(url.scheme==scheme and url.hostname and not url.username and not url.password
                and not url.query and not url.fragment,'credential-free TLS public URLs required')
    return digest(values)


def verify_run(m, run, jobs):
    validate(m)
    require(run.get('id') == m['run_id'] and run.get('run_attempt') == m['run_attempt'], 'run attempt mismatch')
    require(run.get('event') == 'push' and run.get('head_sha') == m['sha'] and run.get('head_branch') == 'main', 'untrusted run source')
    require(run.get('path') == WORKFLOW and run.get('repository',{}).get('full_name') == REPOSITORY, 'untrusted workflow')
    for gate in GATES:
        matches = [j for j in jobs if j.get('name') == gate]
        require(len(matches) == 1 and matches[0].get('status') == 'completed'
                and matches[0].get('conclusion') == 'success', 'required gate not successful: '+gate)


def verify_evidence(m, evidence):
    require(digest(evidence) == m['evidence_sha256'], 'evidence digest mismatch')
    require(evidence.get('status')=='passed' and not evidence.get('local_only',False), 'non-promotable rehearsal evidence')
    require(evidence.get('sha') == m['sha'] and evidence.get('images') == m['images']
            and evidence.get('baseline') == m['baseline']
            and evidence.get('config_sha256') == m['config_sha256'], 'evidence identity mismatch')
    checks = ('normal_auth','two_clients','graceful_persistence','reconnect','offline_edits',
              'backup_restore','previous_new_previous','old_client','failed_rollout','migration_failure')
    require(set(evidence.get('checks',{})) == set(checks)
            and all(evidence['checks'][key] is True for key in checks), 'incomplete image rehearsal')
    migrations=evidence.get('migrations')
    require(isinstance(migrations,dict) and set(migrations)=={'baseline','candidate'},'migration evidence required')
    for history in migrations.values():
        require(isinstance(history,list) and 0<len(history)<10000,'nonempty migration history required')
        versions=set()
        for row in history:
            require(isinstance(row,dict) and set(row)=={'version','checksum','success'},'migration metadata fields invalid')
            require(isinstance(row['version'],str) and row['version'] and row['version'] not in versions
                    and type(row['checksum']) is int and row['success'] is True,'migration metadata invalid')
            versions.add(row['version'])
    require(migrations['candidate'][:len(migrations['baseline'])]==migrations['baseline'],
            'previous migration history changed')
