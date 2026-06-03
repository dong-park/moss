# 메모/펜 후속 squad — 작업 분배 보드

> [[FEAT-markdown-memo-pen]] 머지 후 `/tldr`·deep-interview에서 뽑은 액션아이템(A1/B1~B3/C1~C3/D1~D3)을 **파일 소유권 기준** 4개 워크스페이스로 분할. 마스터 인덱스는 `_index.md`, 본 파일은 이 squad 전용 보드.
>
> 작성일 2026-06-03 · 출처: `/tldr` 스켈레톤 리뷰 + deep-interview UX 피드백.

## 진행 현황 갱신 (2026-06-03)

- **WS-A/B/C/D(C2a) ✅ 완료** — 4 워커 자율 구현 → 통합 검증(tsc 0·테스트 통과)·브라우저 실측 → `main` 머지·push(`f9d43e8`).
- **C2b ✅ void (제거 안 함)** — `useHandwriting`는 handwriting 카드의 **컴포넌트 로컬** tool/width/undo를 담당해 살아있음(펜 모드 전역 상태와 별개). WS-A는 `useDrawing` 코어 추출 + 양쪽 위임으로 수렴했을 뿐 死 아님. 제거 대상 아님.
- **D3 ✅ 완료** — 스파이크 결과 "ambiguity"가 아니라 **펜 모드 overlay undo 전무**(스펙 AC-7 미구현)였음. 전역 cross-card undo/redo 스택 + Cmd+Z/Shift+Z/Cmd+Backspace를 store·Canvas에 배선(+7 테스트).
- **C3 (vitest 실행)** — 이 APFS 환경에서 545 통과로 사실상 충족. WSL drvfs 한정 이슈는 CI 위임 유지.

## 워크스페이스 단위

| WS | 스펙 | 묶음 | 우선순위 | 추정 |
|---|---|---|---|---|
| **WS-A 드로잉 엔진 통합** | [FEAT-pen-drawing-engine.md](FEAT-pen-drawing-engine.md) | C1 + A1 + D2 | **P0** | M~L |
| **WS-B 펜 모드 UX** | [FEAT-pen-mode-ux.md](FEAT-pen-mode-ux.md) | B1 + B2 + B3 | P1 | M |
| **WS-C 메모 학습성** | [FEAT-memo-learnability.md](FEAT-memo-learnability.md) | D1 | P1 | S |
| **WS-D 정리·검증** | [FEAT-memo-pen-cleanup.md](FEAT-memo-pen-cleanup.md) | C2a / C2b / C3 / D3 | P1+C+P2 | S 각 |

---

## DAG (의존성 그래프)

```
        ┌──────────── P0 (critical path) ────────────┐
        │  WS-A 엔진 통합 (C1)                         │
        │   ├ A1 finishStroke를 updater 밖으로         │── 엔진 API 확정
        │   └ D2 탭=점 1개                             │   (단일 훅/컴포넌트:
        └──────────────────────────────────────────────┘    value/active/tool/penWidth/onChange)
                          │                                    │
                          ▼ (handwriting/Content 이관)         │ 읽기 의존(약함)
              WS-D/C2b useHandwriting 死 → 제거  ◀── C         ▼
                                                       WS-B, WS-C 병렬 가능(읽기만)

  WS-B 펜 UX (B1+B2+B3) ─── 독립, workspace.ts penMode "읽기 전용" ──┐
  WS-C 학습성 (D1) ──────── 독립 (placeholder) ─────────────────────┤  P0와 동시 시작
  WS-D/C2a 죽은블록 제거 ── 독립 (grep 외부사용 0 확인) ─────────────┘
  WS-D/C3 vitest CI · WS-D/D3 undo 스파이크 ── anytime (P2)

  Critical path = WS-A ──→ WS-D/C2b
```

## P0 — Critical path (단독 우선)

| ID | 작업자 | 작업 | 핵심 | 의존 |
|---|---|---|---|---|
| **P0-A** | WS-A | [FEAT-pen-drawing-engine.md](FEAT-pen-drawing-engine.md) | DrawingLayer + useHandwriting 단일 수렴, A1·D2 흡수 | 없음 |

P0-A가 **엔진 API 확정** + `handwriting/Content` 이관을 끝내야 C 그룹(C2b)이 풀린다.

## P1 — 즉시 병렬 (서로 독립, P0와 동시)

