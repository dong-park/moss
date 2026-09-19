# FEAT-memo-empty-keep · 빈 메모 자동 삭제 없애기

> 빈 메모를 앱이 알아서 지우지 않는다. 사용자가 만든 메모는 사용자가 지울 때만 사라진다.

**Status**: spec 작성 (2026-09-19)
**Owner**: (미정)
**Estimated**: S
**대체하는 스펙**: [[FEAT-memo-empty-cleanup]] (W7)

---

## 1. 목표 (Job Statement)

사용자는 빈 메모를 캔버스에 놓아 두고 나중에 채우고 싶다. 지금은 새 메모에서 한 글자도 안 쓰고 편집을 끝내면 메모가 바로 사라진다. 이 자동 삭제를 없애서, 빈 메모도 다른 메모처럼 그대로 남게 한다.

## 2. 범위

### 포함 (in-scope)
- 메모 편집을 끝낼 때 도는 빈 메모 자동 삭제를 없앤다.
- 자동 삭제 뒤에 뜨던 "빈 메모 삭제됨 · 실행취소" 토스트를 없앤다.
- 자동 삭제만을 위해 있던 "한 번도 채워진 적 없음" 추적 기능을 통째로 없앤다.
- 이 기능 전용 테스트를 지운다.
- 옛 스펙 [[FEAT-memo-empty-cleanup]]과 스쿼드 문서의 W7 행을 "폐기"로 고친다.

### 제외 (out-of-scope)
- 사용자가 직접 지우는 흐름. 삭제 키, 메뉴 삭제, 다중 삭제는 그대로 둔다.
- 빈 메모 placeholder 힌트. [[FEAT-memo-learnability]]가 맡고 그대로 둔다.
- "빈 카드면 다음 카드를 만들지 않는다"는 흐름 규칙. [[FEAT-card-flow]]의 규칙이고 삭제가 아니다.
- 빈 메모를 한 번에 정리하는 명령. 필요하면 다음 iteration에서 따로 정한다.
- 이미 저장된 빈 메모를 옮기거나 고치는 일. 저장 형식이 바뀌지 않아서 할 일이 없다.

## 3. 수용 기준 (Acceptance Criteria)

"빈 메모"는 본문 마크다운이 비었거나 공백뿐이고, 펜 획도 없는 메모다. 이미지·링크·녹음·파일 블록은 본문 마크다운 안에 들어가므로, 블록만 있는 메모는 빈 메모가 아니다. 이 스펙 이후에는 두 경우 모두 똑같이 보존된다.

### AC-1 새 빈 메모가 남는다
- **Given** 독에서 메모를 끌어 캔버스에 놓아 새 메모를 만든다
- **When** 한 글자도 안 쓰고 캔버스 빈 곳을 눌러 편집을 끝낸다
- **Then** 메모가 캔버스에 그대로 있다. 저장소의 notes 행도 그대로 있다.

### AC-2 새로고침 뒤에도 남는다
- **Given** AC-1처럼 빈 메모를 남겨 두었다
- **When** 페이지를 새로고침한다
- **Then** 같은 자리에 빈 메모가 다시 보인다.

### AC-3 내용을 모두 지운 메모도 남는다
- **Given** 글이 있던 메모의 본문을 모두 지운다
- **When** 편집을 끝낸다
- **Then** 메모가 그대로 남는다. 이 동작은 지금과 같다.

### AC-4 토스트가 뜨지 않는다
- **Given** AC-1 상황이다
- **When** 편집을 끝낸다
- **Then** "빈 메모 삭제됨" 토스트가 뜨지 않는다.

### AC-5 직접 삭제는 그대로 된다
- **Given** 빈 메모 하나를 선택했다
- **When** 기존 삭제 동작을 쓴다
- **Then** 메모가 지워진다. 동작은 이 스펙 전과 같다.

### AC-6 코드에 흔적이 없다
- **Given** 구현을 마친 코드다
- **When** `deleteCardIfEmpty`, `wasNeverFilled`, `startEmptyTracking`, "빈 메모 삭제됨"을 검색한다
- **Then** 앱 코드와 테스트에서 하나도 안 나온다. 문서 기록은 예외다.

## 4. 의존성

### 다른 feature
- **대체**: [[FEAT-memo-empty-cleanup]]. 이 스펙이 그 동작을 거꾸로 되돌린다.
- **함께 사는 것**: [[FEAT-sticky-redesign]]. 카드 종류가 메모 하나뿐이고 본문이 마크다운 블록이라, 빈 메모 정의가 위 §3 문단과 맞는다.

### 외부 라이브러리·API
- 추가 없음.

## 5. 데이터 모델

바뀌지 않는다. DB 버전도 그대로다.

