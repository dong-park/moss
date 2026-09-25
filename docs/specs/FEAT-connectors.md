# FEAT-connectors · 카드 연결점과 화살표 연결선

> 카드에 마우스를 올리면 상·하·좌·우에 연결점이 뜨고, 끌어서 다른 카드(또는 빈 곳의 새 메모)로 화살표를 잇는다 — 생각 사이의 관계를 손으로 긋는다.

**Status**: spec 작성
**Owner**:
**Estimated**: M
**Blueprint**: `docs/moss.blueprint.json#features[id="FEAT-canvas"]` (연결선 보류 항목 승계)

---

## 0. 결정 기록 (grill 2026-09-24)

| 결정 | 선택 | 근거 / 반대 선택의 위험 |
|---|---|---|
| 데이터 | 기존 `connections` 테이블 재사용 | 저장·휴지통 스냅샷(`trashConnections`)·JSON Canvas edges·`storage.saveConnection`이 이미 있다. 빠진 건 UI뿐 |
| 붙는 변 | **변 저장** (`sourceSide`/`targetSide`) | 자동 라우팅이면 카드를 옮길 때 선이 다른 변으로 튀어 4방향 연결점이 장식이 된다 |
| 연결 대상 | 메모(`text`)·함(`board`)·텍스트([[FEAT-text-tool]]) | 메모판(`frame`)은 제외 — 판 테두리 hover가 안쪽 메모 핸들·리사이즈 핸들과 다툰다 |
| 선 모양 | 베지어 곡선 + 끝 화살촉 (source→target) | 직선은 같은 변끼리 이을 때 카드를 가로지른다 |
| 빈 곳 드롭 | 그 자리에 새 메모 생성 + 연결 | 취소면 "뻗어나가며 적기"가 매번 독→드롭→연결 3동작 |
| 선 편집 | 클릭 선택 · Delete 삭제 · 더블클릭 라벨 | AI 추천 점선은 [[FEAT-ai-pipeline]] 담당 |
| 기본값 | 같은 보드 안에서만 연결 · 펜 모드에선 연결점 숨김 · 모바일 비노출 | grill에서 따로 묻지 않음 |

## 1. 목표 (Job Statement)

캔버스에서 메모를 정리하는 사용자가, 두 생각이 이어진다는 걸 깨달은 순간 그 관계를 화살표로 긋고 이유를 한 줄 달아 두고 싶다. 선을 긋다가 이어질 생각이 떠오르면 곧바로 새 메모로 뻗어나가고 싶다.

## 2. 범위

### 포함 (in-scope)
- 연결 대상 카드 hover 시 상·하·좌·우 중앙에 연결점 4개 표시
- 연결점에서 끌기 → 미리보기 곡선이 포인터를 따라감
  - 대상 카드 위에 놓으면 포인터에 가장 가까운 변에 연결 (hover된 대상의 연결점이 강조되고, 연결점 위에 정확히 놓으면 그 변)
  - 빈 캔버스에 놓으면 그 자리에 새 메모 생성 + 반대쪽 변에 연결 + 제목 편집 진입
  - Esc / 자기 자신 위에 놓기 → 취소
- 연결선 렌더: 변의 법선 방향으로 나가는 베지어 곡선, target 끝에 화살촉
- 카드 이동·리사이즈 시 선이 저장된 변 중앙을 따라감
- 선 클릭 → 선택(강조) · Delete/Backspace → 삭제 · 더블클릭 → 선 중간에 라벨 입력(평문 한 줄)
- 카드를 휴지통으로 보내면 닿은 선도 함께 스냅샷/복원 (기존 `trashConnections` 경로)
- 같은 쌍·같은 방향 중복 연결 방지 (이미 있으면 새로 만들지 않고 기존 선 선택)

### 제외 (out-of-scope)
- AI 추천 연결 점선 표시·수락/거절 — [[FEAT-ai-pipeline]]
- 메모판(frame)끼리 또는 메모판과의 연결
- 보드를 넘는 연결 (함 안 서브보드 카드와 연결)
- 선 스타일(색·굵기·점선) 변경, 방향 뒤집기, 양방향 화살표, 꺾인선
- 선 끝을 끌어 다른 카드로 옮겨 붙이기 (재연결) — §9

## 3. 수용 기준 (Acceptance Criteria)

### AC-1 연결점 노출
- **Given** 편집 모드가 아닌 캔버스, 메모·함·텍스트 카드
- **When** 포인터를 카드 위에 올린다
- **Then** 카드 네 변 중앙 바깥쪽에 연결점 4개가 뜬다. 포인터가 카드와 연결점을 벗어나면 사라진다. 메모판·펜 모드·다중 드래그 중에는 뜨지 않는다.

### AC-2 카드→카드 연결
- **Given** 메모 A의 오른쪽 연결점
- **When** 끌어서 메모 B의 왼쪽 연결점 근처에 놓는다
- **Then** `connections`에 `{sourceNoteId:A, targetNoteId:B, sourceSide:"right", targetSide:"left", source:"manual", status:"active"}`가 저장되고, A 오른쪽 → B 왼쪽 곡선과 B 쪽 화살촉이 그려진다.

### AC-3 빈 곳 드롭 = 새 메모
- **Given** 메모 A의 아래쪽 연결점
- **When** 끌어서 빈 캔버스에 놓는다
- **Then** 놓은 지점에 새 메모가 생기고(`addCardAt("text", …)` 경로), A.bottom → 새 메모.top 연결이 저장되며, 새 메모의 제목 입력에 포커스가 간다.

### AC-4 따라가기
- **Given** 연결된 A→B
- **When** A 또는 B를 이동·리사이즈한다
- **Then** 드래그 매 프레임 선 끝이 저장된 변 중앙을 따라간다 (변은 바뀌지 않는다).

