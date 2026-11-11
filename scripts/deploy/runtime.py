"""Fixed local Docker policy and least-scope GitHub API client (stdlib + openssl + gh)."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile
import time
import urllib.request
import zipfile

from release import (SERVICES, REPOSITORY, WORKFLOW, Rejected, canonical, digest,
                     fingerprint, image_set, require, validate, verify_evidence, verify_run)


def command(args, *, env=None, input=None, timeout=180):
    result=subprocess.run(args,input=input,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    require(result.returncode==0,'external command failed')
    return result.stdout


def protected(path, directory=False):
    path=Path(path)
    info=path.lstat()
    require(not stat.S_ISLNK(info.st_mode) and info.st_uid==0 and not info.st_mode & 0o022,
            'operator files must be root owned, non-symlink and not group/world writable')
    require(info.st_mode & 0o077 == 0 if not directory else True,'configuration must be private')
    return path


def load_config(path):
    protected(path)
    config=json.loads(path.read_text())
    for key in ('install_dir','state_dir','app_env','bootstrap_file','smoke_config','docker_config'):
        require(Path(config[key]).is_absolute(),'fixed absolute configuration paths required')
    for key in ('app_env','bootstrap_file','smoke_config'):
        protected(config[key])
    require(config.get('auth_mode') in ('app','token'),'explicit GitHub auth mode required')
    if config['auth_mode']=='app': protected(config['app_private_key'])
    else:
        protected(config['token_file'])
        require(type(config.get('token_expires_at')) is int and config['token_expires_at']>time.time(),
                'scoped bearer token expiration absent or expired')
    protected(config['install_dir'],directory=True)
    require(config.get('project')=='moss','production Compose project must remain moss')
    require(config.get('repository')==REPOSITORY,'fixed repository')
    fingerprint(config['public_config'])
    require(shutil.disk_usage(config['state_dir']).free >= config['minimum_free_bytes'],'insufficient free disk')
    # The service must be installed outside the application checkout; every executable is admin owned.
    for file in Path(config['install_dir']).rglob('*'):
        info=file.lstat()
        require(info.st_uid==0 and not info.st_mode & 0o022 and not file.is_symlink(),'untrusted installation file')
    return config


class GitHub:
    def __init__(self,config): self.config=config; self.token=None; self.expires=0
    def request(self,path,body=None,token=None):
        require(path.startswith('/') and not path.startswith('//'),'invalid API path')
        if token is None: token=self.credentials()
        req=urllib.request.Request('https://api.github.com'+path,
            data=None if body is None else canonical(body),
            headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json',
                     'X-GitHub-Api-Version':'2022-11-28','User-Agent':'moss-deploy/1'},
            method='GET' if body is None else 'POST')
        with urllib.request.urlopen(req,timeout=30) as response:
            return json.load(response)
    def credentials(self):
        if self.config['auth_mode']=='token':
            require(self.config['token_expires_at']>time.time()+60,'scoped bearer token expired or expiring')
            token=Path(self.config['token_file']).read_text().strip()
            require(token and '\n' not in token,'invalid scoped bearer token file')
            return token  # reload protected file on every request to permit rotation without restart
        if self.token and time.time()<self.expires: return self.token
        def encoded(value): return base64.urlsafe_b64encode(canonical(value)).rstrip(b'=')
        now=int(time.time())
        payload=encoded({'alg':'RS256','typ':'JWT'})+b'.'+encoded({'iat':now-60,'exp':now+540,'iss':self.config['app_id']})
        signature=command(['openssl','dgst','-sha256','-sign',self.config['app_private_key']],input=payload)
        jwt=(payload+b'.'+base64.urlsafe_b64encode(signature).rstrip(b'=')).decode()
        response=self.request('/app/installations/'+str(int(self.config['installation_id']))+'/access_tokens',
                              {'repositories':['moss'],'permissions':{'contents':'read','actions':'read',
                               'deployments':'write','attestations':'read'}},token=jwt)
        self.token=response['token']; self.expires=now+3000
        return self.token
    def repo(self,path,body=None): return self.request('/repos/'+REPOSITORY+path,body)
    def pages(self,path,key=None):
        result=[]
        for page in range(1,101):
            data=self.repo(path+('&' if '?' in path else '?')+f'per_page=100&page={page}')
            values=data if key is None else data[key]; result.extend(values)
            if len(values)<100: return result
        raise Rejected('pagination limit exceeded')
    def main_sha(self): return self.repo('/git/ref/heads/main')['object']['sha']
    def latest(self):
        deployments=self.repo('/deployments?environment=production&task=deploy&per_page=30')
        for deployment in deployments:
            # Never trust server-side filtering alone.
            if deployment.get('environment')!='production' or deployment.get('task')!='deploy': continue
            statuses=self.repo(f"/deployments/{deployment['id']}/statuses?per_page=1")
            if statuses and statuses[0]['state'] in ('success','failure','error','inactive'): continue
            return deployment
        return None
    def report(self,value):
        self.repo(f"/deployments/{int(value['id'])}/statuses",{'state':value['state'],
            'environment':'production','auto_inactive':False,
            'description':f"running {value.get('sha') or 'unknown bootstrap'}; rollback={value['rollback']}"})
    def verify(self,manifest,directory):
        run=self.repo(f"/actions/runs/{manifest['run_id']}/attempts/{manifest['run_attempt']}")
        jobs=self.pages(f"/actions/runs/{manifest['run_id']}/attempts/{manifest['run_attempt']}/jobs",'jobs')
        verify_run(manifest,run,jobs)
        artifacts=self.pages(f"/actions/runs/{manifest['run_id']}/artifacts",'artifacts')
        matches=[a for a in artifacts if a['name']==f"release-evidence-{manifest['run_attempt']}" and not a['expired']]
        require(len(matches)==1,'missing unique release evidence')
        # GitHub archive redirect can point to object storage; urllib removes Authorization on cross-host redirects below.
        class Redirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,req,fp,code,msg,headers,newurl):
                redirected=super().redirect_request(req,fp,code,msg,headers,newurl)
                if redirected: redirected.remove_header('Authorization')
                return redirected
        url='https://api.github.com/repos/'+REPOSITORY+f"/actions/artifacts/{matches[0]['id']}/zip"
        req=urllib.request.Request(url,headers={'Authorization':'Bearer '+self.credentials(),'User-Agent':'moss-deploy/1'})
        archive=Path(directory)/'evidence.zip'
        with urllib.request.build_opener(Redirect()).open(req,timeout=60) as response:
            content=response.read(1048577)
        require(len(content)<=1048576,'oversized evidence archive'); archive.write_bytes(content)
        with zipfile.ZipFile(archive) as zipped:
            require(zipped.namelist()==['evidence.json'],'unexpected evidence archive content')
            info=zipped.getinfo('evidence.json'); require(info.file_size<131072,'oversized evidence')
            evidence_file=Path(directory)/'evidence.json'; evidence_file.write_bytes(zipped.read(info))
        self.attest(str(evidence_file),manifest)
        evidence=json.loads(evidence_file.read_text()); verify_evidence(manifest,evidence)
        return evidence
    def attest(self,subject,manifest):
        env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'HOME':self.config['state_dir'],
             'GH_TOKEN':self.credentials(),'DOCKER_CONFIG':self.config['docker_config'],
             'GH_CONFIG_DIR':str(Path(self.config['state_dir'])/'gh'),
             'XDG_STATE_HOME':self.config['state_dir'],
             'XDG_CACHE_HOME':str(Path(self.config['state_dir'])/'cache'),
             'GH_PROMPT_DISABLED':'1','GH_NO_UPDATE_NOTIFIER':'1'}
        command([str(Path(self.config['install_dir'])/'bin/gh'),'attestation','verify',subject,'--repo',REPOSITORY,
                 '--signer-workflow',REPOSITORY+'/'+WORKFLOW,'--signer-digest',manifest['sha'],
                 '--source-ref','refs/heads/main','--source-digest',manifest['sha'],
                 '--deny-self-hosted-runners'],env=env,timeout=180)


class Runtime:
    def __init__(self,config,github):
        self.config=config; self.github=github; self.evidence=None; self.before=None
        self.current=None; self.selected=None
        self.env={k:os.environ[k] for k in ('PATH','HOME') if k in os.environ}
        self.env['DOCKER_CONFIG']=config['docker_config']
        if config.get('install_dir'): self.env['PATH']=str(Path(config['install_dir'])/'bin')+':'+self.env.get('PATH','/usr/bin:/bin')
    def main_sha(self): return self.github.main_sha()
    def compose(self,*args,release=None):
        release=release or self.selected or self.current
        require(release is not None,'no fixed image selection')
        with tempfile.TemporaryDirectory(prefix='moss-compose-') as directory:
            env_file=Path(directory)/'release.env'
            env_file.write_text('\n'.join([f'{s.upper()}_IMAGE={release["images"][s]}' for s in SERVICES])+
                                '\nRELEASE_SHA='+str(release.get('sha') or 'unknown-bootstrap')+'\n')
            return command(['docker','compose','--project-name',self.config['project'],
                            '--env-file',self.config['app_env'],'--env-file',str(env_file),
                            '-f',str(Path(self.config['install_dir'])/'deploy/compose.runtime.yml'),*args],
                           env=self.env,timeout=600)
    def container(self,service):
        raw=command(['docker','ps','-aq','--filter','label=com.docker.compose.project='+self.config['project'],
                     '--filter','label=com.docker.compose.service='+service],env=self.env).decode().split()
        require(len(raw)==1,'expected one existing container: '+service)
        return raw[0]
    def inspect(self,service):
        projection='{{json .State}}\n{{json .Mounts}}\n{{json .NetworkSettings.Networks}}\n{{json .Image}}\n{{json .HostConfig.PortBindings}}'
        values=command(['docker','inspect','--format',projection,self.container(service)],env=self.env).decode().splitlines()
        state,mounts,networks,image,ports=map(json.loads,values)
        return {'state':state,'mounts':mounts,'networks':networks,'image':image,'ports':ports}
    METADATA_SQL=(b"SELECT coalesce(json_agg(t), '[]'::json) FROM "
                  b"(SELECT version, checksum, success FROM flyway_schema_history ORDER BY installed_rank) t;\n")
    def metadata(self):
        # SQL travels on stdin; the fixed shell script only expands the container's own
        # credential variables, so no SQL quoting is nested inside shell or Python quoting.
        result=command(['docker','exec','-i',self.container('postgres'),'sh','-c',
                        'exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
                       input=self.METADATA_SQL,env=self.env)
        try: value=json.loads(result)
        except ValueError: raise Rejected('Flyway metadata unreadable') from None
        require(isinstance(value,list) and value,'Flyway state unknown or empty')
        for row in value:
            require(isinstance(row,dict) and set(row)=={'version','checksum','success'}
                    and isinstance(row['version'],str) and row['version']
                    and (row['checksum'] is None or type(row['checksum']) is int)
                    and row['success'] is True,'Flyway state unknown or failed')
        return value
    def topology(self):
        result={}
        for service in (*SERVICES,'postgres'):
            value=self.inspect(service)
            result[service]={'mounts':sorted([m['Type'],m.get('Name',''),m['Destination']] for m in value['mounts']),
                             'networks':sorted(value['networks']), 'ports':value['ports']}
            if service=='postgres': result[service]['image']=value['image']
        return result
    def bootstrap(self,baseline):
        require(set(baseline)=={'images','sha','bootstrap','config_sha256'},'invalid bootstrap contract')
        require(baseline['sha'] is None and baseline['bootstrap'] is True,'unknown baseline source must remain unknown')
        image_set(baseline['images'])
        require(baseline['config_sha256']==fingerprint(self.config['public_config']),'bootstrap config mismatch')
        require(self.topology()==self.config['topology'],'bootstrap topology mismatch')
        require(digest(self.metadata())==self.config['bootstrap_migrations_sha256'],'bootstrap migration mismatch')
        for service,image in baseline['images'].items():
            identity=command(['docker','image','inspect',image,'--format','{{.Id}}'],env=self.env).decode().strip()
            require(identity==self.inspect(service)['image'],'bootstrap registry mapping not current image ID')
    def smoke_credentials(self):
        value=json.loads(Path(self.config['smoke_config']).read_text())
        require(value.get('dedicated_account') is True,'dedicated smoke account acknowledgment required')
        require(all(isinstance(value.get(key),str) and value[key].strip() for key in ('email','password','board_id','web_url')),
                'dedicated smoke credentials/board missing')
        require(value.get('public_config')==self.config['public_config'],'smoke public config mismatch')
        return value
    def prepare(self,m,current,pull=True):
        validate(m); self.current=current
        self.smoke_credentials()
        self.verify_public_environment(json.loads(self.compose('config','--format','json',release=m)))
        require(m['config_sha256']==fingerprint(self.config['public_config'])==current['config_sha256'],'public config mismatch')
        require(self.topology()==self.config['topology'],'runtime topology differs from approved baseline')
        for service,image in current['images'].items():
            identity=command(['docker','image','inspect',image,'--format','{{.Id}}'],env=self.env).decode().strip()
            require(identity==self.inspect(service)['image'],'running baseline image mismatch')
        with tempfile.TemporaryDirectory(prefix='moss-evidence-') as directory:
            self.evidence=self.github.verify(m,directory)
        self.before=self.metadata()
        require(self.before==self.evidence['migrations']['baseline'],'live migration baseline differs from rehearsal')
        if pull:
            # Prove dedicated login/board/public routes while the baseline is still serving.
            self.smoke(current)
            for service,image in m['images'].items():
                self.github.attest('oci://'+image,m)
                command(['docker','pull','--platform','linux/amd64',image],env=self.env,timeout=600)
                data=json.loads(command(['docker','image','inspect',image,'--format',
                    '{{json .Architecture}}\n{{json .Os}}\n{{json .Config.Labels}}'],env=self.env).decode().splitlines()[2])
                require(data.get('org.opencontainers.image.revision')==m['sha']
                        and data.get('org.opencontainers.image.source')=='https://github.com/'+REPOSITORY,'image source label mismatch')
                platform=command(['docker','image','inspect',image,'--format','{{.Os}}/{{.Architecture}}'],env=self.env).decode().strip()
                require(platform==m['platform'],'image platform mismatch')
            # Verify rollback images remain available without a registry dependency during downtime.
            for image in current['images'].values(): command(['docker','image','inspect',image,'--format','{{.Id}}'],env=self.env)
            require(shutil.disk_usage(self.config['state_dir']).free>=self.config['minimum_free_bytes'],'disk insufficient after pulls')

    def prepare_rollback(self,current,previous):
        validate(current); self.current=current
        self.smoke_credentials()
        require(current['baseline']==previous['images'],'recorded rollback images differ from rehearsal')
        require(self.topology()==self.config['topology'],'runtime topology differs from baseline')
        require(current['config_sha256']==previous['config_sha256']==fingerprint(self.config['public_config']),
                'configuration rollback unsupported')
        with tempfile.TemporaryDirectory(prefix='moss-rollback-proof-') as directory:
            self.evidence=self.github.verify(current,directory)
        self.before=self.metadata()
        require(self.migration_compatible(current),'DB no longer matches rehearsed compatibility state')
        for service in SERVICES:
            identity=command(['docker','image','inspect',current['images'][service],'--format','{{.Id}}'],env=self.env).decode().strip()
            require(identity==self.inspect(service)['image'],'running release differs from recorded current')
            command(['docker','image','inspect',previous['images'][service],'--format','{{.Id}}'],env=self.env)
            if not previous.get('bootstrap'):
                self.github.attest('oci://'+previous['images'][service],previous)
    def _stop(self,strict):
        errors=[]
        for service in ('web','sync','server'):
            try:
                was_running=self.inspect(service)['state']['Running']
                started=int(time.time())
                command(['docker','stop','--time','90',self.container(service)],env=self.env,timeout=120)
                state=self.inspect(service)['state']
                require(not state['Running'],'writer is still running')
                if strict:
                    allowed=(0,) if service=='sync' else (0,143)
                    require(state['ExitCode'] in allowed and not state['OOMKilled'],'writer failed graceful stop')
                    if service=='sync' and was_running and self.current and not self.current.get('bootstrap'):
                        raw=command(['docker','logs','--since',str(started),self.container('sync')],env=self.env)
                        markers=[]
                        for line in raw.splitlines():
                            try: markers.append(json.loads(line))
                            except (ValueError,UnicodeError): pass
                        require(any(isinstance(mark,dict) and mark.get('event')=='moss_sync_shutdown_complete'
                                    and mark.get('sha')==self.current['sha'] for mark in markers),
                                'sync durable drain marker absent')
            except Exception:
                errors.append(service)  # still attempt to stop every writer
        require(not errors,'one or more writers failed to stop safely')
    def stop(self): self._stop(strict=True)
    def halt(self): self._stop(strict=False)
    def verify_public_environment(self,rendered):
        public=self.config['public_config']; server=rendered['services']['server']['environment']
        require(server['PUBLIC_BASE_URL']==public['api_url']
                and server['GOOGLE_CLIENT_ID']==public['google_client_id']
                and server['MOSS_TERMS_VERSION']==public['terms_version']
                and rendered['services']['sync']['environment']['PUBLIC_BASE_URL']==public['api_url'],
                'server/sync public configuration differs from immutable web build')
    def backup(self,attempt):
        # Separate helper operates on stopped-app volumes; existing online cron remains separate.
        require(all(not self.inspect(s)['state']['Running'] for s in SERVICES),'writers must be stopped')
        backup_dir=Path(self.config['backup_dir'])/str(int(attempt)); backup_dir.mkdir(mode=0o700,parents=True,exist_ok=False)
        # Stream again directly to disk, not logs or memory. Backups contain credentials/personal content.
        release=self.current
        with tempfile.TemporaryDirectory(prefix='moss-backup-') as directory:
            # pg_dump is run via the known container, with no database credentials on argv.
            with (backup_dir/'database.dump').open('xb') as output:
                proc=subprocess.run(['docker','exec',self.container('postgres'),'sh','-c',
                     'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom'],
                     stdout=output,stderr=subprocess.PIPE,env=self.env,timeout=600)
                require(proc.returncode==0,'database backup failed')
            # Use preserved server image as helper, mount only the existing file volume READ ONLY.
            volume=self.config['file_volume']
            with (backup_dir/'files.tar.gz').open('xb') as output:
                proc=subprocess.run(['docker','run','--rm','--network','none','--read-only',
                    '--entrypoint','tar','--mount',f'type=volume,src={volume},dst=/source,readonly',
                    release['images']['server'],'-C','/source','-czf','-','.'],
                    stdout=output,stderr=subprocess.PIPE,env=self.env,timeout=600)
                require(proc.returncode==0,'attachment backup failed')
        require(all((backup_dir/name).stat().st_size>0 for name in ('database.dump','files.tar.gz')),'empty backup')
        (backup_dir/'metadata.json').write_bytes(canonical({'deployment_id':attempt,'baseline':release,
            'migrations':self.before,'created':int(time.time())}))
        for path in backup_dir.iterdir():
            path.chmod(0o600)
            with path.open('rb') as backup_file: os.fsync(backup_file.fileno())
        directory=os.open(backup_dir,os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
    def start_server(self,m):
        self.selected=m
        self.compose('up','-d','--no-build','--no-deps','--pull','never','--wait','--wait-timeout','180','server',release=m)
    def migration_compatible(self,m):
        try:
            actual=self.metadata()
            return actual in (self.evidence['migrations']['baseline'],self.evidence['migrations']['candidate'])
        except Exception: return False
    def start_clients(self,m):
        self.selected=m
        for service in ('sync','web'):
            self.compose('up','-d','--no-build','--no-deps','--pull','never','--wait','--wait-timeout','120',service,release=m)
    def smoke(self,m):
        # The installed smoke performs normal auth and two authenticated Yjs clients. Missing inputs fail closed.
        args=[str(Path(self.config['install_dir'])/'smoke'),
              '--config',self.config['smoke_config']]
        if m.get('bootstrap'): args.append('--legacy-baseline')
        else: args.extend(['--sha',m['sha']])
        smoke_config=self.smoke_credentials()
        require(smoke_config['public_config']==self.config['public_config'],'smoke public config differs from release')
        smoke_config['images']=m['images']
        smoke_config['containers']={service:self.container(service) for service in SERVICES}
        with tempfile.TemporaryDirectory(prefix='moss-smoke-') as directory:
            private=Path(directory)/'config.json'; private.write_bytes(canonical(smoke_config)); private.chmod(0o600)
            args[args.index('--config')+1]=str(private)
            output=command(args,env=self.env,timeout=180)
        proofs=[]
        for line in output.splitlines():
            try:
                proof=json.loads(line)
                if isinstance(proof,dict) and proof.get('kind')=='production-smoke': proofs.append(proof)
            except (ValueError,UnicodeError): pass
        require(len(proofs)==1,'smoke did not produce unique structured evidence')
        proof=proofs[0]
        require(proof.get('status')=='passed' and proof.get('sha')==m.get('sha')
                and proof.get('config_sha256')==m['config_sha256'],'smoke identity/config/result mismatch')
        report_dir=Path(self.config['state_dir'])/'reports'; report_dir.mkdir(mode=0o700,exist_ok=True)
        with tempfile.NamedTemporaryFile(prefix='smoke-',suffix='.json',dir=report_dir,delete=False) as report:
            report.write(canonical(proof)); report.flush(); os.fsync(report.fileno())
        for service,image in m['images'].items():
            identity=command(['docker','image','inspect',image,'--format','{{.Id}}'],env=self.env).decode().strip()
            require(identity==self.inspect(service)['image'],'post-smoke image drift')
