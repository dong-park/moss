#!/usr/bin/env python3
"""GitHub-hosted release assembly; never runs on the production host."""
import json
import os
from pathlib import Path
import sys
import time
import urllib.request

from release import (REPOSITORY, canonical, digest, fingerprint, image_set, require,
                     validate, verify_evidence, verify_run)


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


if __name__=='__main__':
    command=sys.argv[1]
    if command=='config': print(json.dumps(public_config(),sort_keys=True))
    elif command=='image':
        service=os.environ['SERVICE']; image='ghcr.io/dong-park/moss-'+service+'@'+os.environ['DIGEST']
        image_set({s:(image if s==service else f'ghcr.io/dong-park/moss-{s}@sha256:'+'0'*64) for s in ('web','server','sync')})
        print(json.dumps({'service':service,'image':image}))
    elif command=='inputs': inputs()
    elif command=='request': request()
    else: raise RuntimeError('unsupported release command')
