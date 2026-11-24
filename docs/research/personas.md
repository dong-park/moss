# moss 사용자 페르소나 & 페인포인트 리서치 리포트

9개 세그먼트 리서치(PKM 피로자 / ADHD·신경다양성 / 연구자·대학원생 / 작가·크리에이터 / 시각적 사고자·디자이너 / 1인 창업자·인디해커 / 한국 사용자 특화 / 프라이버시·local-first / 학생·손글씨)를 교차 종합. 인용·URL은 입력 데이터에 있는 것만 사용했으며, 지어내지 않았다.

---

## 1. 요약 (Executive Summary)

1. **진짜 1순위 고통은 '캡처'가 아니라 '되찾기(retrieval)'다.** 모든 세그먼트에서 가장 반복되는 핵심 고통은 "저장은 쉬운데 다시 안 본다 = 메모 무덤/write-only 묘지"였다. ADHD는 "every single time dumping ground", 한국은 "쌓아두기는 쉬운데 다시 찾기는 어려워지는 역설", 연구자는 "800 notes and no output", 인디해커는 "most notes are write-only and never read back". moss의 홈 재노출('다시 떠오른 생각/오늘의 연결/오늘의 질문')이 이 거의 모든 세그먼트의 공통 급소를 정조준하는 **거의 유일한 차별 기능**이다. 즉 moss의 생사는 2초 캡처가 아니라 **재노출 품질**에 걸려 있다.

2. **'시스템 유지비 = 번아웃'이 공통 이탈 1위.** 플러그인·CSS·태그·폴더·템플릿 세팅이 '생각하기'를 대체하고("mental masturbation", "spend more time organizing than doing", "정리하는 시간이 하는 시간보다 많다"), 결국 손이 가장 빠른 Apple Notes·카톡 '나와의 채팅'으로 회귀한다. moss의 '제목/폴더/태그 비강제·제로세팅'이 직접 대응하지만, **무한 캔버스+줌 자체가 새로운 세팅/빈 캔버스 마비를 재생산할 위험**이 모든 세그먼트에서 지적됐다.

3. **'빈 캔버스 마비(blank slate paralysis)'와 '지형도 압도감'이 양날.** 자유도가 높은 도구는 ADHD·PKM 입문자에게 시작 자체를 막고, 메모가 수백 개로 폭증하면 축소뷰가 "20마리 사자"처럼 다시 압도한다. 홈 재노출이 빈 화면을 메우는 **온보딩 역할**을 해야 하고, LOD(줌 레벨별 정보 밀도) 설계가 압도감을 눌러야 한다.

4. **AI는 '대필 거부 + 응집기 기대'로 정렬되지만, 추천 품질과 데이터 흐름이 신뢰를 가른다.** 작가 세그먼트(출판용 생성 7%뿐, 발상·연결엔 다수 사용), 연구자("AI는 요약은 해주지만 내 질문을 못 만든다"), 프라이버시층(AI creeping 거부)이 moss의 '응집기' 포지션과 1:1로 맞는다. 그러나 Mem 사례처럼 "50개에선 제안이 generic"하고, 거절 학습이 체감되지 않으면 **AI 연결선 자체가 '또 하나의 정리 노동/노이즈'**가 되어 역효과를 낸다.

5. **데이터 소유권·락인 공포는 '지불 이전의 진입 조건'이다.** Roam/Evernote 가격 인상·인수, Anytype 무단 동기화, GoodNotes 구독 끊기면 읽기전용 '인질', 한국 "서비스 종료로 급하게 export" 트라우마가 반복된다. moss의 local-first + Markdown/JSON Canvas export가 핵심 안전장치이나, 핵심 지지층(개발자·plain-text 신봉자)은 **"IndexedDB/OPFS 블랙박스보다 '진짜 내 .md 파일' 감각"**을 원해 export-only로는 부족할 수 있다.

6. **구독 저항이 구조적이나, '기술이 아니라 서비스'로 체감되는 영역엔 지불한다.** "노트북으로 리스트 만드는 데 월 $8.99를 왜 내냐"류 저항이 전 세그먼트에 깔려 있다. 레드라인은 가격이 아니라 **에버노트식 '기존 무료 기능 축소'**다. 지불 전환은 서버비가 정당화되는 AI 응집기·대용량·재노출에 걸고, 저장·캡처·열람·export는 무료로 지켜야 한다. 이탈이 빠른 ADHD층 때문에 **연간 락인보다 월 구독/라이프타임 옵션**이 유리하며, 유료 가치는 **2~3주 안에** 체감돼야 한다.

7. **한국어 우선 제품의 진입 조건은 별도 리스크 축이다.** 한국어 초성·부분일치 검색, 한글 IME 조합/중복입력 안정성은 "있으면 좋음"이 아니라 **"없으면 즉시 이탈"**하는 기본기다(삼성노트 검색 먹통, 웹 IME 중복입력 사례). 또한 한국 세그먼트의 1차 인용은 상대적으로 얇아(뉴닉·브런치·클리앙·다모앙 중심, 대체로 moderate) **추가 심층 인터뷰가 필요**하다.

---

## 2. 우선순위 페르소나 (7)

### P1. 세팅 번아웃에 지친 PKM 베테랑 — "도구를 돌보느라 생각을 못 한 사람"
*(세그먼트: PKM 피로자 + 프라이버시/개발자 하위 + 연구자 세팅피로)*

- **상황:** 1~2년간 Obsidian에 플러그인 50~60개·CSS 테마를 세팅, FOMO로 계속 도구를 손보다 번아웃. Roam→Logseq→Obsidian을 전전한 앱 유목민. "이 정도면 됐다"는 만족에 못 이름.
- **목표:** 도구 유지가 아니라 생각을 쓰고 연결하는 데 에너지 쓰기 / 튜닝 유혹이 적은 환경 / 5년 뒤에도 내 노트를 통제.
- **현재 도구·우회법:** Obsidian(플러그인 다수)·iA Writer·Neovim·Drafts. 플러그인 36→0으로 줄이기, 글쓰기는 미니멀 앱·연결만 Obsidian, 폴더형 회귀.
- **핵심 페인포인트 Top 5:**
  1. 시스템 유지비가 사고 성과를 넘어 번아웃 — "I really thought I would have much use out of the 50-60 plugins I installed … and I never did and never will." (forum.obsidian.md/t/1-year-after-posting-my-severe-addiction-i-dont-really-use-obsidian-anymore/90236)
  2. 세팅이 생산적인 '척'을 줌 — "setting up sophisticated systems felt close to mental masturbation to them" (dsebastien.net/ai-wiki-pkm-pkm-anti-patterns/)
  3. 수집가의 오류 — "opens Obsidian, creates a new note, links it to three others, feels briefly brilliant, and never opens it again" (toolsforhumans.ai/blog/your-second-brain-is-write-only-…)
  4. 바빠지면 정크 드로어로 전락 — "My Obsidian vault turned into a junk drawer once life got busy." (iwoszapar.com/p/obsidian-vs-second-brain)
  5. 데이터 소유권·락인 불안 — "plain-text files were the feature they valued most" (hn.nuxt.dev/item/48896229) / (KR) "앱을 바꿔도 순수 텍스트 파일이라 다른 에디터에서 그대로 열 수 있다" (news.hada.io/topic?id=4730)
