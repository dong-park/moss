import os, sys
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

HEAD = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
<link href="https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&family=Gaegu:wght@700&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:%(w)dpx;height:%(h)dpx;overflow:hidden;font-family:Pretendard,sans-serif;background:#222}
.room{position:absolute;inset:0;background:
 radial-gradient(ellipse 40%% 60%% at 18%% 30%%, #f6e3c4 0%%, transparent 70%%),
 radial-gradient(ellipse 30%% 50%% at 85%% 20%%, #cfe3e8 0%%, transparent 70%%),
 radial-gradient(ellipse 50%% 40%% at 60%% 95%%, #b9a58a 0%%, transparent 70%%),
 linear-gradient(180deg,#e9e4da 0%%,#d8d2c6 60%%,#bfb6a6 100%%);filter:blur(2px)}
.room .win{position:absolute;left:6%%;top:8%%;width:22%%;height:55%%;background:linear-gradient(180deg,#fffaf0,#f3ead8);border-radius:6px;filter:blur(18px);opacity:.9}
.room .plant{position:absolute;right:9%%;bottom:8%%;width:120px;height:220px;background:radial-gradient(circle at 50%% 30%%,#7c9a6a,#4f6b43 60%%,transparent 70%%);filter:blur(16px);opacity:.75}
.room .shelf{position:absolute;right:28%%;top:14%%;width:260px;height:150px;background:#a68f73;filter:blur(20px);opacity:.45}
.glass{position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.44) 0%%,rgba(255,255,255,.30) 35%%,rgba(255,255,255,.50) 36%%,rgba(255,255,255,.32) 42%%,rgba(255,255,255,.38) 100%%);backdrop-filter:blur(10px) saturate(1.05);-webkit-backdrop-filter:blur(10px)}
.glass:after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 0 58%%,rgba(255,255,255,.35) 60%%,transparent 64%%,transparent 70%%,rgba(255,255,255,.22) 71%%,transparent 73%%);pointer-events:none}
.wb{position:absolute;inset:0;background:linear-gradient(160deg,#fbfbf8,#eeeeea);}
.wb:after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 30%% 20%%,rgba(255,255,255,.9),transparent 50%%)}
.cork{position:absolute;inset:0;background:#c79a62;background-image:radial-gradient(#a87a45 1px,transparent 1.6px),radial-gradient(#dcb27c 1px,transparent 1.8px);background-size:7px 7px,11px 11px;background-position:0 0,3px 5px}
.p{position:absolute;padding:14px 14px;font-family:'Nanum Pen Script',cursive;color:#2b2b2b;line-height:1.05;box-shadow:0 1px 1px rgba(0,0,0,.08),0 8px 14px -6px rgba(0,0,0,.28);border-radius:2px}
.p:before{content:"";position:absolute;left:0;right:0;top:0;height:22%%;background:linear-gradient(180deg,rgba(0,0,0,.035),transparent)}
.y{background:#fdf1a8}.k{background:#f9d5d8}.m{background:#cdeedd}.b{background:#cfe2f7}.v{background:#e3dafa}
.mk{position:absolute;font-family:'Nanum Pen Script',cursive;white-space:nowrap;text-shadow:0 0 1.2px currentColor}
.ink-blk{color:#1f2430}.ink-blu{color:#2457b8}.ink-red{color:#d0453c}.ink-grn{color:#2f8a57}
svg.ink{position:absolute;inset:0;width:100%%;height:100%%;overflow:visible}
svg.ink path,svg.ink ellipse,svg.ink line{fill:none;stroke-linecap:round;stroke-linejoin:round;filter:url(#bleed)}
.tray{position:absolute;left:50%%;bottom:0;transform:translateX(-50%%);width:560px;height:46px;background:linear-gradient(180deg,#e9e9e6,#cfcfcb);border-radius:10px 10px 0 0;box-shadow:0 -2px 10px rgba(0,0,0,.12),inset 0 2px 0 #fff;display:flex;align-items:center;gap:18px;padding:0 26px}
.marker{width:74px;height:16px;border-radius:8px;background:#333;position:relative;box-shadow:0 2px 3px rgba(0,0,0,.3)}
.marker:after{content:"";position:absolute;right:-12px;top:3px;width:14px;height:10px;border-radius:0 6px 6px 0;background:inherit;filter:brightness(1.25)}
.marker.on{transform:translateY(-10px) rotate(-8deg)}
.cloth{width:70px;height:28px;background:#8ea6b8;border-radius:6px;box-shadow:0 2px 3px rgba(0,0,0,.25);background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.12) 0 2px,transparent 2px 5px)}
.badge{position:absolute;top:16px;right:18px;background:rgba(255,255,255,.75);backdrop-filter:blur(6px);border:1px solid rgba(0,0,0,.06);border-radius:999px;padding:6px 12px;font-size:13px;color:#444;font-weight:600}
.board-cork{position:absolute;border-radius:6px;border:10px solid #8b6a44;box-shadow:0 12px 24px -8px rgba(0,0,0,.35);overflow:hidden}
.board-cork .cork{inset:0}
.pin{position:absolute;width:12px;height:12px;border-radius:50%%;background:radial-gradient(circle at 35%% 35%%,#ff8a80,#c62828);box-shadow:0 2px 2px rgba(0,0,0,.35);left:50%%;top:6px;transform:translateX(-50%%)}
.cap{position:absolute;left:18px;bottom:60px;font-size:13px;color:#555;background:rgba(255,255,255,.7);padding:4px 10px;border-radius:6px}
.sheet{position:absolute;background:#fff;border-radius:16px;box-shadow:0 30px 60px -20px rgba(0,0,0,.45);font-family:Pretendard}
.btn{display:inline-block;padding:10px 16px;border-radius:10px;font-weight:600;font-size:14px}
.btn.pri{background:#1f2430;color:#fff}.btn.sec{background:#f0f0ee;color:#333}
.dim{position:absolute;inset:0;background:rgba(30,30,30,.28)}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><filter id="bleed" filterUnits="userSpaceOnUse" x="-100" y="-100" width="4000" height="4000"><feGaussianBlur stdDeviation="0.6"/></filter></svg>
"""
TAIL = "</body></html>"

def page(name, w, h, body):
    open(os.path.join(OUT, name + ".html"), "w").write((HEAD % {"w": w, "h": h}) + body + TAIL)

def P(x, y, w, h, c, r, txt, fs=30, extra=""):
    return f'<div class="p {c}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;transform:rotate({r}deg);font-size:{fs}px">{txt}{extra}</div>'
def MK(x, y, txt, ink="blk", fs=40, r=0):
    return f'<div class="mk ink-{ink}" style="left:{x}px;top:{y}px;font-size:{fs}px;transform:rotate({r}deg)">{txt}</div>'
def INK(paths):
    return f'<svg class="ink">{paths}</svg>'
def tray(active=0, extra=""):
    cols = ["#1f2430", "#2457b8", "#d0453c", "#2f8a57"]
    ms = "".join(f'<div class="marker{" on" if i==active else ""}" style="background:{c}"></div>' for i, c in enumerate(cols))
    return f'<div class="tray">{ms}<div class="cloth"></div>{extra}</div>'
GLASS = '<div class="room"><div class="win"></div><div class="shelf"></div><div class="plant"></div></div><div class="glass"></div>'

# 1. 메인 시안
page("01-main", 1440, 900, GLASS + """
<div class="badge">🔒 이 기기에만</div>
""" + MK(120, 70, "이직, 지금이 맞나?", "blu", 64, -2) + INK('''
<path d="M118 150 C 260 158, 420 150, 560 146" stroke="#2457b8" stroke-width="5"/>
<ellipse cx="300" cy="330" rx="170" ry="118" stroke="#d0453c" stroke-width="5" transform="rotate(-4 300 330)"/>
<path d="M470 330 C 560 300, 610 300, 690 330" stroke="#1f2430" stroke-width="4.5"/>
<path d="M672 314 L 694 331 L 668 344" stroke="#1f2430" stroke-width="4.5"/>
<path d="M300 452 C 300 520, 330 560, 380 600" stroke="#2f8a57" stroke-width="4.5" stroke-dasharray="2 12"/>
<path d="M820 560 L 1000 560" stroke="#1f2430" stroke-width="4"/>
<path d="M910 520 L 910 610" stroke="#1f2430" stroke-width="4"/>
''') + P(190, 250, 200, 170, "y", -3, "연봉 협상<br>다시 해볼까", 36)
  + P(700, 250, 210, 180, "k", 2.5, "팀장이랑<br>1:1 해보기<br><span style='color:#d0453c'>금요일 전!</span>", 34)
  + P(360, 580, 190, 160, "m", -1.5, "포트폴리오<br>정리부터", 34)
  + P(950, 230, 170, 150, "b", 4, "이사 가면<br>출퇴근 50분", 30)
  + MK(830, 470, "장점 | 단점", "blk", 38, 0)
  + MK(760, 580, "돈 +", "grn", 34, -3) + MK(940, 580, "출퇴근 −", "red", 34, 2)
  + """
<div class="board-cork" style="left:1150px;top:420px;width:250px;height:300px;transform:rotate(1deg)"><div class="cork"></div>
<div class="p v" style="left:24px;top:30px;width:110px;height:100px;font-size:22px;transform:rotate(-4deg)"><div class="pin"></div>읽을 책<br>3권</div>
<div class="p y" style="left:120px;top:130px;width:110px;height:100px;font-size:22px;transform:rotate(5deg)"><div class="pin"></div>여행<br>10월 말</div>
<div class="mk ink-blk" style="left:14px;top:240px;font-size:26px;background:#fff8;padding:0 6px">나중에 볼 것</div></div>
""" + tray(1) + '<div class="cap">기본 재질: 유리 · 뒤 방이 흐릿하게 비친다 · 마카와 포스트잇이 한 벽에</div>')

# 2. 재질 3종
def mini(bg, label, sub, sel=False):
    return f'''<div style="position:relative;width:420px;height:300px;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px -10px rgba(0,0,0,.4);{"outline:4px solid #2457b8;outline-offset:4px" if sel else ""}">{bg}
{MK(30,24,"오늘 생각","blu",40,-2)}{P(60,100,140,120,"y",-3,"연봉<br>다시 보기",28)}{P(230,90,140,120,"k",3,"1:1<br>금요일",28)}
<svg class="ink"><ellipse cx="130" cy="160" rx="100" ry="80" stroke="#d0453c" stroke-width="4" style="fill:none;filter:url(#bleed)"/></svg>
<div style="position:absolute;left:0;right:0;bottom:0;background:rgba(255,255,255,.85);padding:10px 16px;font-weight:700;font-size:17px;color:#222">{label} <span style="font-weight:500;color:#666;font-size:14px">{sub}</span></div></div>'''
page("02-materials", 1440, 520, '<div style="position:absolute;inset:0;background:#f3f1ec"></div><div style="position:absolute;left:40px;top:28px;font-size:22px;font-weight:800;color:#222">벽 재질 고르기 — 세 가지뿐, 기본은 유리</div><div style="position:absolute;left:40px;top:62px;font-size:15px;color:#666">스티커·테마·장식은 없다. 재질만 바꾸고 포스트잇·마카 위치는 그대로.</div><div style="position:absolute;left:40px;top:120px;display:flex;gap:40px">'
  + mini(GLASS, "유리", "기본 · 뒤가 비침", True) + mini('<div class="wb"></div>', "화이트보드", "깨끗한 흰 면") + mini('<div class="cork"></div>', "코르크", "따뜻한 질감") + "</div>")

# 3. 첫 진입
page("03-first-a", 1200, 760, GLASS + '<div class="badge">🔒 이 기기에만</div>' + tray(-1, "") + '''
<div style="position:absolute;left:50%;bottom:62px;transform:translateX(-50%);font-size:14px;color:#6a6a6a">마카를 집거나, 아무 데나 두 번 눌러 포스트잇</div>
<div class="cap">로그인 없음 · 보드 고르기 없음 · 빈 유리벽과 마카만</div>''')
page("03-first-b", 1200, 760, GLASS + '<div class="badge">🔒 이 기기에만</div>' + MK(330, 250, "요즘 자꾸 떠오르는 거", "blk", 60, -1.5) + INK('<path d="M330 335 C 480 345, 640 338, 820 330" stroke="#1f2430" stroke-width="5"/>') + P(520, 400, 200, 170, "y", -2, "회사 옮길까?", 38) + '''
<div style="position:absolute;left:800px;top:250px;font-size:28px">✒️</div>''' + tray(0) + '<div class="cap">첫 획이 곧 첫 생각 · 제목·폴더·태그를 묻지 않는다</div>')

# 4. 마카 필기감 + 닦기
page("04-marker", 1200, 700, GLASS + MK(80, 80, "굵게", "blk", 72, -2) + MK(330, 92, "보통", "blu", 52, 1) + MK(560, 100, "가늘게", "red", 40, -1) + INK('''
<path d="M80 200 C 200 180, 300 230, 420 200 S 640 180, 760 210" stroke="#1f2430" stroke-width="10"/>
<path d="M80 250 C 200 235, 300 270, 420 250 S 640 235, 760 255" stroke="#2457b8" stroke-width="6"/>
<path d="M80 290 C 200 280, 300 305, 420 290 S 640 280, 760 296" stroke="#d0453c" stroke-width="3"/>
''') + '''
<div style="position:absolute;left:80px;top:360px;width:700px;height:200px">
<div class="mk ink-blu" style="left:0;top:0;font-size:58px">닦으면 자국이 살짝 남는다</div>
<div style="position:absolute;left:250px;top:-10px;width:360px;height:120px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(244,243,239,.92) 18%,rgba(244,243,239,.88) 82%,rgba(255,255,255,0));filter:blur(4px);border-radius:40px"></div>
<div class="cloth" style="position:absolute;left:560px;top:20px;width:110px;height:56px;transform:rotate(-12deg)"></div>
</div>
<div class="sheet" style="right:40px;top:60px;width:300px;padding:18px 20px">
<div style="font-weight:800;font-size:16px;margin-bottom:12px">마카</div>
<div style="display:flex;gap:10px;margin-bottom:14px">''' + "".join(f'<div style="width:30px;height:30px;border-radius:50%;background:{c};{"outline:3px solid #2457b8;outline-offset:2px" if i==1 else ""}"></div>' for i,c in enumerate(["#1f2430","#2457b8","#d0453c","#2f8a57"])) + '''</div>
<div style="font-size:13px;color:#666;margin-bottom:6px">굵기</div>
<div style="display:flex;gap:14px;align-items:center;margin-bottom:14px"><div style="width:6px;height:6px;border-radius:50%;background:#333"></div><div style="width:12px;height:12px;border-radius:50%;background:#333;outline:3px solid #2457b8;outline-offset:2px"></div><div style="width:20px;height:20px;border-radius:50%;background:#333"></div></div>
<div style="font-size:13px;color:#666">지우개 = 천으로 닦기 · 손바닥으로 문지르기</div></div>
<div class="cap">색 4개, 굵기 3개 · 획 끝이 살짝 번진다 · 펜 = 마카 한 도구</div>''' + tray(1))

# 5. 마카 + 포스트잇
def scene5(moved):
    px = 620 if moved else 200
    return GLASS + MK(60, 40, "마카는 그림일 뿐", "blk", 44, -1) + INK(f'''
<ellipse cx="300" cy="300" rx="150" ry="110" stroke="#d0453c" stroke-width="5" transform="rotate(-5 300 300)"/>
<path d="M455 300 C 520 270, 560 270, 610 300" stroke="#1f2430" stroke-width="4.5"/>
<path d="M592 284 L 614 301 L 588 314" stroke="#1f2430" stroke-width="4.5"/>
''') + (P(220,220,170,150,"y",-3,"",36) if False else "") + P(px, 225, 170, 150, "y", -3, "연봉<br>다시 보기", 36) + P(630, 240, 170, 150, "k", 3, "1:1<br><span class='ink-red' style='color:#d0453c;text-decoration:underline'>금요일</span>", 36) * (0 if moved else 1) + (P(860, 150, 170, 150, "k", 3, "1:1<br><span style='color:#d0453c;text-decoration:underline'>금요일</span>", 36) if moved else "") + ('<div class="mk ink-grn" style="left:170px;top:440px;font-size:34px">↑ 옮겨도 동그라미는 제자리</div>' if moved else '<div class="mk ink-grn" style="left:600px;top:420px;font-size:34px">포스트잇 위에도 쓴다 (밑줄)</div>')
page("05-sticky-a", 1100, 560, scene5(False) + '<div class="cap">마카로 둘레를 동그라미·화살표</div>')
page("05-sticky-b", 1100, 560, scene5(True) + '<div class="cap">포스트잇을 옮기면 벽 그림은 남고, 포스트잇 위 글씨는 따라간다</div>')

# 6. 공유 고지
page("06-share", 1200, 760, GLASS + MK(120, 90, "이직 고민", "blu", 56, -1) + P(160, 220, 190, 160, "y", -3, "연봉<br>다시 보기", 34) + P(420, 240, 190, 160, "k", 2, "1:1<br>금요일", 34) + '<div class="badge">🔒 이 기기에만 &nbsp; <span style="background:#1f2430;color:#fff;border-radius:999px;padding:3px 10px;margin-left:6px">공유 ↗</span></div><div class="dim"></div>' + '''
<div class="sheet" style="left:50%;top:50%;transform:translate(-50%,-50%);width:440px;padding:28px">
<div style="font-size:20px;font-weight:800;margin-bottom:14px">이 벽을 공유할까요?</div>
<div style="display:flex;gap:12px;background:#f6f5f1;border-radius:12px;padding:14px;margin-bottom:18px"><div style="font-size:26px">☁️</div><div style="font-size:15px;line-height:1.55;color:#333">공유하면 <b>이 벽은 moss 서버에 올라갑니다.</b><br>다른 벽은 그대로 이 기기에만 있어요.</div></div>
<div class="btn pri" style="display:block;text-align:center;margin-bottom:8px">G &nbsp;Google로 로그인하고 공유</div>
<div class="btn sec" style="display:block;text-align:center">취소</div></div>
<div class="cap" style="z-index:2">로그인은 공유를 고른 이 순간에만 · 협업은 보너스</div>''' + tray(-1))

# 7. 휴대폰
phone_wall = '<div style="position:absolute;inset:0;overflow:hidden;border-radius:34px">' + GLASS.replace('class="room"','class="room" style="transform:scale(.5);transform-origin:0 0;width:200%;height:200%"') + MK(30, 70, "이직 고민", "blu", 40, -2) + P(40, 150, 120, 110, "y", -3, "연봉<br>다시 보기", 24) + P(175, 160, 115, 105, "k", 3, "1:1<br>금요일", 24) + P(150, 470, 130, 115, "y", 4, "번아웃 오기<br>전에 할 일", 22) + '<div style="position:absolute;left:140px;top:448px;font-size:12px;font-weight:700;color:#2f8a57">방금 붙음</div>' + P(80, 330, 140, 110, "m", -1, "포트폴리오", 24) + INK('<ellipse cx="100" cy="205" rx="80" ry="70" stroke="#d0453c" stroke-width="3"/>') + '<div style="position:absolute;left:0;right:0;bottom:0;padding:14px;background:rgba(255,255,255,.85);text-align:center;font-size:13px;color:#555">보기 전용 · 마카는 태블릿·데스크톱에서</div></div>'
def phone(x, inner):
    return f'<div style="position:absolute;left:{x}px;top:40px;width:340px;height:700px;border-radius:44px;background:#111;padding:10px;box-shadow:0 30px 50px -20px rgba(0,0,0,.5)"><div style="position:relative;width:100%;height:100%;border-radius:34px;overflow:hidden;background:#fafafa">{inner}</div></div>'
share = '''<div style="position:absolute;inset:0;background:#e9e9ee"></div><div style="position:absolute;left:20px;top:60px;right:20px;font-size:15px;color:#333;background:#fff;border-radius:12px;padding:14px">brunch.co.kr · <b>번아웃 오기 전에 할 일</b></div>
<div style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:20px 20px 0 0;padding:20px">
<div style="font-size:13px;color:#888;margin-bottom:12px">공유</div><div style="display:flex;gap:18px;font-size:12px;text-align:center">
<div><div style="width:56px;height:56px;border-radius:14px;background:#fee500;margin-bottom:6px"></div>카카오톡</div>
<div><div style="width:56px;height:56px;border-radius:14px;background:#cdeedd;margin-bottom:6px;outline:3px solid #2f8a57;display:flex;align-items:center;justify-content:center;font-size:26px">🌿</div><b>moss</b></div>
<div><div style="width:56px;height:56px;border-radius:14px;background:#ddd;margin-bottom:6px"></div>복사</div></div></div>'''
done = '<div style="position:absolute;inset:0;background:#e9e9ee"></div>' + P(85, 220, 170, 160, "y", -3, "번아웃 오기<br>전에 할 일<br><span style='font-size:18px;color:#666'>brunch.co.kr</span>", 30) + '<div style="position:absolute;left:30px;right:30px;top:440px;background:#1f2430;color:#fff;border-radius:14px;padding:14px;text-align:center;font-weight:700">✓ 벽에 붙였어요 · 이직 고민</div>'
page("07-phone", 1240, 780, '<div style="position:absolute;inset:0;background:#f3f1ec"></div>' + phone(40, share) + '<div style="position:absolute;left:400px;top:370px;font-size:40px;color:#888">→</div>' + phone(450, done) + '<div style="position:absolute;left:810px;top:370px;font-size:40px;color:#888">→</div>' + phone(860, phone_wall))

# 8. 줌 아웃
def cluster(x, y, label, ink, n, cols):
    out = MK(x, y - 52, label, ink, 40, -2)
    for i in range(n):
        cx = x + (i % cols) * 46 + (i // cols % 2) * 8
        cy = y + (i // cols) * 40
        out += f'<div class="p {"ykmbv"[i%5]}" style="left:{cx}px;top:{cy}px;width:38px;height:34px;padding:0;transform:rotate({(i*7)%9-4}deg)"></div>'
    return out
page("08-zoom", 1440, 860, GLASS + cluster(120, 160, "커리어 (14)", "blu", 14, 5) + cluster(620, 140, "여행 (6)", "grn", 6, 3) + cluster(960, 200, "읽을 것 (31)", "blk", 31, 7) + cluster(300, 560, "이사 (9)", "red", 9, 4) + INK('''
<ellipse cx="230" cy="215" rx="170" ry="110" stroke="#2457b8" stroke-width="4"/>
<path d="M410 220 C 480 200, 540 190, 600 180" stroke="#1f2430" stroke-width="3.5"/>
<path d="M300 330 C 320 420, 330 470, 360 500" stroke="#1f2430" stroke-width="3.5"/>''') + '<div class="cap">멀리서: 마카로 쓴 덩어리 이름과 개수 · 다가가면 글씨가 읽힌다</div><div class="sheet" style="right:24px;bottom:24px;padding:8px 14px;font-weight:700;font-size:14px">25% &nbsp;− &nbsp;+</div>')

# 9. 검색
res = [("이직", " 고민 중", "이직 고민 벽"), ("연주", "회 표 예매", "일상 벽"), ("인재", " 채용 캡처", "리서치 벽")]
rows = "".join(f'<div style="display:flex;justify-content:space-between;padding:12px 18px;{"background:#f2f5fb" if i==0 else ""}"><div style="font-size:16px"><span style="display:inline-block;width:14px;height:14px;background:{["#fdf1a8","#f9d5d8","#cfe2f7"][i]};margin-right:10px;vertical-align:-2px;box-shadow:0 1px 2px rgba(0,0,0,.2)"></span><mark style="background:#ffe48a;padding:0 2px">{a}</mark>{b}</div><div style="color:#999;font-size:13px">{c}</div></div>' for i,(a,b,c) in enumerate(res))
page("09-search", 1200, 700, GLASS + P(200, 300, 180, 150, "y", -3, "이직 고민 중", 34) + P(700, 380, 180, 150, "k", 2, "연주회 표", 34) + '<div class="dim"></div><div class="sheet" style="left:50%;top:90px;transform:translateX(-50%);width:560px;overflow:hidden"><div style="padding:18px;font-size:22px;border-bottom:1px solid #eee">⌕ &nbsp;ㅇㅈ<span style="border-left:2px solid #2457b8;margin-left:2px"></span></div>' + rows + '<div style="padding:10px 18px;font-size:12px;color:#999;border-top:1px solid #eee">초성·부분 일치 · 마카 글씨는 검색하지 않아요</div></div><div class="cap" style="z-index:2">⌘K · 고르면 그 벽으로 날아가 포스트잇이 반짝</div>')

# 10. 닦기 + 스냅샷
polas = "".join(f'<div style="position:absolute;left:{1040}px;top:{90+i*190}px;width:170px;height:170px;background:#fff;padding:10px 10px 30px;box-shadow:0 8px 16px -6px rgba(0,0,0,.35);transform:rotate({[-3,2,-1][i]}deg)"><div style="width:100%;height:100%;position:relative;overflow:hidden">{GLASS}<div class="p {"ykm"[i]}" style="left:20px;top:20px;width:50px;height:44px;padding:0"></div><div class="p {"kbv"[i]}" style="left:80px;top:40px;width:50px;height:44px;padding:0"></div></div><div style="position:absolute;left:12px;bottom:6px;font-family:Nanum Pen Script;font-size:20px">{["10/3 이직","9/27 이사","9/20 여행"][i]}</div></div>' for i in range(3))
page("10-wipe", 1260, 720, GLASS + '<div style="position:absolute;left:0;top:0;width:980px;height:100%;background:linear-gradient(90deg,rgba(255,255,255,.0),rgba(250,249,246,.75) 30%,rgba(250,249,246,.75) 70%,rgba(255,255,255,0));"></div>' + MK(200, 260, "닦기 전 모습은 사진으로", "blk", 52, -1) + '<div class="cloth" style="position:absolute;left:640px;top:360px;width:140px;height:70px;transform:rotate(-10deg)"></div>' + '<div style="position:absolute;left:1020px;top:40px;font-weight:800;font-size:15px;color:#333">벽 사진첩</div>' + polas + '<div class="cap">벽을 비워도 그날의 벽은 사진으로 다시 본다 (P2)</div>')
print("ok")
