# FEAT-signals Slice 1 — Plan

spec.md를 구현 가능한 작업 단위로 분해. 모든 경로는 `web/` 기준.

## 1. 핵심 결정

### 1-1. 메모 변경 구독 = `liveQuery` 직접 사용

- `dexie@4.4.2`의 `liveQuery()`는 외부 패키지 없이 IndexedDB 변경 이벤트를 Observable로 노출한다.
- `useEffect` 안에서 `liveQuery(() => recent7d()).subscribe(...)` → setState. unsubscribe는 cleanup.
- `dexie-react-hooks` 추가하지 않는다 (의존성 1개 감소).

### 1-2. 패널은 Radix Dialog가 아닌 직접 구현

- PRD §13 "워크스페이스 뒤에 흐려짐"은 약한 backdrop이지 strict modal이 아니다. 캔버스 입력은 계속 가능해야 한다.
- `Radix Dialog`는 `aria-modal` + focus trap이 강해 의도와 어긋남.
- `<aside role="complementary">` + 직접 ESC 핸들러로 충분. shadcn/ui 금지(메모리) — 직접 토큰 사용.

### 1-3. 패널 open state는 page.tsx에 hoist

- 단일 boolean. zustand store까지 도입할 가치 없음.
- `useState` + props 콜백 (Sidebar onSignalsClick, Panel onClose).
- 추후 단축키 `g s`를 도입할 때 store로 끌어올리는 게 자연스러우면 그때 리팩터.

### 1-4. opt-out 처리는 useSignals 훅 안에서

- `settings.aiOptOutGlobal === true` → 훅이 `{ status: 'opt-out' }` 반환.
- 노트 단위 `aiOptOut === true` → 7일 윈도우에서 자체 제외.
- 패널 UI는 status별 3 분기: `'opt-out'` | `'empty'`(메모 < 10) | `'ready'`.

### 1-5. 디자인 톤

- 베이스: `var(--color-panel)`, 종이 그레이.
- 강조: 차분한 라임 / 더스티 블루 (디자인 토큰 기존 값 사용). cool SaaS 블루 금지(메모리).
- 모션: 300ms ease-out, transform translateX. 등장 시 미세 회전 없음(섹션 내부 키워드 카드만 80~120ms ease-out으로 stagger 가능 — 후속).
- Milanote 영감(메모리): 카드 그림자 + 섹션 사이 충분한 여백.

## 2. 파일 매니페스트

### 신규 (web/src 기준)

| 파일 | 책임 |
|---|---|
| `state/signals/stopwords.ts` | 한/영 stop-words 상수 + helper `isStopWord(token)` |
| `state/signals/extractKeywords.ts` | `(notes: Note[]) => KeywordItem[]` 순수 함수 |
| `state/signals/buildRhythm.ts` | `(notes: Note[]) => number[]` 길이 24 |
| `state/signals/useSignals.ts` | liveQuery 구독 + 7일 윈도우 + opt-out 분기 |
| `state/signals/types.ts` | `KeywordItem`, `SignalsState` 인터페이스 |
| `components/signals/SignalsPanel.tsx` | 슬라이드 인/아웃 컨테이너 + ESC + × 버튼 |
| `components/signals/KeywordsSection.tsx` | 키워드 8개 카드 리스트 |
| `components/signals/RhythmSection.tsx` | 24-bar 히스토그램 (인라인 SVG) |
| `components/signals/SignalsLockedSection.tsx` | opt-out 잠금 안내 |

### 테스트

| 파일 | 케이스 |
|---|---|
| `state/signals/__tests__/extractKeywords.test.ts` | 한국어 / 영어 / 혼합 / stop-words 제외 / 빈 입력 / 동률 정렬 / 메모 내 중복 토큰 1회 |
| `state/signals/__tests__/buildRhythm.test.ts` | 빈 / 단일 시간대 / 분산 / 7일 경계 / 빈 본문 메모 제외 |
| `state/signals/__tests__/useSignals.test.tsx` | empty (notes < 10) / ready (notes ≥ 10) / aiOptOutGlobal=true → opt-out / aiOptOut 노트 개별 제외 |

### 수정

| 파일 | 변경 |
|---|---|
| `components/workspace/Sidebar.tsx` | `INSIGHT_GROUP` 추가 (Trash 위), props로 `onSignalsClick` 전달, 새 SidebarItem variant (drag 비활성) |
| `app/page.tsx` | open state + `<SignalsPanel open={...} onClose={...} />` |
| `i18n/messages/ko.json` | `signals.*` 키 8개 |

## 3. i18n 키

