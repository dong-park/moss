# FEAT-boards · 보드 선택 드롭다운 (분위기 기반 컬렉션)

> 별도 보드 목록 화면 없음. 상단 헤더 드롭다운으로 보드 간 전환 + 새 보드 생성. 폴더 대신 추상 컬렉션.

**Status**: ✅ complete (2026-05-21) — 검증 통과, AC 모두 충족
**Estimated**: M
**Blueprint**: `features[id="FEAT-boards"]`

---

## 1. 목표

PRD §38-2 Decision 11: 별도 Home·Boards 화면 없이 시스템 보드 1개 + 사용자 보드들이 워크스페이스 헤더의 드롭다운으로 전환되는 구조. "분위기 기반 느슨한 컬렉션"이라는 정체성을 유지하기 위해 보드 이름 빈 값 허용, 폴더 위계 없음.

## 2. 범위

### 포함
- 상단 헤더의 보드 선택 드롭다운 (Radix DropdownMenu)
- 항목 구성:
  1. 시스템 보드 "머무는 생각" (첫 항목 고정, 체크 마크, 삭제 불가)
  2. 사용자 보드들 (최근 수정 순)
  3. 구분선
  4. `+ 새 보드` → 템플릿 picker ([[FEAT-templates]])
- 보드 전환 시 캔버스 카드 교체 (애니메이션: 200ms ease-out fade)
- 단축키:
  - `Cmd+P`: 드롭다운 열기 (포커스)
  - `Cmd+B`: 시스템 보드 ↔ 마지막 일반 보드 토글
  - `Cmd+N`: 새 보드 만들기 (템플릿 picker)
- 보드 이름 인플레이스 편집 (보드 이름 클릭 → 텍스트 입력 → blur 저장)
- 빈 이름 허용 (PRD §7-2)
- 보드 삭제 (시스템 보드 제외) — 우클릭 컨텍스트 메뉴

### 제외 (다른 FEAT 담당)
- 시스템 보드 "머무는 생각" 자동 큐레이팅 카드들 — [[FEAT-home]]
- 새 보드 만들 때 5종 템플릿 선택 — [[FEAT-templates]]
- 보드 메모 영속 — [[FEAT-storage]]
- 모바일 보드 strip (가로 스크롤) — [[FEAT-mobile]]

## 3. 수용 기준

### AC-1 (REQ-15 충족) — 분위기 기반 보드
- **Given** 사용자가 새 보드 만들기
- **When** 이름을 빈 값으로 두고 카드 추가
- **Then** 보드는 정상 작동. 드롭다운에 "(이름 없는 보드)" 같은 placeholder로 표시. 영속 후 새로고침해도 유지.

### AC-2 — 시스템 보드 첫 항목 고정
- **Given** 사용자 보드 N개 존재
- **When** 보드 드롭다운 열기
- **Then** "머무는 생각"이 첫 항목 (체크 마크 또는 시스템 배지). 다른 보드들이 그 아래 최근 수정 순. 시스템 보드는 삭제·이름 변경 불가.

### AC-3 — 단축키
- **Given** 워크스페이스에서 단축키 입력
- **When** `Cmd+P`
- **Then** 드롭다운이 200ms 이내 열림, 첫 항목에 포커스. `Cmd+B`는 시스템 보드와 마지막 사용 일반 보드 간 토글. `Cmd+N`은 템플릿 picker.

### AC-4 — 보드 전환 페이드
- **Given** 보드 A에 머물러 있음
- **When** 드롭다운에서 보드 B 선택
- **Then** 캔버스 카드들이 200ms ease-out으로 페이드아웃 → B의 카드들 페이드인. 줌·팬은 B의 마지막 viewport 복원 (per-board 저장).

### AC-5 — 첫 진입 = 시스템 보드
- **Given** moss 첫 진입 (또는 신규 사용자)
- **When** 앱 로드
- **Then** 자동으로 시스템 보드 "머무는 생각" 표시.

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-15
- 등장 화면: SCR-workspace 6 variant 모두 (드롭다운은 헤더에 항상 있음)
- 등장 flow: FLOW-board-build (step 1 — 새 보드 생성)

