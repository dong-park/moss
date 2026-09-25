# FEAT-memo-table-view · 전체 메모 표 보기

> 캔버스를 뒤지지 않고 모든 보드의 메모를 노션 데이터베이스 표처럼 한 번에 보고, 찾고, 정리한다.

**Status**: 구현 완료 (WORK — 리뷰 대기)
**Owner**:
**Estimated**: M
**Blueprint**: (신규)

---

## 0. 결정 기록 (grill 2026-09-24)

| 결정 | 선택 | 근거 / 반대 선택의 위험 |
|---|---|---|
| 속성 | **기존 필드만**, 사용자 정의 속성 없음 | 속성을 넣으면 메모 앞면·메모창에도 편집 UI가 필요해져 뷰 하나가 메모 모델 전체를 바꾼다 (S→L) |
| 뷰 형태 | 표(테이블) + 정렬·필터·검색 | 칸반은 그룹 기준 속성이 없어 보류 |
| 범위 | 모든 보드의 메모 (함 안 서브보드 포함) | 현재 보드만이면 함에 묻힌 메모를 못 찾는다 |
| 기본 필터 | 보드 = 현재 보드 | 처음 열 때 맥락 유지, 한 번에 "전체"로 |
| 진입 | 헤더 `캔버스 | 표` 토글 | |
| 행 클릭 | 메모창 열기 · "캔버스에서 보기"로 해당 보드·위치 점프 | |
| 표 편집 | 제목 인라인 편집 + 다중 선택 → 휴지통 | 읽기 전용이면 정리하려고 표를 열어도 매번 메모창을 오가야 한다 |
| 색 | **읽기 전용 스와치**, 색 편집·필터·그룹 없음 | 메모 색은 id 해시(FEAT-memo-variety)라 DB에 없고 의미도 없다 |
| 보드 간 이동 | 보류 | 대상 보드 어디에 놓을지 배치 규칙이 따로 필요 |

## 1. 목표 (Job Statement)

메모가 여러 보드와 함에 흩어진 사용자가, "그때 적은 그 메모"를 제목·본문으로 찾고, 오래된 메모를 골라 한꺼번에 치우고 싶다. 캔버스에서 하나씩 찾아다니지 않고.

## 2. 범위

### 포함 (in-scope)
- 헤더 토글로 캔버스 ↔ 표 전환 (현재 보드 맥락 유지, 캔버스 뷰포트 보존)
- 대상 행: `kind === "text"` 메모만 (텍스트([[FEAT-text-tool]])·함·메모판 제외), 휴지통 제외
- 컬럼: ☐ 선택 · 색 스와치 · 제목 · 본문 미리보기(평문 1줄) · 보드(경로 `루트 › 함`) · 메모판 이름 · 첨부 배지(이미지/링크/녹음/파일 수) · 만든 날 · 고친 날
- 정렬: 제목·만든 날·고친 날(기본: 고친 날 내림차순) · 컬럼 헤더 클릭 토글
- 필터: 보드(다중 선택, "모든 보드" 포함, 하위 함 포함 체크) · 메모판 · 첨부 유무
- 검색: 제목+본문 전문 (기존 `memoSearch.searchMemos` 재사용)
- 제목 셀 인라인 편집 (`setTitle`/`commitTitle` 재사용, `normalizeTitle` 규칙 동일)
- 행 클릭(제목 셀 제외) → 메모창(`setExpandedCard`) · 행 hover 메뉴 "캔버스에서 보기" → 보드 전환 + `panToCard`
- 다중 선택(체크박스·Shift 범위) → "휴지통으로" (기존 `trashNotes`), 휴지통 되돌리기 토스트 동일
- 빈 상태 / 검색 결과 없음 상태

### 제외 (out-of-scope)
- 사용자 정의 속성, 칸반·갤러리 뷰 — §9
- 색 편집·색 필터
- 보드 간 이동, 행 드래그 정렬
- 표 상태(정렬·필터)의 영구 저장 — 세션 메모리만 (§9)
- 모바일 레이아웃 — [[FEAT-mobile]]

## 3. 수용 기준 (Acceptance Criteria)

### AC-1 전환
- **Given** 보드 X의 캔버스
- **When** 헤더에서 "표"를 누른다
- **Then** 표가 뜨고 보드 필터가 X로 잡혀 있다. "캔버스"로 돌아가면 이전 줌·위치 그대로다.

### AC-2 전체 범위
- **Given** 루트 보드 메모 3개, 그 안 함의 서브보드 메모 2개
- **When** 보드 필터를 "모든 보드"로 바꾼다
- **Then** 5행이 보이고, 서브보드 메모의 보드 셀은 `루트 › 함이름`이다.

### AC-3 검색
- **Given** 본문에 "회고"가 든 메모 1개
- **When** 검색창에 "회고"
- **Then** 그 행만 남고 일치 부분이 미리보기에 강조된다.

### AC-4 정렬
- **When** "만든 날" 헤더를 두 번 누른다
- **Then** 오름차순 → 내림차순으로 바뀐다.

### AC-5 제목 인라인 편집
- **Given** 제목 셀
- **When** 클릭해 고치고 Enter
- **Then** 제목이 저장되고 캔버스 메모 앞면에도 반영된다. Esc면 원래 값.

