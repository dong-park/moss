# 메모 툴 프로덕션화 squad — 작업 분배 보드

> 메모 에디터 사용성을 프로덕션 레벨로 끌어올릴 액션 10개를 **10 워커 1:1**로 분할.
> 핫스팟 `MarkdownEditor.tsx`(10중 6) + `state/workspace.ts`(10중 4)에 집중되므로
> **P0 사전 리팩터(확장 슬롯화)** 가 critical path. 워커는 자기 파일만 추가 → 충돌 0.
>
> 작성일 2026-06-03 · 출처: 메모 에디터 코드 실측(MarkdownEditor/text·Content/MarkdownToolbar/workspace.ts).

## 워커 단위 (10 + P0)

| ID | 스펙 | 액션 | 핫스팟 | 우선 | 추정 |
|---|---|---|---|---|---|
| **P0** ✅ | [FEAT-memo-editor-seams.md](FEAT-memo-editor-seams.md) | 에디터 확장 슬롯화 + persist seam | MarkdownEditor·workspace | **P0** | M~L |
| **W1** | [FEAT-memo-autosave-guard.md](FEAT-memo-autosave-guard.md) | 자동저장 유실 가드 + 저장 인디케이터 | state/cardPersist(신규) | C | M |
| **W2** | [FEAT-memo-image-paste.md](FEAT-memo-image-paste.md) | 이미지 붙여넣기·드롭 → OPFS | editor/paste(신규) | C | M |
| **W3** | [FEAT-memo-incard-format.md](FEAT-memo-incard-format.md) | 인카드 버블/슬래시 서식 | editor/bubble(신규) | C | M |
| **W4** | [FEAT-memo-fulltext-search.md](FEAT-memo-fulltext-search.md) | 메모 전문 검색 + 캔버스 필터 | state/memoSearch(신규) | C | M |
| **W5** | [FEAT-memo-wikilinks.md](FEAT-memo-wikilinks.md) | `[[위키링크]]` + 백링크 | editor/wikilink(신규) | C | L |
| **W6** | [FEAT-memo-paste-sanitize.md](FEAT-memo-paste-sanitize.md) | 붙여넣기 정제(HTML→MD) | editor/paste(신규) | C | S |
| **W7** | [FEAT-memo-empty-cleanup.md](FEAT-memo-empty-cleanup.md) | 빈 메모 자동 정리 | workspace 액션 | C | S |
| **W8** | [FEAT-memo-multitab-sync.md](FEAT-memo-multitab-sync.md) | 다중 탭 동기화 | state/db/liveSync(신규) | C | M |
| **W9** | [FEAT-memo-a11y.md](FEAT-memo-a11y.md) | 접근성(role·aria·단축·포커스) | editor 컨테이너 | C | S |
| **W10** | [FEAT-memo-autolink.md](FEAT-memo-autolink.md) | URL 자동 링크화 | editor/autolink(신규) | C | S |

---

## DAG (의존성 그래프)

```
                ┌──────────── P0 (critical path) ────────────┐
                │ FEAT-memo-editor-seams                       │
                │  ① editorPlugins[] 슬롯  (W5·W10 등록)        │
                │  ② pasteHandlers[] 파이프라인 (W2·W6 등록)    │── 인터페이스 확정
                │  ③ bubbleMenuItems[] 슬롯 (W3 등록)           │   (extensions.ts)
                │  ④ EditorRegion 컨테이너(role/aria) (W9 보강)  │
                │  ⑤ cardPersist seam: flushCard/flushAll       │   (state/cardPersist.ts)
                └───────────────────────────────────────────────┘
                                     │ 전원 P0 머지 후 풀림
        ┌───────────┬───────────┬────┴──────┬───────────┬──────────┐
        ▼           ▼           ▼           ▼           ▼          ▼
  [에디터 슬롯]   [페이스트]    [버블]      [워크스페이스]   [DB]      [a11y]
   W5 wikilink   W2 image    W3 format   W1 persist     W8 sync   W9 region
   W10 autolink  W6 sanitize             W4 search                
                                          W7 empty
```

**P0 없이는 어떤 워커도 시작 불가** — 6개가 같은 에디터를, 4개가 같은 store를 만지기 때문.
P0가 슬롯/seam을 박으면 10명이 **각자 신규 파일 + 등록 1줄**만 → 진짜 병렬.

