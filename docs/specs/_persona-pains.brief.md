# spec-writer 브리프 — 줄기: 페르소나 리서치에서 나온 이탈 원인 막기

## 작업
moss 레포(/Users/dongpark/moss)에 **줄기(stem) 문서**를 새로 쓴다.
- 경로: `/Users/dongpark/moss/spec/persona-pains/README.md` (슬러그는 더 나은 게 있으면 바꿔도 됨, 최종 경로를 돌려줄 것)
- 템플릿: `~/.claude/skills/spec/templates/stem.md`
- 이번 작업은 **줄기 README만** 쓴다. 개별 티켓 스펙 본문은 쓰지 않는다. 대신 README에 "티켓 후보" 표를 둔다 (슬러그 | 한 줄 목표 | 대응 페르소나 | 근거 리서치 절 | 기존 스펙과 겹침 | 우선순위 P0/P1/P2). 티켓은 이후 `/spec`으로 하나씩 `spec/persona-pains/<슬러그>.md`에 쓴다.

## 사용자가 확정한 요구사항
- 리서치 **전체**를 한 줄기로 묶는다 (재노출·AI 연결, 기본기, 신뢰·소유권, 연구자/작가 아웃풋, 손글씨, 가격 원칙 모두).
- **개인 사고가 우선, 팀 협업은 보너스.** 공유·실시간 협업은 이 줄기에 넣지 않는 것(경계)으로 적는다.

## 왜 하는지 (머리 표 `문제` 칸 후보 — 다듬어도 됨)
moss가 노리는 사람들이 기존 메모앱을 떠나는 이유(적어 두고 다시 안 봄, 세팅 피로, 한국어 검색·성능 같은 기본기 부재, 내 생각이 어디로 가는지 모르는 불신)를 moss가 아직 다 막지 못한다.

## 상위 줄기
없음

## 확인된 사실 (이 세션이 직접 확인)
1. 리서치 리포트: `/Users/dongpark/moss/docs/research/personas.md` (페르소나 P1~P7, 교차 페인포인트 매트릭스 §3, moss 기능 매핑 §4-1 강점 / §4-2 위험 / §4-3 기회, 안티 페르소나 §5, 근거 품질 §6). 원자료 `docs/research/personas.raw.json`(9개 세그먼트, 페인포인트 128개). **반드시 읽고 근거로 삼을 것.** 리포트 §2·§5는 팀 협업을 NON-GOAL로 전제했는데 아래 3번처럼 뒤집혔다.
2. 블루프린트 `docs/moss.blueprint.json` description의 NON-GOALS: 팀 협업, 실시간 공동 편집, 업무/태스크 관리, 캘린더, AI 대필, streak·완료율 지표.
3. **비목표 뒤집힘:** `docs/specs/FEAT-collab-auth.md` — 링크 공유 + Google 로그인 + Yjs 실시간 공동 편집이 2026-09-28 구현 완료. 사용자 결정: 개인 사고가 우선, 협업은 보너스. 구조 결정에 한 줄 남길 것.
4. 캔버스 가상화는 이미 있음: `docs/specs/FEAT-canvas.md` AC-3 — `useVirtualizedCards` viewport 컬링, 200개 임계 토스트. 성능 티켓은 이것과 겹침을 명시.
5. 줌 단계별 정보량(LOD) 작업이 진행 중: 커밋 안 된 `web/src/components/workspace/cards/_shared/zoomLod.ts` + 테스트 존재(미확인: 내용).
6. 기존 스펙(겹침 확인 대상, 내용은 미확인): `docs/specs/` 아래 FEAT-home, FEAT-signals, FEAT-ai-pipeline, FEAT-memo-fulltext-search, FEAT-mobile, FEAT-freemium, FEAT-export, FEAT-pen-drawing-engine, FEAT-pen-mode-ux, FEAT-onboarding-routes, FEAT-canvas-initial-view. 최근 스펙 관례는 `spec/` 폴더(예: `spec/card-clipboard.md` + `spec/card-clipboard/nN-*.md`).
7. 현재 브랜치 feat/card-clipboard, 마지막 커밋 fe1c961.

## 티켓 후보 (리서치 §4에서 뽑음 — 합치거나 빼도 됨, 기존 스펙과 겹치면 표시)
- 재노출 품질과 2~3주 안 체감 (홈 '다시 떠오른 생각/오늘의 연결/오늘의 질문')
- 설명 가능한 AI 연결 + 거절 학습이 눈에 보이게
- 빈 캔버스 마비 없는 제로세팅 첫 동선
- 메모 폭증 시 축소뷰 압도감 (줌 LOD)
- 한국어 초성·부분일치 전역 검색 + 한글 IME 조합 안정성
- 수백~수천 카드 캔버스 성능
- 모바일 2초 캡처 (공유시트/PWA share target) — 카톡 '나와의 채팅' 대체
- AI·임베딩 데이터 흐름 공개(온디바이스 vs 서버), 로컬 백업 가시화
- export 왕복과 '진짜 내 파일' 감각
- 손글씨 카드 범위 결정 (검색/OCR 하거나, 스케치용으로 범위를 긋거나)
- 캔버스 → 선형 초안 넘기기 (작가·연구자 아웃풋)
- 연구자 출처·인용 (Zotero) — 넣을지 경계로 뺄지 판단
- 가격 원칙: 기존 무료 기능 축소 금지, 월/평생 옵션

## 열린 질문 처리
사용자에게 직접 못 묻는다. 판단이 필요한 건 README 끝 "열린 질문"으로 돌려줄 것. 단 우선순위·경계는 리서치 근거로 먼저 제안해 둘 것.