### AC-5 선 선택·삭제
- **Given** 연결선 하나
- **When** 선(히트 폭 ≥ 12px)을 클릭하고 Delete를 누른다
- **Then** 선이 사라지고 `connections`에서 삭제된다. 카드 선택은 해제된다.

### AC-6 라벨
- **Given** 연결선 하나
- **When** 더블클릭 후 글을 입력하고 Enter/바깥 클릭
- **Then** 선 중간점에 라벨이 표시되고 `connection.label`에 저장된다. 빈 문자열이면 label 제거.

### AC-7 휴지통 연동
- **Given** A→B 연결
- **When** A를 휴지통으로 보냈다가 복원한다
- **Then** 지울 때 선도 사라지고, 복원하면 선이 같은 변으로 되살아난다.

### AC-8 중복 방지
- **Given** 이미 A→B 연결
- **When** A에서 B로 다시 끌어 놓는다
- **Then** 새 행을 만들지 않고 기존 선을 선택 상태로 만든다.

## 4. 의존성

### 다른 feature
- **의존**: [[FEAT-canvas]] (좌표계·가상화 `useVirtualizedCards`) · [[FEAT-storage]] (`saveConnection`/`deleteConnection`, 휴지통 경로) · [[FEAT-trash]]
- **의존받음**: [[FEAT-ai-pipeline]] (같은 레이어에 점선을 얹는다) · [[FEAT-text-tool]] (연결 대상)
- **영향**: [[FEAT-export]] JSON Canvas edges에 `fromSide`/`toSide` 매핑 (JSON Canvas 스펙 필드명과 동일), `.moss` 번들 import 검증(`validateManifest`), `mcp/` 브리지 (연결 조회 시 side 노출 여부)

### 외부 라이브러리
- 없음 (SVG path 직접 계산)

## 5. 데이터 모델

`Connection`에 비인덱스 optional 필드만 추가 → Dexie `stores()` 변경·버전 업 불필요.

```ts
export type ConnectionSide = "top" | "right" | "bottom" | "left";

export interface Connection {
  id: string;
  sourceNoteId: string;
  targetNoteId: string;
  source: "manual" | "ai-suggested";
  status: "active" | "rejected" | "pending";
  label?: string;
  /** FEAT-connectors: 선이 붙는 변. 없으면(AI 추천·레거시) 두 카드의 가장 가까운 변을 매 렌더 계산. */
  sourceSide?: ConnectionSide;
  targetSide?: ConnectionSide;
  createdAt: number;
}
```

## 6. 인터페이스

### Store (Zustand) — `state/workspace.ts`
- `connections: Connection[]` — 현재 보드 카드에 닿은 active 연결 (보드 로드 시 `storage.getConnections(noteIds)`)
- `connectCards(sourceId, sourceSide, targetId, targetSide): string | null` — 중복이면 기존 id 반환
- `connectToNewMemo(sourceId, sourceSide, x, y): string` — 새 메모 id
- `removeConnection(id)` · `setConnectionLabel(id, label)`
- `selectedConnectionId: string | null` — 카드 선택과 상호 배타

### 순수 헬퍼 — `components/workspace/connectors/geometry.ts`
- `anchorPoint(card, side): {x, y}`
- `nearestSide(card, point): ConnectionSide`
- `connectorPath(a, aSide, b, bSide): string` — 베지어 제어점 = 각 끝에서 변 법선 방향으로 `clamp(dist/2, 40, 160)`
- `midpoint(path)` — 라벨 위치

### React 컴포넌트
- `<ConnectorLayer />` — 캔버스 월드 좌표 안 SVG 한 장, 카드 아래 z-index. 선·화살촉(`<marker>`)·라벨·히트 path
- `<ConnectionHandles cardId />` — DraggableCard hover 시 4개 점. pointerdown → 드래그 세션 시작
- `<ConnectorDraft />` — 드래그 중 미리보기 곡선

## 7. 시각·인터랙션

- 연결점: 지름 10px 원, 카드 테두리에서 바깥 8px. hover 시 1.4배.
- 선: 2px, 잉크 톤(`tokens` 기존 텍스트 색 계열), 선택 시 강조색 + 3px. 화살촉 8px.
- 라벨: 선 중간 흰 배경 pill, 최대 40자 표시(넘치면 말줄임).
- 드래그 중 대상 카드 hover → 그 카드의 연결점 4개 표시 + 가장 가까운 것 강조.

## 8. 비기능 요구사항

- **성능**: 카드 200개·연결 300개에서 카드 드래그 60fps 유지. 선은 가상화 범위 밖 카드라도 반대쪽 끝이 화면 안이면 그린다.
- **접근성**: 선 선택은 키보드 Tab 순회 대상 아님(v1). 카드 선택 상태에서 연결 생성 단축키는 §9.
- **i18n**: 라벨 placeholder·aria 문구 i18n 키.

## 9. 다음 iteration (의도적 보류)

- 선 끝 재연결(드래그로 다른 카드로 옮기기)
- 선 스타일·방향 뒤집기·양방향
- 키보드로 연결 만들기
- 메모판 연결, 보드 간 연결

## 10. 검증 방법 (DOD)

- [ ] 단위: `geometry.ts` (anchorPoint·nearestSide·connectorPath) · 스토어 `connectCards` 중복 방지 · label 빈 문자열 제거
- [ ] 통합: 휴지통 보내기/복원 시 side 보존 · JSON Canvas export에 fromSide/toSide
- [ ] 수동: AC-1~8 시나리오, 메모판 안 메모끼리 연결, 펜 모드 진입 시 연결점 숨김
