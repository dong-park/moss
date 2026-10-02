#!/usr/bin/env python3
"""scene.html 을 세 모드로 찍어 갤러리 명세를 만들고 셸로 굽는다."""
import html, json, os, subprocess

D = os.path.dirname(os.path.abspath(__file__))
scene = open(os.path.join(D, "first-page-floating-cards.scene.html"), encoding="utf-8").read()

def frame(mode):
    src = html.escape(scene.replace("__MODE__", mode), quote=True)
    return ('<iframe title="시안 %s" srcdoc="%s" style="display:block;width:100%%;aspect-ratio:1440/900;'
            'border:0;border-radius:6px;background:#ebecee"></iframe>' % (mode.upper(), src))

items = [
    {"h": "A. 보기만 — 떠다니는 카드", "html": frame("a"),
     "cap": "장점: 28장이 천천히 떠서 첫눈에 메모 앱인 게 보인다. 걱정: 보기만 해서 '노는 재미'는 말로만 전해진다."},
    {"h": "B. 직접 끌기 — 집어 던지는 카드", "html": frame("b"),
     "cap": "장점: 로그인 전에 카드를 직접 집어 던져 보며 재미를 손으로 느낀다. 걱정: 카피가 '연결을 이어 준다'고 약속해 실제 기능보다 앞설 수 있다.",
     "notes": ["카피는 브리프 후보 '연결은 moss가 볼게요'를 '이어 줄게요'로 바꿨다."]},
    {"h": "C. 카드가 모인다 — 흩어졌다 보드로", "html": frame("c"),
     "cap": "장점: 2.5초 뒤 카드가 6덩어리로 모이고 선이 그어져 제품 약속을 움직임으로 보여 준다. 걱정: 14초 주기라 첫 2.5초에 떠난 사람은 핵심을 못 본다.",
     "notes": ["덩어리 이름 6개는 카드 내용에 맞춰 지었다."]},
]
spec = {
    "title": "moss 로그인 전 첫 화면 — 떠다니는 카드 히어로",
    "sub": "시안 3개, 각 1440×900. 액자를 누르면 크게 보인다. 시안은 라이트 단일이다 — moss 토큰에 다크가 없어 스위치를 눌러도 시안 안은 안 바뀐다.",
    "blocks": [{"type": "gallery", "cols": 3, "items": items}],
}
sp = os.path.join(D, "first-page-floating-cards.spec.json")
json.dump(spec, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
subprocess.run(["python3", os.path.expanduser("~/.claude/skills/visual/scripts/shell.py"),
                sp, os.path.join(D, "first-page-floating-cards.html")], check=True)
