# FEAT-text-tool · 캔버스 위 평문 텍스트 (Figma 텍스트 툴)

> 종이도 제목도 없이 캔버스에 글자만 적는다 — 구역 제목, 주석, 화살표 옆 메모.

**Status**: spec 작성
**Owner**:
**Estimated**: M
**Blueprint**: (신규)

---

## 0. 결정 기록 (grill 2026-09-24)

| 결정 | 선택 | 근거 / 반대 선택의 위험 |
|---|---|---|
| 정체 | 메모(`text` kind)와 별개의 새 kind **`textbox`** | `text`는 이미 포스트잇 메모가 쓴다 |
| 서식 | 평문(여러 줄) + 요소 단위 크기 4단(S/M/L/XL) + 색 | 마크다운이면 Milkdown 인스턴스가 텍스트 수만큼 늘어 성능 부담, 메모와 역할이 겹친다 |
| 생성 | 독에서 끌어놓기 + `T` 단축키 → 캔버스 클릭 | 기존 독 패턴 유지 + Figma 근육기억 |
| 폭 | 기본 자동 폭(한 줄로 늘어남), 좌우 핸들을 끌면 고정 폭 + 줄바꿈 | 항상 고정 폭이면 짧은 라벨도 빈 영역이 생겨 선택 박스·연결점이 글자와 어긋난다 |
| 기본값 | 빈 채로 포커스를 잃으면 휴지통 없이 삭제 · 메모판 안에 놓으면 소속(`frameId`) · 연결 대상([[FEAT-connectors]]) · 회전 0 | grill에서 따로 묻지 않음 |

## 1. 목표 (Job Statement)

캔버스에서 메모를 구역별로 모으는 사용자가, 구역 위에 "이번 주 아이디어" 같은 큰 제목이나 화살표 옆 짧은 주석을 종이 카드 없이 바로 적고 싶다.

## 2. 범위

### 포함 (in-scope)
- 독에 "텍스트" 항목 추가 (끌어놓기 생성)
- `T` 키 → 텍스트 배치 모드(커서 변경, 1회성) → 캔버스 클릭 지점에 생성. Esc로 모드 취소
- 생성 즉시 편집 상태 + 포커스, 타이핑하면 폭이 늘어남(자동 폭)
- Enter = 줄바꿈, Esc 또는 바깥 클릭 = 편집 종료
- 편집 아닐 때 더블클릭 → 다시 편집
- 좌우 리사이즈 핸들 → 고정 폭 전환(줄바꿈), 높이는 항상 내용에 맞춤
- 선택 시 작은 툴바: 크기 S/M/L/XL · 색(프리셋 6~8개)
- 빈 텍스트가 편집 종료되면 즉시 삭제 (휴지통 없음, 되돌리기 대상 아님)
- 이동·다중 선택·휴지통 드롭·메모판 소속은 메모와 동일 규칙

### 제외 (out-of-scope)
- 부분 서식(굵게·기울임·링크), 마크다운, 정렬, 글꼴 선택 — §9
- 회전
- AI 파이프라인(임베딩·요약) 대상 — 텍스트는 주석이라 제외 (`aiOptOut: true`로 생성)
- 표 뷰([[FEAT-memo-table-view]]) 노출

## 3. 수용 기준 (Acceptance Criteria)

### AC-1 독 생성
- **Given** 캔버스
- **When** 독의 "텍스트"를 끌어 놓는다
- **Then** 놓은 자리에 `kind:"textbox"` 행이 생기고 편집 상태로 포커스된다.

### AC-2 T 키 생성
- **Given** 입력 포커스가 없는 캔버스
- **When** `T`를 누르고 캔버스를 클릭한다
- **Then** 클릭 지점(텍스트 왼쪽 위 기준)에 텍스트가 생기고 편집 상태가 된다. 한 번 만들면 배치 모드가 풀린다.

### AC-3 자동 폭
- **Given** 자동 폭 텍스트 편집 중
- **When** 한 줄로 길게 입력한다
- **Then** 줄바꿈 없이 폭이 늘어나고, 저장되는 `width`는 측정 폭이다.

### AC-4 고정 폭 전환
- **Given** 자동 폭 텍스트
- **When** 오른쪽 핸들을 끈다
- **Then** `autoWidth=false`가 되고 지정 폭에서 줄바꿈된다. 높이는 내용에 맞춰진다.

### AC-5 크기·색
- **Given** 선택된 텍스트
- **When** 툴바에서 L과 색을 고른다
- **Then** 글자 크기·색이 바뀌고 새로고침 후에도 유지된다.

