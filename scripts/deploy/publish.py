#!/usr/bin/env python3
"""GitHub-hosted release assembly; never runs on the production host."""
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request

from release import (IMAGE_REPOSITORIES, PACKAGE_NAMES, PACKAGE_OWNER, REPOSITORY, SERVICES, Rejected, canonical,
                     digest, fingerprint, image_set, private_package, require, validate, verify_evidence, verify_run)

DENIED = (401, 403, 404)
RESPONSE_LIMIT = 1 << 20


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None  # 3xx surfaces as its status; never followed


_OPENER = urllib.request.build_opener(_NoRedirect)


def http_get(url, token=None):
    """One GET without redirects; returns (status, body). Transport failures carry no detail."""
    headers = {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'moss-release/1'}
    if token: headers['Authorization'] = 'Bearer ' + token
    try:
        with _OPENER.open(urllib.request.Request(url, headers=headers, method='GET'), timeout=30) as response:
            body = response.read(RESPONSE_LIMIT + 1)
            require(response.geturl() == url and len(body) <= RESPONSE_LIMIT, 'unexpected registry response')
            return response.status, body
    except urllib.error.HTTPError as error:
        error.close(); return error.code, b''
    except Rejected: raise
    except Exception: raise Rejected('registry request failed') from None


def _json(body):
    """Parsed JSON, or None (which every caller's shape check then rejects)."""
    try: return json.loads(body)
    except (ValueError, UnicodeDecodeError): return None


def registry(token, fetch=None):
    """Prove all three fixed packages exist, are PRIVATE and linked to REPOSITORY, and deny anonymous reads.
    Uses only the job's GITHUB_TOKEN; any missing/forbidden/redirected/public/mismatched state rejects, and
    nothing is ever created implicitly (no push happens before this passes)."""
    fetch = fetch or http_get
    require(isinstance(token, str) and token and token.isprintable() and ' ' not in token,
            'workflow GITHUB_TOKEN required for package privacy proof')
    for service in SERVICES:
        name = PACKAGE_NAMES[service]
        status, body = fetch(f'https://api.github.com/users/{PACKAGE_OWNER}/packages/container/{name}', token)
        require(status == 200, 'package metadata unavailable (pre-provision it privately; never created here): ' + service)
        private_package(service, _json(body))
        status, body = fetch(f'https://ghcr.io/token?scope=repository:{PACKAGE_OWNER}/{name}:pull&service=ghcr.io', None)
        if status in DENIED: continue
        require(status == 200, 'anonymous registry probe inconclusive: ' + service)
        anonymous = _json(body)
        require(isinstance(anonymous, dict) and isinstance(anonymous.get('token'), str) and anonymous['token'],
                'anonymous registry probe inconclusive: ' + service)
        status, _ = fetch(f'https://ghcr.io/v2/{PACKAGE_OWNER}/{name}/tags/list', anonymous['token'])
        require(status in DENIED, 'package is anonymously readable: ' + service)


def api(path,body=None):
    request=urllib.request.Request('https://api.github.com/repos/'+REPOSITORY+path,
        data=None if body is None else canonical(body),
        headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json',
                 'X-GitHub-Api-Version':'2022-11-28','User-Agent':'moss-release/1'})
    with urllib.request.urlopen(request,timeout=30) as response: return json.load(response)


def public_config():
    value={key:os.environ[env] for key,env in [('api_url','API_URL'),('sync_url','SYNC_URL'),
          ('google_client_id','GOOGLE_CLIENT_ID'),('terms_version','TERMS_VERSION')]}
    fingerprint(value); return value


def find_baseline():
    """Newest successful production deploy/bootstrap/rollback payload, or None when none exists."""
    for page in range(1,101):
        deployments=api(f'/deployments?environment=production&per_page=100&page={page}')
        for deployment in deployments:
            if deployment['task'] not in ('deploy','bootstrap','rollback'): continue
            statuses=api(f"/deployments/{deployment['id']}/statuses?per_page=1")
            if statuses and statuses[0]['state']=='success':
                payload=deployment['payload']
                require(isinstance(payload,dict),'invalid baseline payload'); image_set(payload.get('images'))
                payload.pop('rollback_proof',None)
                require(payload.get('environment','production')=='production','wrong baseline environment')
                return payload
        if len(deployments)<100: break
    return None