| 키 | 값 |
|---|---|
| `signals.sidebar.label` | "시그널스" |
| `signals.title` | "시그널스" |
| `signals.close` | "닫기" |
| `signals.keywords.heading` | "반복 키워드" |
| `signals.rhythm.heading` | "사고 리듬" |
| `signals.rhythm.subtitle` | "최근 7일 · 시간대별" |
| `signals.empty.title` | "조금 더 머무르면 패턴이 보일 거예요" |
| `signals.empty.body` | "메모가 10개를 넘으면 시그널이 떠오릅니다." |
| `signals.optout.title` | "시그널스를 켜면 패턴이 보입니다" |
| `signals.optout.body` | "설정에서 AI 기능을 켤 수 있어요." |
| `signals.upcoming.label` | "다음에 도착 — 군집·흐름 요약" |

## 4. 알고리즘 세부

### 4-1. extractKeywords

```
입력: notes (이미 7일 윈도우 + opt-out 필터링됨)
1. notes 순회 — 각 노트의 content를 토큰화
   - 한글 어절: /[가-힣]{2,}/g
   - 영어 단어: /[a-zA-Z]{3,}/g (소문자 정규화)
   - 숫자만/숫자혼합은 제외 (한글/영어 정규식이 자동 처리)
2. 메모당 토큰을 Set으로 만들어 중복 1회 카운트
3. 전역 Map<token, count> 누적
4. stop-words 제거
5. count 내림차순 정렬 → 상위 8개
   동률은 토큰 사전순(stable)
출력: [{ token, count }, ...]
```

### 4-2. buildRhythm

```
입력: notes (7일 + opt-out + 본문 비어있지 않은 것)
1. result = new Array(24).fill(0)
2. for note of notes:
     if (!note.content.trim()) continue   // 빈 본문 제외
     const hour = new Date(note.createdAt).getHours()  // 로컬 타임존
     result[hour] += 1
출력: number[24]
```

### 4-3. useSignals

```
- useEffect:
    const obs = liveQuery(async () => {
      const cutoff = Date.now() - 7*24*60*60*1000
      const all = await db.notes
        .where('createdAt').above(cutoff)
        .filter(n => !n.aiOptOut)
        .toArray()
      return all
    })
    const sub = obs.subscribe(setNotes)
    return () => sub.unsubscribe()
- aiOptOutGlobal=true → 즉시 'opt-out' 반환
- notes.length < 10 → 'empty'
- 아니면 keywords = extractKeywords(notes), rhythm = buildRhythm(notes), status='ready'
```

## 5. Task 분해 (BUILD 단계 슬라이스)

| ID | 작업 | 검증 |
|---|---|---|
| T-1 | stopwords.ts + types.ts | TS build green |
| T-2 | extractKeywords.ts + 테스트 | `pnpm vitest extractKeywords` green |
| T-3 | buildRhythm.ts + 테스트 | `pnpm vitest buildRhythm` green |
| T-4 | useSignals.ts + 테스트 | `pnpm vitest useSignals` green |
| T-5 | i18n ko.json 키 추가 | `pnpm run check-i18n` green |
| T-6 | SignalsPanel + Keywords/Rhythm/Locked 섹션 | TS green, 수동 시각 점검 |
| T-7 | Sidebar에 INSIGHT_GROUP 추가 + page.tsx mount | UI 동작 확인 |
| T-8 | 전체 vitest + check-i18n + 수동 dev 서버 확인 | TEST phase로 |

## 6. 순서 / 의존성

```
T-1 ── T-2 ──┐
       T-3 ──┼── T-4 ──┐
              │         │
       T-5 ──┘         T-6 ── T-7 ── T-8
```

순수 함수 → 훅 → UI 순. 각 단계마다 원자적 커밋.

## 7. 위험 / 미해결

- **Note.content가 마크다운인지 확인 필요** — BUILD T-1 이전에 1회 grep. plain string으로 가정.
- **dexie liveQuery + fake-indexeddb 테스트 호환성** — useSignals 테스트는 `@testing-library/react`의 `renderHook` + `waitFor`로 비동기 처리. 기존 embeddingQueue.test 패턴 참고.
- **AGENTS.md** Next.js 16 경고 — 본 슬라이스는 새 route handler 0건, 100% client component. 직접 영향 없음.

## 8. 비범위 (Slice 1에 포함 안 함)

- 키워드 클릭 → 워크스페이스 필터링
- `g s` 단축키
- dismissedAt 24h 비노출
- 모바일 전체화면 변형
- SIG-cluster, SIG-summary
- 키워드 stagger 애니메이션