- **이탈 이유:** 유지비 과부하, "mental masturbation" 자각, 구독 요금, Logseq DB 전환 반발, 바빠지면 복구 동기 상실.
- **지불 의향:** '노트앱 월정액' 범주 자체에 저항하는 층이 두터움. 단 '가치 있다' 느끼면 Logseq 후원처럼 기꺼이 냄. → **무료 로컬 티어가 신뢰·획득 조건, 유료는 응집기에.**
- **moss 적합도: 중.** 핵심 고통(묘지·유지비)에 정면 대응하나, 이들은 **커스터마이즈=정체성**이라 'moss가 다 알아서 함'이 통제감 상실로 읽힐 수 있고, 'AI 연결=노이즈 아니냐'를 공개적으로 의심한다. 수동 연결선/서브캔버스 같은 '만질 여지'와 '진짜 내 파일' 감각이 완충.

### P2. 흩어진 ADHD 사고자 — "out of sight, out of mind"
*(세그먼트: ADHD·신경다양성 + 인디해커 캡처소실 + 한국 카톡 라이트유저)*

- **상황:** 뒤늦게 성인 ADHD 진단. 노션에 '완벽한 시스템'을 세팅하느라 저녁을 다 쓰고 며칠 뒤 안 엶. 하루에도 여러 번 '적어둬야 하는데'가 떠오르지만 캡처 마찰(어디에? 폴더? 제목?)에서 증발. '의지가 약하다'는 수치심.
- **목표:** 떠오른 순간 2초 안에 붙잡기 / 과거 생각이 '있었다는 사실 자체'를 다시 떠올리기 / 수치심 없이 쓸 도구.
- **현재 도구·우회법:** Apple Notes(덤핑), 노션(방치), 포스트잇, 캘린더에 몰아 적기, ColorNote. 폴더 3~5개로 축소, 알림 거의 끔, 할 일 최대 3개 제한.
- **핵심 페인포인트 Top 5:**
  1. 메모 앱이 매번 덤핑 그라운드, 다시 안 봄 — "Mine slowly becomes a dumping ground every single time. … I never revisit them." (reddit.sentinel-team.org/posts/1rcoljl/…)
  2. 목록/앱의 존재 자체를 잊음 — "If I make a to-do list … I promptly forget it exists." (reddit.sentinel-team.org/posts/1rg339r/…)
  3. 목록을 보면 뇌가 즉시 거부 — "When I see 20 tasks, my brain treats them like 20 lions attacking me at once." (같은 출처)
  4. streak·점수가 수치심→RSD 악순환 — "a missed day breaks the streak, which brings shame, which lowers executive function … can trigger RSD" (dev.to/nucleusos/adhd-support-app-no-streaks-…)
  5. (KR) 적어둔 걸 보지 않아 다시 놓침 — "이마저도 노트에 메모를 하니 적어둔 걸 보지 않아 다시 중요한 것들을 놓쳤었고" (newneek.co/@moba/article/14379)
- **이탈 이유:** 세팅 과부하, 결정 마비, 압도감 회피, out-of-sight로 안 엶, 되찾기 실패, task manager 미스핏, streak 수치심, 새 방법 강제의 스트레스.
- **지불 의향:** 양가적. "It's only expensive if it doesn't work"처럼 '진짜 붙잡혔다'는 감각엔 결제하나, "2주만 쓰고 year-long 구독을 낭비"하는 패턴. → **월 구독·관대한 무료 티어·언제든 취소, 유료 가치 조기 체감.**
- **moss 적합도: 상.** 2초 캡처·no-streak·재노출·공간기억이 이 세그먼트 고통과 거의 전면 정렬. **단 최대 리스크는 재노출이 약하면 거대 캔버스가 더 거대한 덤핑 그라운드가 될 뿐**이라는 것.

### P3. 아웃풋을 못 내는 연구자·대학원생 — "800 notes, no output"
*(세그먼트: 연구자·대학원생·Zettelkasten)*

- **상황:** How to Take Smart Notes를 읽고 제대로 세팅, 노트 수백~800개인데 논문으로 한 글자도 안 나감. 마감 앞에서 노트를 병합·재구조화하며 시간을 보냄. 과거 노트가 '남의 글'처럼 느껴짐.
- **목표:** 문헌을 내 주장으로 응집해 초안으로 / 수집 아닌 글쓰기로 전환 / 과거 통찰을 지금 작업에 재연결.
- **현재 도구·우회법:** Obsidian·Zotero(citekey 연동)·Smart Connections. 개요 먼저 잡기, orphan 방지 선링크, 색상 하이라이트.
- **핵심 페인포인트 Top 5:**
  1. 수집은 많은데 아웃풋 공백 — "The author had 800 notes and no output … the back half (retrieval, reflection, output) gets neglected." (theiterativelife.substack.com/p/the-zettelkasten-trap)
  2. 과거의 나를 못 믿음/맥락 상실 — "I just don't trust my past self. It's as if he's another person—I have to rethink everything." (forum.zettelkasten.de/discussion/comment/22068/)
  3. '어디에 적지' 결정 부담 — "I spend a lot of time thinking before noting 'simple' things: where should I note this idea/information?" (forum.obsidian.md/t/…6-months-zk/105172)
  4. 고립 노트 양산 — "620 notes with no outgoing links, about 20.5% … spotlighting their own laziness" (forum.zettelkasten.de/discussion/comment/13712)
  5. (KR) 정리할수록 '완성 문서'로 굳어 재활용 안 됨, AI는 내 질문을 못 만듦 — "정리를 잘하면 할수록 노트는 '완성된 문서'처럼 굳어버리거든요 … AI는 요약을 해주지만, 내 질문을 대신 만들어주지는 못합니다." (maily.so/linked.note/posts/mjz6qm8wrwk)