### AC-6 빈 텍스트 소멸
- **Given** 방금 만든 텍스트
- **When** 아무것도 적지 않고 바깥을 클릭한다
- **Then** 행이 DB에서 삭제되고 휴지통 개수는 그대로다.

### AC-7 내보내기
- **Given** 텍스트가 있는 보드
- **When** Markdown / JSON Canvas / .moss로 내보낸다
- **Then** JSON Canvas는 `type:"text"` 노드, Markdown은 보드 문서 안 평문 단락, .moss는 왕복 후 크기·색·폭 모드가 보존된다.

## 4. 의존성

### 다른 feature
- **의존**: [[FEAT-canvas]] · [[FEAT-storage]] · [[FEAT-sticky-redesign]] (독·메모판 소속 규칙)
- **의존받음**: [[FEAT-connectors]] (연결 대상)
- **영향 (빠뜨리기 쉬운 곳)**: `NoteKind`/`CardKind`/`ToolId` 유니온, `kindForTool`·`widthForKind`, `CardContent` kind 분기, `Dock.tsx` DOCK_ITEMS, `useShortcuts` (T 키 — 입력 포커스 시 무시), `export/markdownExport`·`jsonCanvasExport`·`mossBundleImport`·`validateManifest`·`legacyKinds`, `state/ai/useAIPipeline` (textbox 제외), `memoSearch`·시스템 보드 셀렉터(제외 여부), `mcp/` 브리지 kind 목록

## 5. 데이터 모델

`Note`에 비인덱스 optional 필드만 추가 → Dexie 버전 업 불필요.

```ts
export type NoteKind = /* 기존 … */ | "textbox";

export type TextSize = "s" | "m" | "l" | "xl"; // 14 / 18 / 28 / 44 px (tokens 확정 시 조정)

export interface Note {
  // …기존
  /** FEAT-text-tool: textbox 글자 크기. 기본 "m". */
  textSize?: TextSize;
  /** FEAT-text-tool: true(기본)면 width는 측정값 캐시, false면 사용자 고정 폭. */
  autoWidth?: boolean;
  // color: textbox는 기존 `color` 칸을 실제로 쓴다(메모는 해시 색 — FEAT-memo-variety).
}
```

- `content`: 평문 문자열 그대로 (마크다운 해석 없음)
- `rotation`: 항상 0 · `height`: 저장하지 않음(내용 높이)

## 6. 인터페이스

### Store
- `addCardAt("textbox", x, y)` 기존 경로 재사용 (`aiOptOut: true`, `autoWidth: true`, `textSize: "m"`)
- `setTextStyle(id, {textSize?, color?})`
- `setTextWidth(id, width | "auto")`
- `textPlacementArmed: boolean` + `armTextPlacement()` / `disarmTextPlacement()`
- 편집 종료 훅에서 `content.trim()===""`이면 `hardDeleteNote(id)` (휴지통 우회)

### 컴포넌트
- `cards/textbox/Content.tsx` — 편집 시 `<textarea>`(auto-size) 또는 contentEditable plaintext-only, 비편집 시 `white-space: pre-wrap` 텍스트
- `TextStyleToolbar` — 선택 시 텍스트 위쪽에 뜨는 크기·색 툴바

## 7. 시각·인터랙션

- 배경·그림자·종이 없음. 선택 시 얇은 파란 박스 + 좌우 핸들만.
- 기본 색 = 잉크 톤. 색 프리셋은 tokens에 새로 정의 (메모 노랑 틴트와 별개).
- 독 아이콘: "T" 글리프 (에셋 필요 — `public/icons/dock/`).

## 8. 비기능 요구사항

- **성능**: 텍스트 500개 보드에서 드래그 60fps (에디터 인스턴스 없음 — 편집 중 1개만).
- **접근성**: 편집 영역 `aria-label`, 툴바 버튼 키보드 도달.
- **i18n**: 독 라벨·툴바 문구 i18n 키.

## 9. 다음 iteration (의도적 보류)

- 부분 서식·정렬·글꼴
- 텍스트 ↔ 메모 변환
- 회전

## 10. 검증 방법 (DOD)

- [ ] 단위: 빈 텍스트 소멸 · T 배치 모드 1회성 · 입력 포커스 중 T 무시 · export 3종 매핑
- [ ] 통합: .moss 왕복 후 textSize·color·autoWidth 보존 · 메모판 안 생성 시 frameId
- [ ] 수동: AC-1~7, 연결선([[FEAT-connectors]])이 자동 폭 변화에 따라 따라가는지