| ID | 작업자 | 작업 | 핵심 | 추정 |
|---|---|---|---|---|
| **P1-B** | WS-B | [FEAT-pen-mode-ux.md](FEAT-pen-mode-ux.md) | HUD·affordance·툴바, penMode 읽기 전용 | M |
| **P1-C** | WS-C | [FEAT-memo-learnability.md](FEAT-memo-learnability.md) | 빈 메모 마크다운 placeholder | S |
| **P1-D** | WS-D | [FEAT-memo-pen-cleanup.md](FEAT-memo-pen-cleanup.md) C2a | 죽은 블록 제거(보존 목록 제외) | S |

## P2 — Small fix / spike (누구나·아무 때)

| ID | 작업 | 위치 | 추정 |
|---|---|---|---|
| **P2-1** | C3 vitest 실제 실행 | 비-drvfs/CI, 56케이스 GREEN | S |
| **P2-2** | D3 undo ✅ 완료 | 펜 overlay undo 전무 발견 → 전역 스택+키 배선(AC-7) | S |

## C — P0 완료 후 풀림

| ID | 작업자 | 작업 | 의존 해제 조건 |
|---|---|---|---|
| **C-1** | WS-D | C2b `useHandwriting` 제거 | ❎ **void** — handwriting 카드가 실사용(로컬 undo/도구). 死 아님, 제거 안 함 |

---

## ⚠️ 유일한 조율점 — `text/Content.tsx`

3개 WS가 같은 파일을 건드림. 영역 분리 + 머지 순서로 충돌 0:

| 영역 | 소유 WS |
|---|---|
| 하단 overlay 렌더 JSX | **WS-A** |
| 카드 chrome(wrapper className/보더/커서) | **WS-B** |
| 에디터 placeholder props | **WS-C** |

**머지 순서 고정: WS-A → WS-B → WS-C.** 각 WS는 자기 영역 밖 수정 금지(`git diff --stat`로 검출).

## 엔진 API 확정 (WS-A가 채움)

> WS-A가 옵션 A(단일 컴포넌트) / 옵션 B(단일 훅) 중 택1 후 시그니처를 여기 박는다. WS-B 툴바·WS-D 제거 판단이 이걸 참조.

```
(미정 — WS-A 머지 시 갱신)
```

---

## 우선순위 요약

| 우선순위 | 시작 시점 | 작업 수 | 비고 |
|---|---|---|---|
| **P0** | 지금 | 1 (WS-A) | critical path |
| **P1** | 지금 (P0와 동시) | 3 (WS-B/C/D-C2a) | 독립 병렬 |
| **P2** | 누구나·아무 때 | 2 (C3·D3) | small fix / spike |
| **C** | P0 완료 후 | 1 (C2b) | 의존 풀림 |

**최대 동시 작업자**: 4명 (P0 1 + P1 3). WIP ≤ worker 수, Brooks's Law 고려 4 권장.

## 작업자 brief (1줄씩 — 복사 전달)

- "P0-A WS-A: `docs/specs/FEAT-pen-drawing-engine.md` 전체. DrawingLayer+useHandwriting 단일 수렴(A1·D2 흡수), 엔진 API를 _squad 보드에 박기. 단독 우선."
- "P1-B WS-B: `docs/specs/FEAT-pen-mode-ux.md` 전체. HUD·affordance·툴바. workspace.ts penMode 읽기 전용, text/Content는 chrome만. WS-A 뒤 머지."
- "P1-C WS-C: `docs/specs/FEAT-memo-learnability.md`. 빈 메모 마크다운 placeholder 1줄. text/Content는 editor props만. WS-A·B 뒤 머지."
- "P1-D WS-D: `docs/specs/FEAT-memo-pen-cleanup.md` C2a만 먼저. 죽은 블록 제거(보존 목록 절대 금지). C2b는 WS-A 후."
- "P2-1: 비-drvfs/CI에서 vitest 56케이스 GREEN 확인. P2-2: 펜 undo 범위 실측 후 라우팅."

## 갱신 규칙

- WS 머지/완료 시 위 표 상태 갱신, 스펙 Status를 `✅ complete (날짜)`로.
- 부분 완료면 스펙 §1 위에 `## 0. 잔여 작업` 추가.
- cross-reference는 `[[FEAT-xxx]]` 형식.
