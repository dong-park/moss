import json,socket,base64,os,struct,urllib.request,sys,time
PORT=9411
def ws_connect(url):
    h,p_=url[5:].split('/',1); host,port=h.split(':')
    s=socket.create_connection((host,int(port)))
    key=base64.b64encode(os.urandom(16)).decode()
    s.send(f"GET /{p_} HTTP/1.1\r\nHost: {h}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
    buf=b''
    while b'\r\n\r\n' not in buf: buf+=s.recv(1)
    return s
def send(s,obj):
    d=json.dumps(obj).encode(); m=os.urandom(4); n=len(d)
    hdr=bytes([0x81])+(bytes([0x80|n]) if n<126 else bytes([0x80|126])+struct.pack('>H',n) if n<65536 else bytes([0x80|127])+struct.pack('>Q',n))
    s.send(hdr+m+bytes(b^m[i%4] for i,b in enumerate(d)))
def recv(s):
    def rd(n):
        b=b''
        while len(b)<n: b+=s.recv(n-len(b))
        return b
    while True:
        b1,b2=rd(2); n=b2&127
        if n==126: n=struct.unpack('>H',rd(2))[0]
        elif n==127: n=struct.unpack('>Q',rd(8))[0]
        data=rd(n)
        if b1&0x0f in (1,): return json.loads(data)
tabs=json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'))
page=[t for t in tabs if t['type']=='page'][0]
s=ws_connect(page['webSocketDebuggerUrl'])
i=0
def call(method,params=None):
    global i;i+=1;send(s,{"id":i,"method":method,"params":params or {}})
    while True:
        r=recv(s)
        if r.get('id')==i: return r
def ev(expr):
    r=call("Runtime.evaluate",{"expression":expr,"awaitPromise":True,"returnByValue":True})
    return r.get('result',{}).get('result',{}).get('value')
def key(t,**kw):
    p={"type":t}; p.update(kw); return call("Input.dispatchKeyEvent",p)
def wait(ms): time.sleep(ms/1000)

call("Page.enable"); call("Runtime.enable")
call("Emulation.setDeviceMetricsOverride",{"width":1280,"height":800,"deviceScaleFactor":1,"mobile":False})
def goto(url,settle=3500):
    call("Page.navigate",{"url":url}); wait(settle)

mode=sys.argv[1]  # empty | big
out=sys.argv[2]
goto("http://127.0.0.1:3000/",5000)
url=ev("location.href"); print("url",url)
# 첫 실행이면 "빈 보드로 시작"
ev("(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>/빈 보드로 시작/.test(x.textContent));if(b)b.click();return !!b})()")
wait(2500)
url=ev("location.href"); print("url2",url)
base=url.split('?')[0]
if mode=="empty":
    goto(base,4000)
if mode=="big":
    goto(base+"?ks6seed=big",6000)
    n=0
    for _ in range(40):
        n=ev("document.querySelectorAll('[data-card-id]').length") or 0
        if n>20: break
        wait(500)
    print("cards in DOM",n)
    wait(3000)
ev("document.activeElement&&document.activeElement.blur()")
ev("window.__ks6=[]; document.getElementById('ks6log').textContent=''")
# ⌘K / Ctrl+K
key("rawKeyDown",key="Control",code="ControlLeft",windowsVirtualKeyCode=17,modifiers=2)
key("rawKeyDown",key="k",code="KeyK",windowsVirtualKeyCode=75,modifiers=2,text="")
key("keyUp",key="k",code="KeyK",windowsVirtualKeyCode=75,modifiers=2)
key("keyUp",key="Control",code="ControlLeft",windowsVirtualKeyCode=17)
wait(600)
print("search input focused:", ev("document.activeElement&&document.activeElement.tagName+':'+(document.activeElement.type||'')"))
# 조합: ㅇ → 이 → 잊 → 이 +지 ... 이직
steps=["ㅇ","이","잊","이지","이직"]
for t in steps:
    call("Input.imeSetComposition",{"text":t,"selectionStart":len(t),"selectionEnd":len(t)})
    wait(60)
# 조합 중 Enter: keydown(229) → 확정 → keyup → keydown Enter(13)
BUSY=int(os.environ.get("BUSY","0"))
def raw(m,p):
    global i; i+=1; send(s,{"id":i,"method":m,"params":p})
def kp(t,**kw):
    p={"type":t}; p.update(kw); raw("Input.dispatchKeyEvent",p)
if BUSY:
    # 메인 스레드를 BUSY ms 막고, 그동안 확정 글자·Enter 이벤트가 큐에 쌓이게 한다(응답을 기다리지 않고 연달아 보낸다).
    raw("Runtime.evaluate",{"expression":f"setTimeout(()=>{{const t=performance.now();while(performance.now()-t<{BUSY});}},0);0"})
    wait(10)
    raw("Input.imeSetComposition",{"text":"이직","selectionStart":2,"selectionEnd":2})
    wait(4)
    kp("rawKeyDown",key="Process",code="Enter",windowsVirtualKeyCode=229)
    wait(2)
    raw("Input.insertText",{"text":"이직"})
    wait(2)
    kp("keyUp",key="Enter",code="Enter",windowsVirtualKeyCode=13)
    wait(4)
    kp("rawKeyDown",key="Enter",code="Enter",windowsVirtualKeyCode=13,text="\r")
    kp("keyUp",key="Enter",code="Enter",windowsVirtualKeyCode=13)
    wait(BUSY+300)
else:
    key("rawKeyDown",key="Process",code="Enter",windowsVirtualKeyCode=229)
    call("Input.insertText",{"text":"이직"})
    key("keyUp",key="Enter",code="Enter",windowsVirtualKeyCode=13)
    wait(8)
    key("rawKeyDown",key="Enter",code="Enter",windowsVirtualKeyCode=13,text="\r")
    key("keyUp",key="Enter",code="Enter",windowsVirtualKeyCode=13)
wait(900)
res=ev("JSON.stringify({log:window.__ks6,dialog:!!document.querySelector('[role=dialog][aria-modal=true] [role=combobox]'),val:(document.querySelector('[role=combobox]')||{}).value,url:location.href})")
open(out,"w").write(res)
print(res)