- **이탈 이유:** 규모↑→마찰↑(The Friction Fallacy), ROI/아웃풋 부재 환멸, Collector's Fallacy 자각, cookie-cutter 방법론 경직성, plain-text 상호운용성 집착.
- **지불 의향:** 있으나 강한 가격 민감. "$20~30이면 서비스를 포기하지 않고 구독할 학생이 많다" (forums.zotero.org/discussion/133462). 학생 할인·연 $20~40대가 현실 상한. 단순 저장엔 안 내고 아웃풋 끌어올리는 기능에만.
- **moss 적합도: 중.** '응집·재발견·완벽주의 해소'엔 적합도 매우 높음. 그러나 **두 치명적 공백**: (1) **출처·인용 관리(Zotero/citekey/페이지 점프)가 사실상 NON-GOAL** — Zotero를 못 끼면 '또 하나의 수집함'. (2) **노트→논문 초안 전환**이 최대 이탈 사유인데 moss는 대필이 NON-GOAL이라 글쓰기 아웃풋이 약함. 둘 중 하나라도 비면 환멸→이탈 답습 위험.

### P4. 묘지가 된 영감 저장소의 크리에이터 — "Store Everything, Create Nothing"
*(세그먼트: 작가·뉴스레터·유튜버·카피라이터)*

- **상황:** 요즘IT·브런치에 글 쓰는 지식노동자, 또는 프리랜스 카피라이터/1인 유튜버. 글감 수백 개 쌓였는데 발행 주기는 느려짐. 스와이프 파일이 너무 커져 막상 안 뒤짐. 산책·운전·샤워 중 아이디어가 캡처 늦어 사라짐.
- **목표:** 쌓은 메모를 실제 글로 전환 / 도구를 또 갈아타지 않고 머무르기 / 막힐 때 꺼내 쓰는 영감 저장소.
- **현재 도구·우회법:** 노션·옵시디언·구글 Keep·애플 메모·Gmail 라벨·음성메모. 빠른 초안은 Keep으로, 스와이프를 'Frankenstein' 짜깁기.
- **핵심 페인포인트 Top 5:**
  1. 영감 저장소의 묘지화 — "a place where ideas go to be forgotten in high definition / Store Everything, Create Nothing" (producthunt.com/p/socra-…/why-most-note-taking-apps-fail-writers-…)
  2. 도구 꾸미기가 글쓰기를 대체 — "I spent a lot of time organizing my stuff rather than actually creating/writing … I'd start redesigning/modifying my dashboard" (deepakness.com/blog/notion-not-for-writers/)
  3. 무거운 노션은 2초 캡처 불가 — "if one needs to write a quick draft, it's just not a handy tool … I went back to using Google Keep" (같은 출처)
  4. 스와이프 복붙이 '왜 먹히는지'를 못 보게 함 — "I never understood WHY my copy worked … 'Frankenstein together' a piece of copy … I'd hit a dead end" (tim-schreiber.beehiiv.com/p/why-i-hate-swipe-files)
  5. AI 대필 거부, 보조는 기대 — "only 7% use it to generate text content for publication … a majority … for brainstorming, or as a thesaurus" (publishersweekly.com/…/99019-new-report-examines-writers-attitudes-toward-ai.html)
- **이탈 이유:** 노션 무거움→Keep 회귀, 세팅 번아웃, 메모앱 유목, 스와이프 비대화, AI='대필' 인식 시 신뢰 철회(출판계 공개서한: kuow.org/stories/more-than-70-writers-send-open-letter-…).
- **지불 의향:** 유료 지출 습관 있음(노션·스크리브너·Echo·Socra 등 '메모→초안' 시장 형성). 단 가치가 '정리'가 아니라 '전환·재노출'일 때만 지갑이 열림. 프리랜스 카피라이터는 수익 직결로 WTP 높고, 취미 블로거는 무료 체류.
- **moss 적합도: 중(상에 가까움).** '머무름·응집·연결' 동사가 이 세그먼트 진짜 고통과 정확히 겹치고, 재노출·'응집기 아님 대필' 포지션·다양한 카드가 강점. **단 최대 미충족은 '초고 전환'** — 캔버스→선형 초안 뷰·외부 에디터 export가 약하면 '더 예쁜 묘지'. 선형 텍스트 작가에겐 캔버스 메타포 자체가 과할 수 있어 **리스트/문서 뷰 대안** 필요.

### P5. 팀 도구에 지친 시각적 사고자 — "개인용 사고판이 없다"
*(세그먼트: 디자이너·기획자 + 학생 손글씨 무한캔버스 열망)*

- **상황:** 회사에선 FigJam/Miro로 협업하지만 '내 머릿속 정리'는 그 안에서 못 함(남이 봄, 협업 전제). 또는 Obsidian Canvas/Heptabase로 노트를 공간 배치하다 노드 100~150개에서 렉. 학생은 GoodNotes 페이지 경계에 막힘.
- **목표:** 남 눈치 없이 거칠게 펼치기 / 군집·흐름을 눈으로 / 로컬 소유권 지키며 시각적 사고.
- **현재 도구·우회법:** FigJam·Miro·Milanote·Kinopio·Freeform·Obsidian Canvas·Excalidraw. 개인 계정 분리, 서브 캔버스로 쪼개기, 무료 한도 차면 오래된 보드 삭제.
- **핵심 페인포인트 Top 5:**
  1. 노드 100~150개에서 렉, 흐름 끊김 — "My Obsidian canvases … are noticeably laggy … it kills the enthusiasm to use the app." (forum.obsidian.md/t/why-is-obsidian-canvas-laggy-…/62135)
  2. 보드가 커지면 검색 부재로 못 찾음 — "Users have been asking for basic text search for years" (forum.figma.com/t/find-search-keywords-and-text-in-figjam/3269)
  3. 무료 한도가 프로젝트 한 번에 소진 — "a limit of 100 notes, cards, and images combined, which users can reach quickly" (capterra.com/p/165790/Milanote/pricing/)
  4. 서비스 종료/보드 잠금으로 작업물 인질 — "3 of them are locked saying i need to buy to access it" (community.miro.com/…/28959) / Canvas 개발 정체(forum.obsidian.md/t/canvas-development-has-stopped/60649)
  5. 페이지 경계가 사고를 끊음(학생, 3,565표) — "I just hit an absolute wall every time with the constraints of the page." (feedback.goodnotes.com/…/47479160-infinite-canvas)
