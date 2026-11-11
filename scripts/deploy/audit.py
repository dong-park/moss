#!/usr/bin/env python3
"""Keep the existing high/critical policy while rejecting failed registry responses."""
import json
import subprocess
import sys
from release import Rejected, require


def clean_report(code,output):
    require(code in (0,1),'audit process failed')
    try: report=json.loads(output)
    except (ValueError,UnicodeError): raise Rejected('audit returned no valid report')
    require(isinstance(report,dict),'audit report must be an advisory map')
    require(code==0 or bool(report),'failed empty audit report')
    severities=[]
    for advisories in report.values():
        require(isinstance(advisories,list) and advisories,'invalid audit advisory collection')
        for item in advisories:
            require(isinstance(item,dict) and item.get('severity') in ('low','moderate','high','critical'),
                    'invalid or unknown advisory')
            severities.append(item['severity'])
    return not any(value in ('high','critical') for value in severities)


if __name__=='__main__':
    try:
        result=subprocess.run(['bun','audit','--json'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120)
        require(clean_report(result.returncode,result.stdout),'high or critical vulnerabilities found')
        print('Valid audit report: no high or critical advisories')
    except Exception:
        print('Audit failed: high/critical advisories or invalid registry/process result',file=sys.stderr)
        sys.exit(1)