### AC-6 캔버스 점프
- **Given** 서브보드 Y의 메모 행
- **When** "캔버스에서 보기"
- **Then** 캔버스 뷰로 돌아가 보드 Y로 전환되고 그 메모가 화면 중앙에 선택 상태로 온다.

### AC-7 다중 휴지통
- **Given** 3행 선택
- **When** "휴지통으로"
- **Then** 3개가 휴지통으로 가고 표에서 사라지며, 되돌리기 토스트로 복구된다. 연결선([[FEAT-connectors]])도 같이 스냅샷된다.

### AC-8 실시간 반영
- **Given** 표를 연 상태
- **When** 다른 탭에서 메모를 추가·수정한다 (liveSync)
- **Then** 표에 반영된다.

## 4. 의존성

### 다른 feature
- **의존**: [[FEAT-storage]] (전체 notes 조회 — 현재 스토어 `cards`는 현재 보드만 들고 있으므로 별도 쿼리 필요) · [[FEAT-boards]]/[[FEAT-subcanvas]] (parentBoardId 경로) · [[FEAT-memo-title]] · [[FEAT-memo-fulltext-search]] · [[FEAT-trash]]
- **영향**: `Header.tsx` 토글, `Canvas`/`Dock` 표 모드 시 숨김(단축키 가드 포함 — 표에서 Cmd+N 등 캔버스 단축키가 먹지 않게)

## 5. 데이터 모델

스키마 변경 없음. 뷰 상태만 새로 둔다.

```ts
type WorkspaceView = "canvas" | "table";

interface MemoTableState {
  sort: { key: "title" | "createdAt" | "updatedAt"; dir: "asc" | "desc" };
  boardFilter: "all" | string[];   // 기본 [currentBoardId]
  includeSubboards: boolean;       // 기본 true
  frameFilter: string[] | null;
  hasAttachment: boolean | null;
  query: string;
  selectedIds: Set<string>;
}
```

행 데이터 = `Note` + 파생(`boardPath`, `frameName`, `preview`, `badgeCounts`, `tint`). 파생은 `useLiveQuery`(Dexie) 결과에서 메모이즈.

## 6. 인터페이스

### Store
- `view: WorkspaceView` · `setView(v)`
- `openCardOnCanvas(noteId)` — 보드 전환 + `panToCard` + 선택
- 기존 재사용: `setTitle`/`commitTitle`, `setExpandedCard`, `trashNotes`

### 컴포넌트
- `components/table/MemoTable.tsx` — 표 본체 (행 가상화: 1,000행 이상 대비)
- `MemoTableToolbar` — 검색·필터·선택 액션 바
- `Header` 안 `ViewToggle`

## 7. 시각·인터랙션

- 노션 표 톤: 행 높이 36px, 헤더 고정, 가로 스크롤 시 제목 컬럼 고정.
- 선택 시 상단에 "N개 선택 · 휴지통으로 · 선택 해제" 바.
- 색 스와치: `memoTint(id)` 원 12px.

## 8. 비기능 요구사항

- **성능**: 메모 5,000개에서 표 첫 렌더 < 300ms, 검색 입력 → 결과 < 100ms (디바운스 150ms 포함 별도).
- **접근성**: `role="grid"`, 방향키 행 이동, Space 선택, Enter 메모창.
- **i18n**: 컬럼명·빈 상태 문구 i18n 키.

## 9. 다음 iteration (의도적 보류)

- 사용자 정의 속성(태그·상태·날짜) + 칸반 뷰
- 사용자 지정 메모 색 (FEAT-memo-variety 규칙 변경 필요)
- 보드 간 이동
- 정렬·필터 상태 저장, 저장된 뷰

## 10. 검증 방법 (DOD)

- [x] 단위: 필터·정렬·검색 셀렉터 · boardPath 계산(사이클 안전) · 텍스트/함/메모판 제외
- [x] 통합: 제목 편집 → 캔버스 반영 · 다중 휴지통 + 되돌리기 · liveSync 반영
- [ ] 수동: AC-1~8, 표 모드에서 캔버스 단축키 무반응

### 구현 메모 (WORK)

- `Header.tsx`는 이 레이아웃에서 마운트되지 않는 죽은 코드다(캔버스 위 floating chrome만 씀).
  §6의 "Header 안 ViewToggle"을 그대로 따르면 기존 레이아웃을 깨므로, `ViewToggle`을
  우상단 고정 컨트롤로 두었다 — 표시 위치만 다르고 AC-1 동작은 동일하다.
- 표 데이터는 `storage.loadAllNotes()`(신규)로 모든 보드를 조회하고, 표 뷰 상태는
  `state/memoTable.ts`(신규 zustand store + 순수 파생함수)에 둔다. AC-8은 `liveSync`의
  `subscribeNoteChanges`로 다른 탭 변경 시 재조회한다(`useLiveQuery` 미설치 — 의존성 추가 없이).
- AC-7의 "되돌리기 토스트"는 기존 캔버스 삭제 경로에도 없어 새로 만들지 않았다 —
  `storage.trashNotes`가 연결선을 스냅샷하고 복구는 휴지통 패널로 동일하다.