- **이탈 이유:** 성능 한계, 무료 한도 벽, 검색/재발견 실패, 팀 중심 설계 거부감, 도구 수명 불안, 'AI 신기능만 좇는' 방향성 실망(outlinersoftware.com/topics/viewt/12528).
- **지불 의향:** 월 6~9달러대 수렴(Kinopio $6/월·$200 평생, Heptabase $8.99). 한도 벽에 부딪히면 결제보다 이탈. 평생요금/local-first 소유가 설득 포인트.
- **moss 적합도: 중.** 사적 사고판·local-first·줌 지형도가 강점. **그러나 성능이 생사** — 웹 PWA + IndexedDB로 수천 노드 60fps 팬/줌을 못 내면 기존 도구처럼 버림받음(가상화·LOD 렌더링이 MVP 필수). 도형·펜 자유도, 모바일/태블릿 편집 품질이 약하면 디자이너·학생이 금세 한계.

### P6. 프라이버시 우선 소유권 신봉자 — "사적 생각을 남의 서버에서 처리한다"
*(세그먼트: 프라이버시/local-first + AI 노트앱 사용자)*

- **상황:** Notion 프라이버시 정책을 '정말로' 읽고 충격. 일기를 쓰는데 '아무도 보면 안 되는 것'을 적는다는 자각. Evernote/Roam 가격 인상·인수로 '임대였다'는 깨달음. 쓰던 앱에 AI가 하나씩 비집고 들어오는 데 피로.
- **목표:** 사적 생각은 내 기기에만, 동기화/AI는 명시적 선택일 때만 / 회사가 망해도 데이터가 그대로 / AI 없는(또는 완전 선택적) 깨끗한 에디터.
- **현재 도구·우회법:** Obsidian(.md)·UpNote 라이프타임·Joplin·자체 Life OS+로컬 LLM. BYO-API-key, 정기 export 백업, Sync 안 쓰고 폴더 동기화.
- **핵심 페인포인트 Top 5:**
  1. 사적 생각을 클라우드가 처리 — "when I journal, I write things I don't want anyone to read. Ever. / Your private thoughts get processed on someone else's server." (solodevstack.com/blog/building-life-os-privacy-first-personal-system)
  2. local-first 약속 위반 — "the whole reason I'm using Anytype is that my data STAYS on my device … it's another node of exposure I didn't consent to." (community.anytype.io/t/local-only-vault-suddenly-syncing-…/30084)
  3. 폐쇄소스 E2EE 불신 — "Claims to be end-to-end encrypted, but still closed source … ultimately you have to trust the client … I am not a fan of privacy washing." (discuss.privacyguides.net/t/reflect-app-…/27531)
  4. AI가 무단으로 기어듦 — "the new pricing and AI creeping into the app puts me off. I'm done." (forums.dayoneapp.com/forums/topic/day-one-was-good/)
  5. E2EE의 함정(AI 처리 시 일시 복호화) — "content from end-to-end encrypted journals is temporarily not end-to-end encrypted while being processed with AI." (dayoneapp.com/guides/labs/ai-features/)
- **이탈 이유:** 인수·종료·가격 인상 후 파일 소유형 이주, AI 강제 탑재+가격 인상, local-first 약속 위반, 프라이버시 워싱, 구독 피로.
- **지불 의향:** '소유감'에 강하게 연동. 월 구독(특히 sync 볼모)엔 피로, 'pay once/라이프타임'엔 명확한 긍정(UpNote·Gravity 'own forever'). **본문 서버 미통과·오프라인·열린 포맷 export는 지불 이전의 신뢰 전제** — 유료 뒤에 숨기면 아예 진입 안 함.
- **moss 적합도: 상(조건부).** local-first·본문 서버 미통과·export·'대필 아님'이 1순위 불안과 정면 정렬. **그러나 검증 가능성 공백이 치명** — 폐쇄소스 웹 PWA면 "본문이 서버를 안 통과한다"를 말로만 하면 안 믿음. **임베딩/AI 추천이 온디바이스냐 서버냐**가 수용 여부를 가름(서버면 Day One의 '일시 복호화' 비판 재현). 상시 로컬 파일 export/자동 백업 가시화 필요.

### P7. 한국 메모앱 유목민 — 카톡 '나와의 채팅'과 노션 피로 사이
*(세그먼트: 한국 사용자 특화)*

- **상황:** 원노트→노션→옵시디언을 수년씩 이동, 새 앱마다 '세팅'이 지겨움. 또는 가장 마찰 적은 카톡 '나와의 채팅'에 링크·사진·아이디어를 던지지만 다시 못 찾고, 사진은 만료되고, 채팅방은 지우지도 못함.
- **목표:** 세팅 없이 바로 쌓기 / 또 갈아타지 않고 정착 / 민감정보·사진 노출 안 되길.
- **현재 도구·우회법:** 카톡 나와의 채팅·애플 메모·네이버 메모·노션·옵시디언. '#일' 머리표로 유사 태그, 민감정보는 올렸다 삭제.
- **핵심 페인포인트 Top 5:**
  1. 카톡: 시간순 한 줄로만 쌓여 저장은 쉽고 되찾기는 역설 — "시간순으로 흐르는 채팅방 … 폴더로 묶거나 태그로 분류할 수 없습니다 … 쌓아두기는 쉬운데 다시 찾기는 점점 어려워지는 역설" (braindetox.kr/posts/kakaotalk_send_to_me_bookmark_2026.html)
  2. 채팅방을 못 지워 통제감 상실 — "감옥에 갇힌 기분입니다 … 지울 방법이 없어요 … 두번 다시 나와의 채팅창 안 씁니다." (clien.net/service/board/park/13158560)
  3. 노션 기능 과잉 피로 — "무엇이 중요한지, 무엇부터 배워야 하는지 혼란 … 다른 앱으로 이주하려는 사람들도 나타나고 있습니다." (yozm.wishket.com/magazine/detail/2517/)
  4. 메모 무덤, 정리해도 못 찾음 — "정리의 목적은 깔끔함이 아니다. 정리의 목적은 재등장이다." (wikidocs.net/297596)
  5. 한국어 검색/초성·손글씨 검색의 벽 — "손글씨 검색이 안됩니다 / 페이지가 많아지면 앞페이지만 검색되고 뒷페이지는 먹통" (r1.community.samsung.com/…/td-p/28015649)
- **이탈 이유:** 세팅/학습 피로, 기능 과잉, 다시 못 찾음, 동기화 유료·혼란, 한글 자료 부족, 플랫폼 통제/락인 반발, 속도 지연, 꾸미기 착시.
- **지불 의향:** 조건부. 노션 4년 유료·옵시디언 Sync 결제 사례처럼 '정착할 도구'엔 냄. 레드라인은 에버노트식 무료 축소(itworld.co.kr/article/3551079). 카톡·구글킵 라이트층은 저지불 → 타깃은 '유목민·헤비 캡처러'.
- **moss 적합도: 상(조건부).** 재등장·2초 캡처·local-first·export·no-streak가 한국 담론과 정확히 포개짐. **그러나 (1) 한국어 초성·부분일치 검색과 IME 조합/중복입력은 '없으면 즉시 이탈'하는 진입 조건**(discussionskorea.apple.com/thread/256249531), (2) 라이트층에겐 무한 캔버스가 '또 다른 노션식 학습곡선'일 위험, (3) 손글씨 카드를 내세우면 삼성노트/굿노트의 '손글씨 검색 안 됨' 기대치를 그대로 떠안음.

