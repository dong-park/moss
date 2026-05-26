# FEAT-signals — Slice 1: 키워드 + 리듬 (로컬, LLM 0)

PRD §13 SCR-signals 중 LLM 없이 즉시 구현 가능한 두 섹션만 다룬다. 군집(LLM 임베딩)과 흐름 요약(Claude Haiku)은 후속 슬라이스.

## 목표 (Goal)

사용자가 사이드바의 ✦ 시그널스를 클릭하면 우측에서 420px 패널이 미끄러져 들어와, **최근 7일** 메모를 기반으로 **반복 키워드(상위 8개)** 와 **시간대별 사고 리듬(24시간 히스토그램)** 을 보여준다. 모든 계산은 클라이언트에서 수행되고 외부 호출은 없다.

## 비목표 (Non-goals)

- **SIG-cluster** (군집 그래프) — 임베딩 의존, 후속.
- **SIG-summary** (자연어 흐름 요약) — Claude Haiku, 후속.
- **quota-exhausted 상태** — LLM 호출이 없어 quota 자체가 없음.
- **키워드 클릭으로 워크스페이스 필터링** — 필터 상태/라우팅 설계가 별도. 이번엔 hover/active 시각 피드백만 (stub).
- **모바일 전체화면 변형** — 데스크톱 슬라이드 패널만. 모바일은 후속.
- **dismissedAt 24시간 재노출 금지 로직** — 인사이트 카드 단위 dismiss는 군집/요약과 함께 도입할 때 의미가 큼.
- **형태소 분석기(kuromoji 등) 도입** — 단순 토큰 빈도 + stop-words로 시작.
- **g s 단축키** — Slice 1은 클릭 진입만. 단축키 바인딩은 후속.

## 성공 기준 (Done criteria — 측정 가능)

1. Sidebar에 ✦ Signals 항목이 캡처 그룹과 분리되어 표시되고, 클릭하면 우측에서 420px 패널이 슬라이드 인.
2. 패널이 열린 상태에서 ESC를 누르거나 × 버튼을 클릭하면 슬라이드 아웃.
3. **메모 ≥ 10**: 패널에 두 섹션 모두 데이터가 표시된다.
   - 키워드: 상위 8개, `{단어} {빈도}` 형식. 빈도 내림차순. 한국어/영어 stop-words 제외.
   - 리듬: 0~23시 24개 바 차트. 막대 높이는 해당 시간대의 최근 7일 메모 수.
4. **메모 < 10 (data-empty)**: 두 섹션 모두 안내 문구 표시 — "조금 더 머무르면 패턴이 보일 거예요". 빈 placeholder.
5. **aiOptOut=true 메모는 집계에서 제외**한다 (전역 옵트아웃 settings.aiOptOutGlobal=true이면 패널 전체가 잠금 상태 — "시그널스를 켜면 패턴이 보입니다" + 설정 링크).
6. 메모 변경(추가/수정/삭제)이 발생하면 **패널이 열려있는 동안** 자동으로 재계산되어 UI에 반영된다 (dexie liveQuery 구독).
7. 외부 네트워크 호출 0건. fetch / API route 추가 없음.
8. 신규 컴포넌트/훅에 대한 단위 테스트:
   - `extractKeywords()`: 한국어 텍스트, 영어 텍스트, 혼합, stop-words 제외, 빈 입력, 동률 처리.
   - `buildRhythm()`: 빈 배열, 단일 시간대 집중, 정확히 7일 경계.
   - `useSignals()` 훅: 빈 DB, 메모 10개 미만(`empty: true` 반환), 10개 이상(데이터 반환), aiOptOut 메모 제외.

## 경계 조건 (Edge cases)

- **본문이 빈 메모** (content === "") → 토큰화에서 자동 제외. 리듬 카운트에는 포함 여부 결정: **포함하지 않는다** (사용자가 "사고를 남긴" 시점만 리듬으로 본다).
- **kind가 text/highlight/code/checklist가 아닌 메모** (image/audio/file/handwriting/link/mindmap) → 키워드는 본문 텍스트만 토큰화하므로 자연스럽게 제외. **리듬은 모든 kind 포함** (사고가 어떤 형태로든 남았다는 신호).
- **createdAt 기준**으로 "최근 7일" 정의 — `Date.now() - 7*24*60*60*1000` 이후.
- **타임존**: 사용자 로컬 타임존으로 hour-of-day 계산. UTC 아님.
- **stop-words**: 한국어 — 조사("은/는/이/가/을/를/의/에/도/와/과/로/으로/만/까지/부터/처럼"), 의존명사("것/수/때/번"), 흔한 부사("그리고/그러나/그래서/하지만/또는/그냥"), 1-2글자 한글 단어 중 의미 적은 것. 영어 — 표준 100여개 stop-words.
- **토큰화 규칙**: 한글은 2글자 이상 어절 단위, 영어는 3글자 이상 단어. 숫자만으로 된 토큰 제외. 동일 메모 내 중복 토큰은 1회만 카운트(같은 메모가 결과를 지배하지 않도록).
- **메모 1000개 초과**: 7일 윈도우로 자르고도 메모리 부담 시? Slice 1 가정 — 100명 베타에서 7일 활성 메모 < 500개. 정식 가드는 후속.
- **패널이 열린 채 라우트 변경**: 패널은 워크스페이스 화면 안의 오버레이로 한정. SCR-workspace에서만 활성. 다른 라우트로 떠나면 자연스럽게 unmount.
- **AGENTS.md 경고**: Next.js 16 — 새 route handler/server feature 추가 없음. 100% 클라이언트 컴포넌트로만 구현하여 충돌 가능성 차단.
- **PWD/scope**: 모든 파일은 `/Users/donghwan/moss/web/src/` 하위. 새 디렉터리는 `src/components/signals/`와 `src/state/signals/`만.

## 아웃풋 위치 (UI)

- 진입: Sidebar 하단 (Trash 위)에 새 그룹 `INSIGHT_GROUP` 신설 → ✦ Signals 1개 항목.
- 패널: 워크스페이스 화면 우측 가장자리에 fixed 420px 폭, 100vh, transform translate-x 애니메이션 (300ms ease-out).
- 본문 영역은 §13 PRD 그림의 두 섹션 (반복 키워드 / 사고 리듬). 군집·요약 자리에는 "다음에 도착" 형태의 옅은 안내 1줄 (미완성 허용 톤).

## 기술 스택 (이미 결정)

- Dexie + fake-indexeddb (테스트). `liveQuery` 사용해 메모 변경 자동 반영.
- Radix Primitives + 직접 토큰 (UI 스택 메모리 준수: shadcn/ui 금지).
- vitest. 5초+ 콜백/setTimeout 주의 (folder-memo 교훈) — 본 슬라이스는 그런 콜백 없음.

## 리스크 / 가정

- 메모 본문은 plain text라고 가정. 마크다운/리치텍스트면 토큰화 전 stripping 필요 → 현재 store에 plain string으로 저장되어 있는지 PLAN에서 확인.
- 한국어 stop-words 리스트가 짧으면 노이즈 키워드 노출 가능. Slice 1 수용 — 후속에서 형태소 분석 도입.
- `g s` 단축키와 PRD의 dismissedAt 같은 행동은 후속 슬라이스의 일이라고 사용자 합의됨.
