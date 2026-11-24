from pathlib import Path
import importlib.util, json, subprocess
root=Path(__file__).resolve().parent.parent
source=Path.home()/'agent-env/skills/asis-tobe/scripts/render.py'
spec=importlib.util.spec_from_file_location('asis_tobe_renderer',source)
renderer=importlib.util.module_from_spec(spec); spec.loader.exec_module(renderer)
for name in ['asis','tobe']:
 data=json.loads((root/f'{name}.json').read_text())
 if name=='asis': data['subtitle']='기존 할 일 편집 진입 · 키보드와 입력 종료 · 상세에서 뒤로가기'
 (root/f'{name}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
 html=renderer.build(data,str(root))
 extra='.clip{overflow:visible}.shot img{border-radius:20px}.mark .num{left:-32px!important;right:auto!important}'
 if name=='asis':extra+='.col:nth-child(2) .mark:nth-of-type(2){border-style:dashed}'
 html=html.replace('</style>',extra+'</style>')
 (root/f'{name}.html').write_text(html)
 subprocess.run([renderer.CHROME,'--headless=new','--hide-scrollbars','--force-device-scale-factor=2','--window-size=1292,1270',f'--screenshot={root}/{name}.png',f'file://{root}/{name}.html'],check=True,capture_output=True)
 print(name+' sheet rendered')