---

## 3. 교차 페인포인트 매트릭스

| 페인포인트 | 등장 세그먼트 | 빈도 | 심각도 | 대표 인용 / 출처 | moss 관련 기능 |
|---|---|---|---|---|---|
| **write-only 묘지 / 수집가의 오류 (쌓지만 재방문 없음)** | PKM·ADHD·연구자·작가·인디해커·한국·프라이버시 (7/9) | very-common | high | "most notes are write-only and are never read back ever again" (HN 39516871) / "정리의 목적은 재등장이다" (wikidocs 297596) | 홈 재노출(다시 떠오른 생각/오늘의 연결/오늘의 질문), 군집·흐름 요약 — **핵심 차별** |
| **시스템 유지비·세팅 번아웃** | PKM·ADHD·연구자·작가·인디해커·한국 (6/9) | very-common | high | "spend more time formatting their journal than actually using it" (forum.obsidian.md/…/36106) | 제목/폴더/태그 비강제, 제로세팅 기본값, no-streak |
| **캡처 마찰 = 아이디어 소실** | ADHD·작가·인디해커·한국 (4/9) | very-common | high | "Any friction between … an idea and … capture increases the risk I will forget it" (HN 34295553) | 2초 캡처, 분류 강제 없음, 오프라인 즉시 로드 |
| **빈 캔버스 마비 / 결정 피로(어디에 둘지)** | PKM·ADHD·연구자·한국 (4/9) | common | medium~high | "blank slate paralysis" (fabric.so/comparison/…) / "where should I note this idea?" (…/105172) | 홈 재노출이 빈 화면을 메우는 온보딩, 비강제 분류 |
| **지형도 압도감 / 쌓이면 못 찾음(검색 부재)** | ADHD·시각·학생·한국 (4/9) | common~very-common | high | "20 lions attacking me at once" / "Without universal search, I'm needing to guess at what is where." (goodnotes feedback) | 줌 LOD 설계, 전역 검색(한국어 초성 필수) |
| **선형 텍스트 미스핏 / 공간적 사고 열망** | PKM·ADHD·시각·학생 (4/9) | common | medium~high | "understand by seeing … connected with lines, structure emerges from layout" (talk.macpowerusers.com/…/45607) | 무한 캔버스+줌, 수동 연결선 |
| **연결이 전부 수동 → 재부상 안 됨 / orphan** | 연구자·시각·인디해커 (3/9) | common | medium~high | "620 notes with no outgoing links … 20.5%" (zettelkasten.de comment/13712) | 임베딩 AI 연결 제안(점선, 수락/거절·거절 학습) |
| **데이터 소유권·락인·서비스 종료 공포** | PKM·연구자·시각·인디해커·프라이버시·학생·한국 (7/9) | very-common | high | "they were just renting access to it" (billmclean.substack.com/…) / (KR) "서비스가 종료해서 내보내기 작업을 급하게" (damoang.net/obsidang/37) | local-first, Markdown/JSON Canvas export |
| **구독 저항 / 기존 무료기능 축소 배신감** | PKM·ADHD·연구자·시각·인디해커·프라이버시·학생·한국 (8/9) | common | medium | "why should I pay 8.99 a month so I can make lists on my laptop" (trustpilot notion) / (KR) 에버노트 "기존 무료 기능을 제한한 방식"에 반발 (itworld 3551079) | freemium 레드라인 설계, 라이프타임/월 옵션 |
| **AI 대필 거부 / '내 질문'을 못 만듦 / AI creeping** | 연구자·작가·프라이버시 (3/9) | common~very-common | high | "AI는 요약을 해주지만, 내 질문을 대신 만들어주지는 못합니다" (maily.so/…) / "AI creeping into the app … I'm done" (dayone) | AI='응집기' 포지션, 선택적 AI |
| **streak·생산성 점수의 수치심(RSD)** | ADHD·(한국 '꾸미기 착시') (2/9) | common | high(ADHD) | "a missed day breaks the streak, which brings shame" (dev.to/nucleusos/…) | streak·점수·압박 알림 금지 선언 |
| **아이디어 과잉 → 실행/전환 마비** | 작가·인디해커 (2/9) | common~very-common | high | "99 ideas but I've not completed 1" (adultingadhd.substack) / "the more I capture, the more rewriting work" (storyletter) | 응집→분기 서사(단, 실행/초안 전환은 공백) |
| **크로스 플랫폼 단절 / 모바일·태블릿 반쪽** | 시각·학생·한국 (3/9) | common | high(학생) | "no way to export Samsung Notes to other apps … same handwriting" (r2.community.samsung.com/…) | 웹 PWA(구조적 유리), 모바일 캡처 품질 관건 |
| **출처·인용 관리 마찰(Zotero/페이지 점프)** | 연구자 (1/9, 세그먼트 내 very-common) | common | high(연구자) | "link my ZK notes to a specific part of a Zotero note" (…/105172) | **공백 — NON-GOAL과 충돌** |
| **손글씨 검색(OCR)·손글씨 소실** | 학생 (1/9, 세그먼트 내 common) | common | high(학생) | "OCR is not working for handwritten Nordic letters" / "handwritings disappeared" | 펜 카드(검색 미보장) — **리스크** |

---

## 4. moss 기능 매핑

### 4-1. 이미 잘 대응하는 것 (강점)
- **홈 재노출(다시 떠오른 생각/오늘의 연결/오늘의 질문):** 전 세그먼트 1순위 고통인 'write-only 묘지'에 정면 대응. 경쟁 노트앱 대부분이 포기한 영역이자 moss의 **단일 최대 차별점**. 사용자가 이름·위치·기억에 의존하지 않아도 생각이 먼저 돌아옴 → ADHD의 'object permanence', 한국의 '재등장', 연구자의 '과거 노트 재발견'을 동시 해결.
- **2초 캡처 + 제목/폴더/태그 비강제:** 캡처 마찰, 결정 피로, 세팅 번아웃, 카톡 '분류 못 함'을 한 번에 공략.
- **streak·생산성 점수·압박 알림 금지 + 미완성 허용:** ADHD RSD 악순환과 '20 lions' 공포의 정확한 반대편. 'task manager가 아닌 real-life organizer' 니즈 충족.
- **local-first + 본문 서버 미통과 + Markdown/JSON Canvas export:** 데이터 소유권·락인·서비스 종료 공포(7/9 세그먼트)와 프라이버시 불안을 구조적으로 해소.
- **무한 캔버스 + 줌(지형도/세부) + 수동 연결선:** 선형 텍스트 미스핏과 '보면서 이해' 열망(Heptabase류 수요) 흡수.
- **AI='대필 아닌 응집기' + 점선 추천 + 수락/거절·거절 학습:** 작가·연구자·프라이버시층의 'AI 대필 거부 + 보조 기대' 심리와 1:1 정렬.