## P0 — Critical path (단독 우선, 머지 전 전원 대기)

| ID | 작업 | 핵심 산출 | 의존 |
|---|---|---|---|
| **P0** | [FEAT-memo-editor-seams.md](FEAT-memo-editor-seams.md) | `_shared/editor/extensions.ts`(3 슬롯 배열) · `EditorRegion` 컨테이너 · `state/cardPersist.ts`(flush seam) · MarkdownEditor를 슬롯 소비로 리팩터 | 없음 |

P0가 **확장 인터페이스(아래 §인터페이스)** 를 확정해야 C 그룹 10명이 풀린다.

## C — P0 완료 후 전원 병렬 (10명)

| 그룹 | 워커 | 등록 지점 | 신규 파일 소유 |
|---|---|---|---|
| 에디터 플러그인 | W5, W10 | `extensions.ts` `editorPlugins[]` 1줄 | `editor/wikilink.ts`, `editor/autolink.ts` |
| 페이스트 | W2, W6 | `extensions.ts` `pasteHandlers[]` 1줄 | `editor/imagePaste.ts`, `editor/sanitizePaste.ts` |
| 버블 툴바 | W3 | `extensions.ts` `bubbleMenuItems[]` | `editor/BubbleToolbar.tsx` |
| 워크스페이스 | W1, W4, W7 | `workspace.ts` append-only 액션 | `state/cardPersist.ts`(W1·P0공유), `state/memoSearch.ts`(W4) |
| DB | W8 | store subscribe 1곳 | `state/db/liveSync.ts` |
| 접근성 | W9 | `EditorRegion` props 보강 | (P0 컨테이너 확장) |

---

## ⚠️ 조율점 — `extensions.ts` & `workspace.ts`

10 워커 1:1이라 두 파일이 공동 등록소가 된다. **append-only + 머지 순서 고정**으로 충돌 0:

**`_shared/editor/extensions.ts`** — 세 배열에 워커가 자기 항목 1줄씩 추가(서로 다른 줄):
| 배열 | 추가 워커 |
|---|---|
| `editorPlugins[]` | W5(wikilink), W10(autolink) |
| `pasteHandlers[]` | W2(image), W6(sanitize) — **순서 중요: sanitize 먼저, image 나중**(정제 후 이미지 추출) |
| `bubbleMenuItems[]` | W3 |

**`state/workspace.ts`** — store 객체에 액션 append(서로 다른 줄):
| 액션 | 워커 |
|---|---|
| `flushCard`/`flushAll` 위임 (→ cardPersist.ts) | W1 |
| `searchMemos` 셀렉터 (→ memoSearch.ts) | W4 |
| `deleteCardIfEmpty` | W7 |
| liveSync 구독 init (→ liveSync.ts) | W8 |

**머지 순서 고정: P0 → W5 → W10 → W6 → W2 → W3 → W1 → W4 → W7 → W8 → W9.**
각 워커는 자기 등록 줄 + 자기 신규 파일 밖 수정 금지(`git diff --stat`로 검출).

## 인터페이스 (P0 확정 ✅ — 워커 해제됨)

> P0 구현 완료(게이트 통과: tsc 0 · vitest 555 · eslint 0). 워커는 아래 실제
> 시그니처를 보고 자기 항목을 등록한다. **머지 전이라도 P0 브랜치
> `feat/memo-editor-seams`를 기준점으로 잡으면 곧장 시작 가능.**

