# relay — 메모판 그룹 선 + 이미지 템플릿 + 포스트잇 메모
갱신: 2026-10-18 14:20 KST · 이전 스레드: 01a14cd5-fb6b-7581-82d6-2e4ffd4f2e43 · 작업 디렉터리: /Users/donghwan/.codex/worktrees/87f5/moss · 브랜치: worktree/frame-image-template

## 목표
spec/frame-image-template DAG(노드 7개)를 웨이브로 끝까지 돌린다. 메모판은 1px 그룹 선 + 바깥 이름표, 배경은 우클릭으로 올리는 이미지 한 장, 메모는 접착 띠 있는 정사각형 포스트잇. 마지막 n6은 사람 확인 대기로 끝난다. 지금 구현은 모두 끝났고 n6의 사람 눈 확인만 남았다.

## 끝난 것
- n1 그룹 선 83c027d, n2 배경 저장·정리·비율 3b6a417(+4e9bc62) — 웨이브 1, /review APPROVE (wave-20261018-1125.md)
- n3 배경 우클릭 메뉴·그리기 891d7ca, n5 내보내기 cd122dd, n7 CSS 포스트잇 e37d124 — 웨이브 2 (wave-20261018-1215.md). 웨이브 스레드가 줄 수 때문에 리뷰를 못 돌려 메인이 5축으로 심사: REQUEST_CHANGES → 수정 5b1ba8b(같은 이름 판 배경이 마크다운 내보내기에서 덮어써짐, 배경은 STORE) → APPROVE. 보고서에 판정과 남은 P2 기록(ac74ce1)
- n4 세로 칸 스킨 코드 걷기 ff54954 — 웨이브 3 (wave-20261018-1300.md), /review APPROVE. 옛 columns 판은 그룹 선 판으로 읽고 skin·columns 데이터는 보존
- n6 실화면 캡처 6장(evidence/n6, 해시 모두 다름)과 스펙 문서 3곳 갱신 89774d8 — 웨이브 4 (wave-20261018-1345.md), /review 생략(문서만). 상태 확인 대기
- 감시 하트비트 automation-2는 사용자가 "하트비트 중단"이라 해서 지웠다. 지금 이 DAG에 걸린 자동화는 없다

## 남은 것
1. 자동화 확인: ~/.codex/automations/*/automation.toml 중 target_thread_id가 01a14cd5-fb6b-7581-82d6-2e4ffd4f2e43인 것이 있으면 대상을 새 스레드 id로 바꾼다(rrule과 프롬프트는 그대로). 없으면 새로 만들지 않는다. 첫 동작: `rg -l 01a14cd5-fb6b ~/.codex/automations/`.
2. 담당 바꾸기: `spec-board apply spec/frame-image-template`를 한 번 불러(출력은 mktemp 파일로) 담당 스레드를 자기로 바꾼다. 작업 디렉터리 /Users/donghwan/.codex/worktrees/87f5/moss에서 부른다. 지금 반영할 입력은 0개였다.
3. n6 사람 확인 결과가 apply에 오면 go 「턴 시작」대로 반영한다. 통과면 n6 끝남 → DAG 완료이므로 마지막 메시지에 노드별 결론과 웨이브별 판정을 적는다. 고쳐줘면 n6 브리프가 진행으로 돌아오니 `spec-board ready spec/frame-image-template/spec.md`로 다음 웨이브를 정해 wave 스킬 형식으로 첫 메시지를 보낸다(메인 id는 `echo $CODEX_THREAD_ID`, 알림 승인 줄은 "알림 승인: 사용자가 끝날 때 메인 스레드로 완료 알림 한 줄을 보내는 것을 승인했다.", base 브랜치 worktree/frame-image-template, 모델은 pick_model.py, projectId 16a64828-921b-4bfd-a761-05d680c334d5). 입력이 없으면 기다리고, 새로 할 일이 없으면 사용자에게 "n6 확인 대기" 한 줄만 알린다.
4. 사용자가 push·PR을 시키면 그때 한다(지금은 하지 않는다).

## 정한 결정
- D1~D5: 사용자가 보드에서 모두 A(추천)로 답함 — 실선, 판을 이미지 비율로, 원본 진하기, 옛 세로 칸 판은 칸 그림 없이 그룹 선(columns 데이터 보존), 판 위 이미지 드롭은 사진 카드.
- D6 포스트잇 접착 띠 A, D7 색 또렷하게 A — 답이 없어 추천대로 닫음(되돌리기 쉬움). 9/13에 CSS 노랑으로 바꿨다 종이 결이 사라져 되돌린 전례가 있어 n7은 잡음 무늬로 결을 남겼다.
- "판 모양" 우클릭 메뉴가 배경 메뉴로 바뀐 것은 의도다(spec: n3이 바꾸고 n4가 코드를 걷음). 리뷰 P1로 올라왔으나 기각.
- 같은 ref를 두 판이 공유할 때 배경 바꾸기·지우기가 파일을 지우는 문제는 앱 전체의 기존 패턴이라 P2로 두고 이번에 고치지 않는다.
- 배경은 판 행의 attachmentRef·mediaType, 원본 크기는 content의 bg {w,h}. 새 칸·테이블 없음.

## 막힌 점·주의
- 아직 답 없는 사람 결정: ① n6 「확인할 것」 6항목 통과/고쳐줘(선 구분, 이름표 편집, 배경 올리기·바꾸기·지우기, 배경 위 글씨, 포스트잇 다섯 색 구분, 판 끌기 흔들림). 보드에서 사용자가 답한다. ② 포스트잇 노랑 6단계 id 해시를 한 색으로 줄일지(사람이 정함, n7은 지금 유지) — 보드 행은 아니고 웨이브 2 보고서의 「기다리는 것」에 있다.
- 미증명: 판 50장 멤버 끌기 프레임 시간(헤드리스로 못 잼), 옛 세로 칸 판의 실브라우저 확인. n6 캡처의 판 크기·메모 위치·옛 칸 판 content는 스토어에 직접 넣어 만들었다.
- 관찰: 선택 안 한 판의 선이 연회색이라 배경색과 가깝다(사람 확인 1번에서 볼 것).
- 남은 P2(웨이브 2): 배경 바꾸기 때 revoke된 URL이 한 프레임 보일 수 있음, 누락된 배경이 내보내기에서 조용히 빠짐, 배경 SVG 허용, 큰 해상도 이미지 디코드 메모리, MEMO_TINTS[1] 두 곳 하드코딩, data-memo-tint 속성 뜻 변경. 웨이브 3 P2: baseWidth 주석 용어, frameSkinRoundTrip 파일명, 옛 판 fixture 중복 등.
- 기준선: mossBridge.test DatabaseClosedError 간헐 실패(변경 전에도). 웨이브 4 시점 전체 vitest 1440건 통과.
- 이 스레드 샌드박스가 워크트리에 쓸 수 없으면 spec-board apply 등에서 권한 상승이 필요하다.
- push·머지는 사람이 한다.

## 다시 읽을 파일
- spec/frame-image-template/spec.md
- spec/frame-image-template/n6-finish.md
- spec/frame-image-template/wave-20261018-1345.md
- ~/agent-env/skills/go/SKILL.md (「spec이 DAG면」 절, 「턴 시작」 절)