### 다른 feature
- **의존**: [[FEAT-storage]] (Board 스키마), [[FEAT-canvas]] (보드 전환 시 카드 교체)
- **의존받음**: [[FEAT-templates]] (새 보드 생성 시 호출), [[FEAT-home]] (시스템 보드의 본 정의), [[FEAT-mobile]] (보드 strip)

### 외부 라이브러리
- `@radix-ui/react-dropdown-menu` (이미 설치됨)
- `@radix-ui/react-context-menu` (보드 우클릭 메뉴 — 추가 필요)

## 5. 데이터 모델

[[FEAT-storage]]의 `Board` 인터페이스. 추가 메타:
```ts
// 보드별 viewport 기억 — settings 안 또는 별도 store
interface BoardViewportMemory {
  [boardId: string]: { x: number; y: number; scale: number };
}
```

## 6. 인터페이스

### Store actions
- `useWorkspace.setCurrentBoard(id: string | "system"): void` — 시스템 보드는 특수 id
- `useWorkspace.createBoard(name: string, templateId?: string): string` — 반환 = id
- `useWorkspace.renameBoard(id, name): void`
- `useWorkspace.removeBoard(id): void` — 시스템 보드는 throw
- `useWorkspace.toggleSystemBoard(): void` — Cmd+B

### React 컴포넌트
- `<BoardPicker />` — 상단 헤더 드롭다운 (이미 일부 구현)
- `<BoardItem board={Board} selected={bool} />` — 드롭다운 항목
- `<NewBoardMenuItem />` — `+ 새 보드` → 템플릿 picker 호출

### Hooks
- `useCurrentBoard(): Board | null`
- `useBoardShortcuts()` — Cmd+P / Cmd+B / Cmd+N

## 7. 시각·인터랙션

- PRD 참조: §7-2 (Workspace 보드 picker), §7-5 (보드 picker — 분위기 기반)
- 드롭다운 스타일: 흰 카드 + 미세 그림자 (PRD §8 paper feel), 첫 항목 (시스템 보드)에 작은 시스템 배지
- 항목 hover: 옅은 회색 배경 (`var(--color-hover)`)
- 시스템 배지: 작은 lime/blue 라운드 박스 + "시스템" 텍스트

## 8. 비기능 요구사항

- **성능**: 보드 전환 < 300ms (카드 100개 기준). 페이드 모션이 시각적 지연 흡수.
- **접근성**: 키보드 도달 (Tab, 화살표 키 네비게이션). 시스템 보드 첫 항목에 자동 포커스.
- **데이터 안전성**: 보드 삭제 시 확인 모달 + undo 5초 (메모도 같이 사라지면 위험). 메모는 별도 무소속 처리(`boardId: null`)로 보존.

## 9. 다음 iteration

- **보드 정렬** — 최근 수정 순 외에 alpha, 사용자 정의 드래그 순서
- **보드 폴더화** — Phase 2 (사용자 요청 많을 시. 다만 "분위기 기반" 정체성과 충돌 위험)
- **보드 검색** — 보드 100개 도달 시 드롭다운 안 검색 입력
- **보드 색상·아이콘** — Phase 2 (현재는 이름만)
- **보드 공유** — Pro 기능 (Phase 2)

## 10. 검증 방법 (DOD)

- [ ] e2e: 시스템 보드 ↔ 사용자 보드 전환 페이드 200ms
- [ ] 단축키 작동 (Cmd+P / Cmd+B / Cmd+N)
- [ ] 빈 이름 보드 생성·표시·영속
- [ ] 시스템 보드 삭제 시도 → throw + UI 차단
- [ ] 보드 삭제 시 메모는 `boardId=null`로 보존 확인
- [ ] PRD §11·§7-2 시각 대조