def baseline(wait_seconds=0,clock=time.monotonic,sleep=time.sleep):
    """Only when NO successful baseline exists yet (first release) wait a bounded time for the
    operator's bootstrap registration. An existing but invalid/mismatched baseline fails at once;
    no baseline is ever invented."""
    require(type(wait_seconds) is int and 0<=wait_seconds<=900,'baseline wait must be 0..900 seconds')
    deadline=clock()+wait_seconds
    while True:
        found=find_baseline()
        if found is not None: return found
        if clock()>=deadline:
            raise RuntimeError('No successful baseline; complete explicit bootstrap registration first')
        print('Waiting for the operator bootstrap baseline registration (bounded)',flush=True)
        sleep(min(30,max(1,deadline-clock())))


def inputs():
    images={}
    for file in Path('images').glob('*/image.json'):
        value=json.loads(file.read_text()); service=value['service']
        require(service not in images,'duplicate image artifact'); images[service]=value['image']
    image_set(images)
    previous=baseline(int(os.environ.get('BASELINE_WAIT_SECONDS','0'))); config=public_config()
    require(previous['config_sha256']==fingerprint(config),'baseline config drift requires operator reconciliation')
    Path('rehearsal-input.json').write_bytes(canonical({'sha':os.environ['GITHUB_SHA'],'images':images,
        'baseline':previous['images'],'baseline_sha':previous.get('sha'),
        'legacy_baseline':previous.get('bootstrap',False),'public_config':config,'config_sha256':fingerprint(config)}))


def request():
    evidence=json.loads(Path('evidence.json').read_text())
    m={'version':1,'repository':REPOSITORY,'environment':'production','sha':os.environ['GITHUB_SHA'],
       'platform':'linux/amd64','runtime_contract':1,'config_sha256':evidence['config_sha256'],
       'run_id':int(os.environ['GITHUB_RUN_ID']),'run_attempt':int(os.environ['GITHUB_RUN_ATTEMPT']),
       'images':evidence['images'],'baseline':evidence['baseline'],'evidence_sha256':digest(evidence)}
    validate(m); verify_evidence(m,evidence)
    run=api(f"/actions/runs/{m['run_id']}/attempts/{m['run_attempt']}")
    jobs=[]
    for page in range(1,101):
        data=api(f"/actions/runs/{m['run_id']}/attempts/{m['run_attempt']}/jobs?per_page=100&page={page}")['jobs']
        jobs.extend(data)
        if len(data)<100: break
    verify_run(m,run,jobs)
    require(api('/git/ref/heads/main')['object']['sha']==m['sha'],'main moved; stale request not created')
    deployment=api('/deployments',{'ref':m['sha'],'task':'deploy','environment':'production',
        'auto_merge':False,'required_contexts':[],'production_environment':True,'transient_environment':False,
        'description':'Verified three-image release '+m['sha'],'payload':m})
    ident=deployment['id']
    summary=Path(os.environ['GITHUB_STEP_SUMMARY'])
    with summary.open('a') as output:
        output.write(f"Deployment {ident}; requested `{m['sha']}`\n\n")
        for service,image in m['images'].items(): output.write(f'- {service}: `{image}`\n')
    deadline=time.monotonic()+30*60
    while time.monotonic()<deadline:
        statuses=api(f'/deployments/{ident}/statuses?per_page=1')
        if statuses:
            result=statuses[0]
            if result['state'] in ('success','failure','error','inactive'):
                with summary.open('a') as output: output.write(f"\nHost result: **{result['state']}**. {result['description']}\n")
                require(result['state']=='success','host deployment did not succeed')
                return
        time.sleep(15)
    # Do not label a timed-out but potentially active replacement as terminal on the host's behalf.
    with summary.open('a') as output: output.write('\nUNVERIFIED: host final result not received within 30 minutes. Inspect deployment history.\n')
    raise RuntimeError('Host result timed out; request creation is not deployment success')


def main(argv):
    command=argv[0] if argv else ''
    if command=='registry':
        try: registry(os.environ.get('GH_TOKEN',''))
        except Exception as error:  # fixed messages only: never the token, response bodies or exception details
            print('Rejected: '+(str(error) if isinstance(error,Rejected) else 'package privacy proof failed'),file=sys.stderr)
            return 1
        print('All three fixed GHCR packages are private, linked to '+REPOSITORY+', and deny anonymous reads')
    elif command=='config': print(json.dumps(public_config(),sort_keys=True))
    elif command=='image':
        service=os.environ['SERVICE']; image=IMAGE_REPOSITORIES[service]+'@'+os.environ['DIGEST']
        image_set({s:(image if s==service else IMAGE_REPOSITORIES[s]+'@sha256:'+'0'*64) for s in SERVICES})
        print(json.dumps({'service':service,'image':image}))
    elif command=='inputs': inputs()
    elif command=='request': request()
    else: raise RuntimeError('unsupported release command')
    return 0


if __name__=='__main__': sys.exit(main(sys.argv[1:]))