## 6. 인터페이스

### Store (Zustand) actions
- `deleteCardIfEmpty(id)`를 없앤다. 부르는 곳은 메모 본문 편집기의 blur 한 곳뿐이다.
- 다른 액션은 바뀌지 않는다.

### React 컴포넌트
- 메모 본문 편집기의 blur는 편집 종료만 한다.

## 7. 시각·인터랙션

편집을 끝내도 메모가 사라지지 않는다. 토스트도 없다. 빈 메모에는 지금처럼 placeholder 힌트가 보인다.

## 8. 비기능 요구사항

- **데이터 보호**: 앱이 사용자 메모를 스스로 지우는 경로가 0개가 된다.
- **성능**: 카드가 바뀔 때마다 모든 카드를 훑던 추적 구독이 사라진다. 느려지는 곳은 없다.

## 9. 다음 iteration (의도적 보류)

- 빈 메모 일괄 정리 명령 — 사용자가 원할 때만 수동으로 부르는 방식이라면 따로 스펙을 쓴다.

## 10. 검증 방법 (DOD)

- [ ] AC-1부터 AC-6까지 만족한다.
- [ ] 자동 삭제 전용 테스트 파일을 지운다.
- [ ] 편집 종료 뒤 빈 메모가 남는지 확인하는 단위 테스트를 1개 더한다.
- [ ] `tsc --noEmit` 오류 0개.
- [ ] `vitest run` 전부 통과. 실패 수가 이 작업 전보다 늘지 않는다.
- [ ] 수동 시나리오: 독에서 빈 메모를 만들고, 편집을 끝내고, 새로고침해도 남는지 본다.
- [ ] 옛 스펙 Status와 스쿼드 문서 W7 행을 고친다.

## 구현 메모

### 자동 삭제가 도는 지점

트리거는 하나다. 메모 본문 편집기의 blur다. 창 닫기, 새로고침, 메모 창 전용 경로는 없다.

| 역할 | 위치 |
|------|------|
| 트리거 | `web/src/components/workspace/cards/text/Content.tsx:111` — `onBlur={() => { onCommitEdit(); useWorkspace.getState().deleteCardIfEmpty(card.id); }}` |
| 액션 타입 | `web/src/state/workspace.ts:410-415` — 주석과 `deleteCardIfEmpty` 선언 |
| 액션 구현 | `web/src/state/workspace.ts:1854-1895` 부근 — 필터 삭제, `cancelPersist`, `forgetCard`, `storage.removeNote`, 토스트 push |
| import | `web/src/state/workspace.ts:35-43` — `useToasts`와 `@/state/emptyCleanup` 5개 심볼 |
| 구독 시작 | `web/src/state/workspace.ts:2323-2325` — `startEmptyTracking(useWorkspace)` |
| 추적 모듈 | `web/src/state/emptyCleanup.ts` 파일 전체 |
| 테스트 | `web/src/state/__tests__/emptyCleanup.test.ts` 파일 전체 |

### 할 일 목록

노드가 3개라 plan DAG 문서는 따로 만들지 않는다.

1. STEP-1 `Content.tsx:111` blur를 `onBlur={onCommitEdit}`로 바꾼다. 주석 `W7` 삭제.
2. STEP-2 `workspace.ts`에서 `deleteCardIfEmpty` 선언·구현, `emptyCleanup` import, `startEmptyTracking` 호출을 지운다. `useToasts` import도 지운다. 확인해 보니 `workspace.ts`에서 쓰는 곳은 W7 토스트 1곳뿐이다.
3. STEP-3 `emptyCleanup.ts`와 그 테스트를 지운다. 대체 단위 테스트를 추가한다. 옛 스펙 Status를 `⛔ 폐기 (2026-09-19) — [[FEAT-memo-empty-keep]]로 대체`로, `_squad-memo-production.md` 26행 W7 표기를 폐기로 고친다.

### 얽힘 확인

- 워크스페이스에 전역 undo 스택은 없다. 있는 것은 `penUndoStack`뿐이고 펜 획 전용이다. 자동 삭제의 "실행취소"는 토스트 버튼 안의 스냅샷 복원이라, 지워도 다른 undo 경로에 영향이 없다.
- `hasMemoText`, `hasOverlayStrokes`, `isMemoEmpty`를 쓰는 곳은 `emptyCleanup` 모듈과 그 테스트뿐이다. 모듈째 지워도 된다.
- 옛 스펙 §7의 "fade-out 150ms"는 구현된 적이 없다. 지울 CSS가 없다.
- `commitAndAddNext`의 "빈 카드면 편집만 종료"는 삭제를 하지 않는다. 손대지 않는다.