### 4-2. 부족하거나 위험한 것
- **[재노출 품질 = 제품의 생사]** 캡처만 쉽고 재노출/연결 체감이 약하면 거대 캔버스는 '더 거대한 덤핑 그라운드'. 임베딩 정밀도·거절 학습이 **2~3주 안에** 체감돼야 함. 부정확하면 '수락/거절'이 또 하나의 정리 노동/노이즈가 되어 역효과(Mem "at 50 notes the AI suggestions feel generic").
- **[무한 캔버스의 양날]** (1) 라이트층·ADHD·PKM 입문자에게 '빈 캔버스 마비' 재생산, (2) 메모 폭증 시 축소뷰 압도감 재현, (3) PKM 베테랑에겐 '또 다른 세팅 피로'. → 캔버스를 몰라도 그냥 쌓이는 **제로세팅 기본 동선** + **LOD 정보밀도** 필수.
- **[성능이 생사 — 시각·학생 세그먼트]** 웹 PWA + IndexedDB/Canvas로 수천 노드 60fps를 못 내면 "렉으로 의욕이 꺾인다"는 1위 이탈 사유 직격. 네이티브(Miro조차)보다 불리할 수 있어 가상화·LOD 렌더링이 MVP 필수.
- **[팀 협업 NON-GOAL과 충돌]** 시각 세그먼트 상당수가 회사 팀 보드에서 넘어오는 맥락 → '개인 전용'이 차별점이자 진입 장벽. **읽기전용 공유 링크** 정도는 레퍼런스 피드백·1회성 공유 수요를 위해 고려할 가치(NON-GOAL '팀 협업'과 '최소 공유'는 구분).
- **[모바일 캡처·태블릿 손글씨]** '2초 캡처·언제든 머무름' 약속은 모바일/태블릿에서 깨지기 쉬움(Heptabase 모바일 불만 전례). 공유시트 수준 초저마찰 진입이 없으면 카톡 '나와의 채팅' 디폴트를 못 이김. PWA 터치/펜 레이턴시가 전환·잔존 1차 변수.
- **[손글씨 검색(OCR)]** 펜 카드를 내세우면 GoodNotes/삼성노트의 '손글씨 검색 안 됨' 기대치를 떠안음. 펜 카드가 검색 안 되면 치명적. **범위를 명확히 긋거나**(가벼운 스케치용) 최소 OCR/텍스트 결합 필요.
- **[AI 프라이버시 — 데이터 흐름 투명성]** '본문 서버 미통과'를 말로만 하면 프라이버시층은 안 믿음. **임베딩/추천이 온디바이스냐 서버냐**를 투명 고지하지 않으면 Day One '일시 복호화' 비판 재현. 폐쇄소스면 오픈소스 클라이언트/외부 감사 없이는 핵심 지지층을 못 얻음.
- **[출처·인용 관리 공백 — 연구자]** Zotero/BibTeX·PDF 하이라이트 유입과 출처-카드 추적이 '있으면 좋음'이 아니라 생존 조건에 가까움.
- **[아웃풋 전환 공백 — 연구자·작가]** '노트→초안(outline/섹션)'이 약하면 동일한 '수집 함정' 재생산. 캔버스→선형 초안 뷰·외부 에디터 export 왕복 충실도가 관건.
- **[한국어 기본기 — 전 한국 사용자]** 초성·부분일치 검색, 한글 IME 조합/중복입력 안정성은 '없으면 즉시 이탈'하는 진입 조건.

### 4-3. 새로 고려할 기회
- **'응집 레이어' 포지셔닝:** 학생·연구자에게 'GoodNotes/Obsidian을 대체'가 아니라 '그 위에 얹히는 사고의 상층부(연결·재발견·소유)'로 접근. 필기/노트 export를 받아 개념을 잇고 과거를 재노출.
- **설명 가능한 AI 연결:** '왜 이 연결인지' 근거 제시 + 거절 학습의 가시적 체감 → PKM 베테랑·연구자의 'Smart Connections 회의'를 신뢰로 전환.
- **라이프타임/월 옵션 + '유료 해지해도 내 데이터는 그대로' 보장:** 구독 저항층(프라이버시·시각·한국 유목민)의 전환 레버.
- **실행 핸드오프:** 인디해커·크리에이터의 '응집→분기→실행(export로 넘기기)' 서사로 '예쁜 보관함' 전락 방지.

---

## 5. 안티 페르소나 (moss가 노리지 말아야 할 사람)

1. **팀 협업·공유 워크플로가 핵심인 조직 사용자.** NON-GOAL(팀 협업). Miro/FigJam/Notion의 실시간 협업·권한·댓글을 기대하면 근본 미스핏. moss의 가치는 '사적 사고판'이라 다인 편집에 타협하는 순간 정체성이 무너짐.
2. **업무/태스크·프로젝트 관리와 생산성 지표를 원하는 사람.** NON-GOAL. streak·점수·완료율로 동기부여받는 신경전형 생산성 추종자에게는 moss의 'no-streak·미완성 허용·머무름'이 오히려 허전함. Todoist/Things/Linear가 적합.
3. **AI 대필(초안 자동 생성)을 원하는 사람.** NON-GOAL이자 작가 세그먼트의 집단적 거부 대상. "AI가 글을 대신 써주니 월 2만원" ROI를 기대하면 실망. Notion AI/Jasper류가 적합.
4. **정밀 필기 앱 자체를 대체하려는 태블릿 헤비 필기러.** 교과서 PDF 정밀 주석·레이어드 필기·전문가급 팜리젝션/필기감은 GoodNotes/Notability의 코어이자 moss 펜 카드의 약점. moss로 '필기 앱 대체'를 기대하면 실망(단, '응집 레이어'로는 적합).
5. **시험 벼락치기·단기 성적 최적화 학생.** 간격 반복(SRS)·플래시카드로 단기 암기를 원하면 Anki가 우위. moss의 '완료 아닌 머무름' 철학과 충돌.
6. **본문의 완전 검증 가능한 오픈소스/감사를 절대 조건으로 삼는 극단 프라이버시 사용자.** moss가 폐쇄소스 웹 PWA인 한, 로컬 LLM·Joplin·자작을 택하는 이 하위층은 애초에 설득 난도가 매우 높음(투자 대비 전환율 낮음 — 핵심 타깃에서 제외 권장).
7. **'노트앱에 월정액 절대 안 냄 + 무료 대안(종이·ColorNote·카톡)에 만족'하는 저지불 라이트층.** 획득은 하되 **유료 전환 타깃에서는 제외** — freemium 무료 구간 체류를 전제로 설계.

