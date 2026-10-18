# relay — 메모판 그룹 선 + 이미지 템플릿 + 포스트잇 메모
갱신: 2026-10-18 11:40 KST · 이전 스레드: 01a14c95-9251-7c80-8c22-fba2735e7719 · 작업 디렉터리: /Users/donghwan/.codex/worktrees/87f5/moss · 브랜치: worktree/frame-image-template

## 목표
spec/frame-image-template DAG(노드 7개)를 웨이브로 끝까지 돌린다. 메모판은 화이트보드 그림 대신 피그마 그룹 같은 1px 선 + 바깥 이름표, 배경은 우클릭으로 올리는 이미지 한 장, 메모는 접착 띠 있는 정사각형 포스트잇. 마지막 n6은 사람 확인 대기로 끝난다.

## 끝난 것
- 도크 스펙(FEAT-sticky-redesign)을 실제 버튼 8개 순서에 맞춤 + 그래프 작성 — 20aa390
- 웨이브 1: n1 그룹 선 83c027d, n2 배경 저장·정리·비율 3b6a417, 리뷰 수정 4e9bc62(옛 파일을 새 ref 저장 뒤 삭제). /review APPROVE. 보고서 wave-20261018-1125.md
- 웨이브 1 기록·D6/D7 닫기 — 5bdaeab
- web 의존성: bun install 완료(레포는 bun, npm 아님)

## 남은 것
1. 자동화 대상 바꾸기: ~/.codex/automations/*/automation.toml 중 target_thread_id가 01a14c95-9251-7c80-8c22-fba2735e7719인 것(지금 automation-2 "메모판 웨이브 감시", 5분 heartbeat)의 대상을 새 스레드 id로 바꾼다. rrule과 프롬프트의 [알림] 문단은 그대로 둔다. 첫 동작: automation_update mode view로 automation-2를 읽는다.
2. 담당 바꾸기: `spec-board apply spec/frame-image-template`를 한 번 불러(출력은 mktemp 파일로) 담당 스레드를 자기로 바꾼다. pending·wait만으로는 안 바뀐다. 지금 반영할 입력은 0개였다.
3. 웨이브 2 처리: 스레드 01a14cd5-0127-7dd0-a128-9492d188fd76(노드 n3 n5 n7)가 승인 대기에 멈춰 있다. 그 스레드 샌드박스는 /Users/donghwan/moss만 쓸 수 있어 워크트리의 .wave 잠금 쓰기에 권한 상승을 요청했다. 아직 잠금·노드 상태·커밋 없음. 첫 동작: `wait_threads`(timeoutMs 0)로 그 스레드 상태를 본다. 사용자가 승인해 돌고 있으면 기다리고, 여전히 막혀 있으면 사용자에게 "그 스레드에서 승인하거나, 닫고 새로 열지" 알린다. 새로 열 때는 워크트리에 쓸 수 있게 연다.
4. 다음 웨이브 첫 메시지(wave 스킬 형식)에 새 메인 스레드 id와 `알림 승인: 사용자가 끝날 때 메인 스레드로 완료 알림 한 줄을 보내는 것을 승인했다.` 줄을 넣는다. base 브랜치는 worktree/frame-image-template. 모델은 pick_model.py로 정한다. 프로젝트 moss의 projectId 16a64828-921b-4bfd-a761-05d680c334d5(경로 /Users/donghwan/moss — 워크트리와 다르다).
5. 웨이브 2 뒤 n4(세로 칸 걷기), 그다음 n6(실브라우저 캡처 → 확인 대기). 모든 노드가 끝나거나 사람 확인만 남으면 automation-2를 지운다.

## 정한 결정
- 2026-10-18 사용자 결정: 웨이브 감시 하트비트(automation-2)는 30분 간격이다. 5분으로 되돌리지 않는다. 완료는 WAVE-DONE 알림, 멈춘 웨이브는 보드 wavewatch가 먼저 잡는다.
- D1~D5: 사용자가 보드에서 모두 A(추천)로 답함 — 실선, 판을 이미지 비율로, 원본 진하기, 옛 세로 칸 판은 칸 그림 없이 그룹 선(columns 데이터 보존), 판 위 이미지 드롭은 지금처럼 사진 카드.
- D6 포스트잇 모양 A(접착 띠), D7 색 또렷하게 A — 답이 없어 추천대로 닫음(되돌리기 쉬움). D7은 메모 색 스펙의 "옅고 차분한 톤"과 부딪혀 confidence 낮음. 9/13에 CSS 노랑으로 바꿨다 종이 결이 사라져 되돌린 전례가 있어 n7은 잡음 무늬로 결을 남긴다.
- 배경은 판 행의 attachmentRef·mediaType, 원본 크기는 content의 bg {w,h}. 새 칸·테이블 없음.

## 막힌 점·주의
- 아직 답 없는 사람 결정: 없음(D1~D7 모두 끝남). 보드 입력이 들어오면 go 「턴 시작」 절차로 반영한다.
- 웨이브 2 스레드가 권한 승인 대기(남은 것 3).
- 기준선 실패 테스트 Canvas.virtualization은 전부터 실패한다.
- 리뷰 남은 P2: 같은 ref를 두 판이 공유하면 삭제 위험(복제 경로 없음), 판 삭제 undo 없음.
- push·머지는 사람이 한다.

## 다시 읽을 파일
- spec/frame-image-template/spec.md
- spec/frame-image-template/wave-20261018-1125.md
- ~/agent-env/skills/go/SKILL.md (「spec이 DAG면」 절)
- ~/agent-env/skills/wave/SKILL.md