```ts
// _shared/editor/extensions.ts (신설)
import type { MilkdownPlugin } from "@milkdown/ctx";
import type { EditorView } from "@milkdown/prose/view";

export type PasteHandler = (view: EditorView, event: ClipboardEvent | DragEvent) => boolean; // true=소비
export type BubbleMenuItem = {
  id: string; label: string; aria: string;
  isActive?: (view: EditorView) => boolean;
  run: (view: EditorView) => void;
};
export const editorPlugins: MilkdownPlugin[];   // 평탄화 완료. W5/W10이 배열에 한 줄 추가
export const pasteHandlers: PasteHandler[];      // [] — pasteSlot이 .some()으로 순서대로 시도(첫 true 소비)
export const bubbleMenuItems: BubbleMenuItem[];  // [] — bubbleSlot이 선택 추적, BubbleMenuHost가 렌더
// 버블 store(호스트가 구독): subscribeBubble / getBubbleState / getBubbleServerSnapshot

// _shared/editor/BubbleMenuHost.tsx (신설) — MilkdownInner에 이미 마운트됨. W3는 bubbleMenuItems만 채움
// _shared/editor/EditorRegion.tsx (신설) — <EditorRegion editable label?> display:contents 래퍼. W9가 보강
//   (현재 role=textbox/aria-multiline/aria-readonly/aria-label, 라벨은 prop 기본 "메모 편집기" — W9가 i18n)

// state/cardPersist.ts (신설)
export function schedulePersist(id: string, run: () => Promise<void>): void; // 300ms 디바운스(워크스페이스 내부)
export function flushCard(id: string): Promise<void>;   // 디바운스 무시 즉시 기록 — W1
export function flushAll(): Promise<void>;               // 대기 전부 flush(beforeunload/언마운트) — W1
export function cancelPersist(id: string): void;         // 실행 없이 취소(삭제 경로)
// workspace.ts가 flushCard/flushAll 재노출(import { flushCard, flushAll } from "@/state/workspace" 가능)
```

**등록 예시(워커가 extensions.ts에서 추가하는 한 줄):**
```ts
editorPlugins: [..., ...wikilink /*W5*/, autolink /*W10*/]
pasteHandlers: [sanitizePasteHandler /*W6 먼저*/, imagePasteHandler /*W2 나중*/]
bubbleMenuItems: [...memoBubbleItems /*W3*/]
```

---

## 우선순위 요약

| 우선순위 | 시작 | 작업 수 | 비고 |
|---|---|---|---|
| **P0** | 지금 | 1 | critical path — 슬롯/seam 확정 |
| **C** | P0 머지 후 | 10 | 전원 병렬, 등록 1줄 + 자기 파일 |

**최대 동시 작업자**: P0 후 10명. WIP는 리뷰·머지 대역폭으로 제한(권장 4~6 동시, 머지 순서대로 흡수).

## 작업자 brief (1줄씩 — 복사 전달)

- "P0: `docs/specs/FEAT-memo-editor-seams.md` 전체. extensions.ts 3슬롯 + EditorRegion + cardPersist seam, MarkdownEditor를 슬롯 소비로 리팩터. 인터페이스를 본 보드 §인터페이스에 박기. 단독 우선, 전원 대기."
- "W1: `FEAT-memo-autosave-guard.md`. cardPersist flush + beforeunload/언마운트 + 저장 인디케이터. workspace는 flush 위임 1줄."
- "W2: `FEAT-memo-image-paste.md`. editor/imagePaste.ts, pasteHandlers[]에 등록(image=나중). OPFS blob 저장."
- "W3: `FEAT-memo-incard-format.md`. editor/BubbleToolbar.tsx + bubbleMenuItems[] 등록. MarkdownToolbar 로직 재사용."
- "W4: `FEAT-memo-fulltext-search.md`. state/memoSearch.ts + workspace searchMemos 셀렉터 + 캔버스 하이라이트."
- "W5: `FEAT-memo-wikilinks.md`. editor/wikilink.ts(Milkdown 플러그인) + editorPlugins[] 등록 + 백링크 셀렉터."
- "W6: `FEAT-memo-paste-sanitize.md`. editor/sanitizePaste.ts, pasteHandlers[]에 등록(sanitize=먼저)."
- "W7: `FEAT-memo-empty-cleanup.md`. workspace deleteCardIfEmpty + Content blur 훅. 빈 메모 자동 삭제."
- "W8: `FEAT-memo-multitab-sync.md`. state/db/liveSync.ts(BroadcastChannel/Dexie liveQuery) + store 구독 1줄."
- "W9: `FEAT-memo-a11y.md`. EditorRegion role/aria-label/단축(Cmd+B/I)/포커스 링 보강."
- "W10: `FEAT-memo-autolink.md`. editor/autolink.ts + editorPlugins[] 등록. URL 자동 링크화."

## 갱신 규칙

- P0 머지 즉시 §인터페이스를 실제 시그니처로 갱신(워커 차단 해제 신호).
- WS 머지/완료 시 위 표 상태 갱신, 스펙 Status를 `✅ complete (날짜)`로.
- 부분 완료면 스펙 §1 위에 `## 0. 잔여 작업` 추가.
- cross-reference는 `[[FEAT-xxx]]` 형식.