---

## 6. 근거 품질 메모 (약한 근거 · 검증 필요 가설)

**근거가 강한 축 (strong, 1차 인용 풍부):**
- ADHD의 '덤핑 그라운드/object permanence/20 lions/streak 수치심' (r/ADHD·Obsidian 포럼 다수 verbatim)
- 연구자의 'orphan/재발견/출처연동/atomicity 붕괴' (forum.obsidian.md/…/105172 — 최고 밀도 1차 출처)
- 인디해커의 '캡처 지연=소실', 'write-only' (HN 다수 verbatim)
- 시각 세그먼트의 '렉/검색부재/무료한도/인질' (GoodNotes feedback 3,565표, Obsidian·Miro·Figma 포럼)
- PKM 세팅 번아웃 (forum.obsidian.md/…/90236)

**약한 근거 (weak/검색 요약·직접열람 실패·벤더 편향):**
- 한국어 검색·초성·손글씨 검색 먹통 (삼성멤버스 403으로 원문 요약 기반 — evidence weak)
- 한글 IME 중복입력 (애플 토론, weak)
- '폴더는 연결이 아니다'(tilnote), 캔버스 양방향 링크 불만(dsebastien concept) — 직접 확인 못 함, weak
- Mem 'generic 제안' (aiagentrank.io 리뷰, weak)
- memx.app 'AI 죽으면 기억도 죽나' (벤더 글, weak)
- 2sync·notion 공식 블로그 등 **이해관계 있는 벤더 소스** (편향 주의)

**추가 검증(인터뷰)이 필요한 핵심 가설:**
1. **한국 세그먼트의 1차 인용이 얇다.** 캡처/재노출/시각적 사고에 대한 한국 ADHD·크리에이터·학생의 직접 증언이 영어권 대비 빈약(뉴닉·브런치·클리앙·다모앙 중심, 대체로 moderate). 한국어 우선 제품이므로 **디스콰이엇·더쿠·네이버카페·클리앙·GeekNews 심층 조사 + 한국 사용자 인터뷰**가 최우선.
2. **'재노출이 실제로 재방문 습관을 만드는가' vs '노이즈만 더하는가'** — monoznote 메이커도 공개 질문. moss의 AI 연결·재노출의 체감 효용은 **프로토타입 사용성 테스트로만 검증 가능**. (리서페이싱 앱 수요는 실재하나 리텐션 근거는 약함)
3. **'2초 캡처의 가벼움'과 '무한 캔버스의 무게'가 공존 가능한가.** 라이트층에게 캔버스가 '또 다른 노션'으로 읽힐지 — 온보딩 A/B 필요.
4. **WTP 구체 수치는 대부분 추정/주변 제품 생태 기반(moderate~weak).** 작가·크리에이터의 직접 가격 지불 인용은 미확보. 실제 가격 민감도·전환점은 **가격 실험(월 vs 연 vs 라이프타임, freemium 한도)**으로 검증.
5. **출처관리·초고전환 공백이 연구자 도입을 실제로 막는가** — 이 두 공백이 '있으면 좋음'인지 '생존 조건'인지 연구자 인터뷰로 확정 필요.
6. **손글씨 검색 기대치** — 펜 카드를 전면에 두지 않으면 리스크가 완화되는지, 아니면 손글씨 자체가 비핵심인지 학생 세그먼트 검증 필요.

---

## 7. 출처 목록 (입력 데이터에 등장한 것만)

**PKM / 세컨드브레인:**
- forum.obsidian.md/t/1-year-after-posting-my-severe-addiction-i-dont-really-use-obsidian-anymore/90236
- toolsforhumans.ai/blog/your-second-brain-is-write-only-heres-why-most-notes-never-get-revisited
- dsebastien.net/ai-wiki-pkm-pkm-anti-patterns/
- home.rosano.ca/log/page/2/
- producthunt.com/p/buddy-ai-note/where-do-your-notes-go-to-die
- glasp.ai/articles/building-a-second-brain
- forum.zettelkasten.de/discussion/comment/12683
- developers.fabric.so/comparison/heptabase-vs-obsidian
- trustpilot.com/review/notion.so?page=2
- news.hada.io/topic?id=4730 (KR)
- hn.nuxt.dev/item/48896229
- iwoszapar.com/p/obsidian-vs-second-brain
- thesweetsetup.com/a-big-update-to-our-pkm-comparison-guide-…
- talk.macpowerusers.com/t/obsidian-vs-heptabase-for-in-depth-study-notes/45607

**ADHD / 신경다양성:**
- reddit.sentinel-team.org/posts/1rcoljl/… , reddit.sentinel-team.org/posts/1rg339r/…
- forum.obsidian.md/t/trying-to-find-a-good-setup-for-adhd/12218
- forum.obsidian.md/t/a-maintainable-second-braind-for-someone-with-adhd/36106
- hn.svelte.dev/item/45594777
- newneek.co/@moba/article/14379 (KR)
- fishbowlapp.com/post/i-tried-notion-…-adhd-…-spectacular-failure
- dev.to/nucleusos/adhd-support-app-no-streaks-why-gamification-hurts-more-than-it-helps-1ae0
- simplypsychology.org/object-permanence-and-adhd.html
- brunch.co.kr/@abowlforafish/1 (KR)
- numo.ai/community/ym92l3l/is-this-app-really-worth
- chadd.org/adhd-news/adhd-news-adults/…mind-maps-to-navigate-adult-adhd/
- marco.org/2026/08/

**연구자 / Zettelkasten:**
- forum.obsidian.md/t/a-phd-student-facing-difficulties-with-his-6-months-zk/105172
- maily.so/linked.note/posts/mjz6qm8wrwk (KR)
- theiterativelife.substack.com/p/the-zettelkasten-trap
- forum.zettelkasten.de/discussion/comment/22068/ , /comment/13712
- zettelkasten.de/posts/the-friction-fallacy/
- zettelkasten.de/posts/noris-zettelkasten-journey-why-she-let-it-go-interview/
- forums.zotero.org/discussion/133462
- forum.obsidian.md/t/any-chance-for-a-xmas-new-years-sync-publish-discount/28888
- digitalbiztalk.com/article/2-years-2094-notes-the-obsidian-reality-check
- casrai.org/guides/note-taking-methods (KR) , fastcampus.co.kr/biz_online_obsidian (KR)

**작가 / 크리에이터:**
- producthunt.com/p/socra-socratic-ai-tutor-partner/why-most-note-taking-apps-fail-writers-…
- deepakness.com/blog/notion-not-for-writers/
- tim-schreiber.beehiiv.com/p/why-i-hate-swipe-files
- awai.com/2016/02/bringing-order-to-swipe-file-chaos/
- adhdos.substack.com/p/how-i-rediscovered-the-best-tool
- annaluciawrites.substack.com/p/why-i-dont-keep-an-idea-list/comments
- publishersweekly.com/pw/print/20251110/99019-new-report-examines-writers-attitudes-toward-ai.html
- kuow.org/stories/more-than-70-writers-send-open-letter-about-ai-to-literary-publishers
- yozm.wishket.com/magazine/detail/2517/ (KR) , wikidocs.net/blog/@rudah96/14042/ (KR)
- superlazy-api-ne3g.onrender.com/blog/what-should-go-in-your-second-brain
- storyletter.substack.com/p/to-build-a-note-is-note-taking-productive

**시각적 사고자 / 디자이너:**
- forum.obsidian.md/t/why-is-obsidian-canvas-laggy-but-e-g-clover-canvas-smooth/62135
- forum.obsidian.md/t/plugin-canvas-markdown-side-editor/106568
- forum.figma.com/t/find-search-keywords-and-text-in-figjam/3269
- macstories.net/reviews/freeform-leverages-the-freedom-and-flexibility-of-a-blank-canvas/
- community.miro.com/ask-the-community-45/free-plan-won-t-let-me-create-a-4th-board-…/28959
- community.miro.com/ask-the-community-45/boards-are-very-laggy-…/12191
- outlinersoftware.com/topics/viewt/12528
- forum.obsidian.md/t/canvas-development-has-stopped/60649
- forum.obsidian.md/t/when-is-obsidian-canvas-ever-going-to-be-actually-finished/76602
- wiki.heptabase.com/newsletters/2024-06-01
- capterra.com/p/165790/Milanote/pricing/
- medium.com/@TechTim42/tips-for-using-obsidian-canvas-b2719459b442
- yozm.wishket.com/magazine/detail/1047 (KR)
- apptisan.substack.com/p/kinopio , saas.apppricinglab.com/alternatives/heptabase/

**인디해커 / PM / 개발자:**
- news.ycombinator.com/item?id=34295553, 32254468, 30429474, 39516871, 30344588, 38835788, 33103605, 49775766
- adultingadhd.substack.com/p/divergent-thinking-i-have-99-ideas
- hn.algolia.com/?query=would%20you%20pay%20note%20taking&type=comment
- slite.com/learn/obsidian-vs-notion (weak) , tilnote.io/pages/6a2fba20feda101b0aa0f3da (KR, weak) , concepts.dsebastien.net/concept/obsidian-canvas/ (weak)

**한국 특화:**
- braindetox.kr/posts/kakaotalk_send_to_me_bookmark_2026.html
- clien.net/service/board/park/13158560
- yozm.wishket.com/magazine/detail/2517/ , /2518
- gpters.org/ai-writing/post/preparation-stage-creating-your-9I33W09RQpMJSVq
- wikidocs.net/297596
- notion.com/ko/blog/notion-on-android-is-now-more-than-twice-as-fast-to-launch (벤더)
- androidauthority.com/why-i-ditched-notion-for-google-keep-3635125
- itworld.co.kr/article/3551079 (에버노트 요금제 축소)
- r1.community.samsung.com/…/삼성노트-손글씨-검색/td-p/28015649 (weak)
- discussionskorea.apple.com/thread/256249531 (weak)
- 2sync.com/ko/blog/is-notion-a-good-note-taking-app (벤더, 편향)

**프라이버시 / local-first:**
- solodevstack.com/blog/building-life-os-privacy-first-personal-system
- community.anytype.io/t/local-only-vault-suddenly-syncing-…/30084
- discuss.privacyguides.net/t/reflect-app-encrypted-note-taking-app/27531
- forums.dayoneapp.com/forums/topic/day-one-was-good/ , dayoneapp.com/guides/labs/ai-features/
- billmclean.substack.com/p/the-great-note-taking-trap
- goodluckman.substack.com/p/the-collectors-fallacy-why-most-notetaking
- talk.macpowerusers.com/t/replacement-for-tana/44724
- damoang.net/obsidang/37 (KR, moderate)
- reddit.sentinel-team.org/posts/1s7vcky/…
- memx.app/blog/if-your-ai-shuts-down-do-memories-die/ (벤더, weak)
- hunted.space/product/lists-notes , peerlist.io/tmanchester/project/gravity--the-simplest-notes

**학생 / 손글씨:**
- feedback.goodnotes.com/…/47479160-infinite-canvas (3,565표)
- feedback.goodnotes.com/…/20443087-universal-search-across-documents-folders-pages
- feedback.goodnotes.com/…/40953457-open-data-format-for-goodnotes
- reddit.com/r/GoodNotes/comments/1ko9qe0/livid/ , /1i8r91u/my_notes_are_gone_again/
- eu.community.samsung.com/t5/tablets/handwritings-dissapeared-on-samsung-notes/td-p/10860931
- r2.community.samsung.com/t5/Tablets/Very-bad-samsung-notes-app-experience/m-p/15621726
- thenextweb.com/news/notability-subscription-free-note-taking-app
- reddit.com/r/ipad/comments/1ic4dfi/my_notes/ , reddit.com/r/studytips/comments/1jpkcbn/aesthetic_notes/
- superlearninglab.substack.com/p/fix-your-forgetting-machine-build/comments
- notelyn.com/ko/blog/can-goodnotes-make-flashcards-for-you (KR)

---

*주: 본 리포트는 9개 세그먼트 에이전트의 2차 수집 데이터를 종합한 것으로, 한국 사용자 1차 인용의 얇음과 재노출·WTP 가설의 검증 부재(§6)를 전제로 읽어야 한다. 제품 의사결정 전 한국 커뮤니티 심층 조사 + 타깃 페르소나(특히 P2·P6·P7) 인터뷰를 권장한다.*