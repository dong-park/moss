# Plan: 마크다운 통합 메모 + 펜 모드

> spec: [`FEAT-markdown-memo-pen.md`](FEAT-markdown-memo-pen.md) · 확정 결정 D1~D7 반영.

## 사람용 요약

**한 줄로**: 메모를 종류별로 골라 찍는 대신 한 장에 마크다운으로 자유롭게 쓰고, 사이드바에서 펜을 꺼내 그 메모 위에 손으로 그릴 수 있게 바꾼다.

1. **마크다운 편집기 심기** — 메모 안에서 타이핑하면 곧바로 제목·코드·목록·인용으로 보이는 라이브 편집기를 넣는다. (토대)
2. **메모 카드를 마크다운 메모로 교체** ← 본체 — 기존 텍스트 메모가 이 편집기를 쓰고, 다 쓰면 깔끔히 렌더된 형태로 보인다. 체크박스는 클릭하면 바로 켜고 꺼진다.
3. **옛 카드들을 마크다운으로 이사** — 이미 만들어 둔 코드·체크리스트·인용 카드를 내용 손실 없이 한 번에 마크다운 메모로 변환한다.
4. **펜 자리 마련** — 메모 위에 얹는 그림을 보관할 공간과 펜/지우개 상태를 앱에 만든다. (토대)
5. **그리기 부품 공용화** — 기존 손글씨 카드의 펜·지우개·되돌리기를 떼어내 어디서든 쓰는 부품으로 만든다.
6. **펜 모드** — 사이드바에서 펜을 꺼내면 커서가 펜으로 바뀌고, 메모 위를 드래그하면 그 메모에 그림이 그려진다. 다시 누르거나 Esc로 끈다.
7. **사이드바 정리** — 없어진 종류(코드·체크리스트·인용·손글씨) 버튼을 빼고, 메모 버튼 이름을 다듬고, 펜 버튼을 추가한다.

진행: **트랙 A**(1→2→3)와 **트랙 B**(4→5→6)는 병렬 가능. 7은 둘 다 끝난 뒤 마지막.

---

<!-- STEP:0:milkdown-editor:pending -->
### T-0: Milkdown 라이브 프리뷰 에디터 래퍼 (트랙 A 토대)

#### 읽을 파일
- `web/AGENTS.md` — Next 16 비표준 경고. 라이브러리 도입 전 `node_modules/next/dist/docs/` 확인
- `web/src/components/workspace/cards/text/Content.tsx` — 교체될 text 카드의 현행 props/surface 패턴
- `web/package.json` — 의존성 추가 위치

#### 작업
- 의존성 추가: `@milkdown/core`, `@milkdown/react`, `@milkdown/preset-commonmark`, `@milkdown/preset-gfm`(작업목록·취소선), 리스너 플러그인(`@milkdown/plugin-listener`), 테마 1종.
- `web/src/components/workspace/cards/_shared/MarkdownEditor.tsx` 신규 (`"use client"`).
  - props: `{ value: string; editable: boolean; onChange: (md: string) => void; onBlur?: () => void }`
  - commonmark + gfm 프리셋 mount, listener로 markdown 직렬화 → `onChange`. `editable=false`면 readonly.
  - ProseMirror는 브라우저 전용 → SSR에서 top-level import로 깨지지 않게 격리(클라이언트 mount 가드 또는 동적 import). next docs에서 권장 패턴 확인 후 적용.

#### AC
```bash
cd web && npx vitest run src/components/workspace/cards/__tests__/MarkdownEditor.test.tsx
cd web && npx tsc --noEmit
```
(테스트 신규: 마운트되고, 편집 시 markdown 문자열을 onChange로 emit, editable=false면 입력 무시)

#### 금지사항
- ProseMirror/Milkdown을 모듈 top-level에서 정적 import 해 SSR 경로에 노출하지 마라. 이유: Next 16 서버 렌더에서 `window` undefined로 크래시.

- summary:
<!-- /STEP -->

<!-- STEP:1:markdown-memo-content:pending -->
### T-1: text 카드 → 마크다운 메모 카드 교체 (트랙 A 본체)

#### 읽을 파일
- `web/src/components/workspace/cards/text/Content.tsx` — 교체 대상
- `web/src/components/workspace/cards/CardContent.tsx` — text case 라우팅
- `web/src/components/workspace/cards/_shared/types.ts` — `CardContentProps`(onChange/onCommitEdit)
- `web/src/components/workspace/cards/_shared/surface.ts` — `cardSurface("text")`
- `web/src/components/workspace/cards/_shared/MarkdownEditor.tsx` — T-0 산출물

#### 작업
- `TextCardContent`를 마크다운 메모로 교체(컴포넌트 파일 유지, 내부만 변경).
  - `editing=true` → `MarkdownEditor editable` (라이브 프리뷰). `onChange`는 직렬화 markdown 문자열을 그대로 상위 `onChange`로 전달.
  - `editing=false` → 같은 콘텐츠를 readonly 렌더(정적 표시). blur 시 `onCommitEdit`.
  - 보기(비편집) 상태에서 작업목록 체크박스 클릭 → source markdown의 해당 라인 `- [ ]`↔`- [x]` 토글 후 `onChange` 호출, **편집 모드 진입 없음**.
  - `cardSurface("text")` + 기존 inset(top1% left1% right3% bottom4%) 유지. `useAutoFocusOnEdit`로 편집 진입 시 에디터 포커스.

#### AC
```bash
cd web && npx vitest run src/components/workspace/cards/__tests__/CardContent.text.test.tsx
```
(테스트 갱신: `# 제목`·펜스코드·`- [ ]`가 각 블록으로 렌더됨; 체크박스 클릭 시 source가 `- [x]`로 바뀌고 편집모드 미진입)

#### 금지사항
- raw textarea 편집 방식으로 되돌리지 마라. 이유: D1 = 라이브 프리뷰 확정.
- comment 카드(`kind="comment"`, 별도 컴포넌트)는 건드리지 마라. 이유: 범위 밖.

- summary:
<!-- /STEP -->

<!-- STEP:2:kind-migration:pending -->
### T-2: code/checklist/highlight → 마크다운 마이그레이션 + 컴포넌트 제거

#### 읽을 파일
- `web/src/state/db/schema.ts` — `NoteKind`, `MossDB` Dexie `version()`
- `web/src/state/cardContent.ts` — `parseCode/parseChecklist/parseHighlight`(변환 입력)
- `web/src/state/workspace.ts` — `decodeNoteToCard`, `COMMENT_MARKER`(보존 대상 식별)
- `web/src/components/workspace/cards/CardContent.tsx` — case 제거 대상
- `web/src/components/workspace/cards/{code,checklist,highlight}/Content.tsx` — 삭제 대상

#### 작업
- `web/src/state/markdownMigration.ts` 신규: 순수 변환 함수
  - code `{code,lang}` → ```` ```{lang}\n{code}\n``` ````
  - checklist `[{text,done}]` → 줄별 `- [x] {text}` / `- [ ] {text}`
  - highlight `{quote,source?}` → `> {quote}` (+ source 시 `\n>\n> — {source}`)
  - `noteToMarkdownText(note)` → `{kind:"text", content}` 통합 진입점
- `schema.ts`에 `version(2).upgrade()` — `kind∈{code,checklist,highlight}` 행을 `noteToMarkdownText`로 재작성. idempotent.
- `decodeNoteToCard`에 방어적 변환(업그레이드 누락분도 text로) 추가.
- `CardContent.tsx`에서 code/checklist/highlight case 제거, 세 `Content.tsx`·디렉터리 삭제.

#### AC
```bash
cd web && npx vitest run src/state/__tests__/markdownMigration.test.ts
cd web && npx vitest run src/state/__tests__/cardContent.test.ts
cd web && npx tsc --noEmit
```
(테스트 신규: 세 종류 변환 라운드트립 + comment 인코딩 text는 변환되지 않음)

#### 금지사항
- `{` 로 시작하고 comment 마커를 가진 text 노트를 변환하지 마라. 이유: 작성자/시간 메타 손실.
- mindmap을 변환 대상에 넣지 마라. 이유: D5 — 트리는 마크다운 부적합, 현행 유지.

- summary:
<!-- /STEP -->

<!-- STEP:3:pen-data-model:pending -->
### T-3: 펜 데이터 모델 — overlay 필드 + 펜 모드 상태 (트랙 B 토대)

#### 읽을 파일
- `web/src/state/db/schema.ts` — `Note` 인터페이스
- `web/src/state/workspace.ts` — `Card`, `persistCard`/`decodeNoteToCard`, store actions
- `web/src/state/storage.ts` — `saveNote`(Partial<Note>) 매핑

#### 작업
- `Note`에 `overlay?: string`(비인덱스 optional, JSON `{paths}`) 추가 — Dexie `stores()` 변경 불필요.
- `Card`에 `overlay?: string` 추가. `decodeNoteToCard`/`persistCard`에서 overlay 왕복 매핑.
- store 상태 추가: `penMode: boolean`, `penTool: "pen"|"eraser"`, `penWidth: number`.
- store 액션 추가: `setPenMode(on)` / `togglePenMode()` / `setPenTool` / `setPenWidth` / `setOverlay(id, json)`(overlay만 갱신 + 디바운스 persist).
- `setPenMode(true)` 시 열린 `editingId`는 정리(상호배타).

#### AC
```bash
cd web && npx vitest run src/state/__tests__/workspace.test.ts
cd web && npx tsc --noEmit
```
(테스트 신규/갱신: overlay 저장→로드 왕복 보존; setPenMode(true)가 editingId를 null로; setOverlay가 content를 건드리지 않음)

#### 금지사항
- `notes` Dexie `stores()` 인덱스 문자열에 overlay를 추가하지 마라. 이유: 불필요한 version 충돌·인덱스 비용.

- summary:
<!-- /STEP -->

<!-- STEP:4:drawing-layer:pending -->
### T-4: 그리기 로직을 공유 DrawingLayer로 추출 + handwriting 리팩터

#### 읽을 파일
- `web/src/components/workspace/cards/handwriting/Content.tsx` — 추출 원본(펜/지우개/undo/redo/width/pathsIntersect)
- `web/src/state/cardContent.ts` — `HandwritingPoint`/`parseHandwriting`/`serializeHandwriting`
- `web/src/components/workspace/cards/__tests__/CardContent.handwriting.test.tsx` — 회귀 기준

#### 작업
- `web/src/components/workspace/cards/_shared/DrawingLayer.tsx` 신규 (`"use client"`).
  - props: `{ value: string; active: boolean; penWidth: number; tool: "pen"|"eraser"; onChange: (json: string) => void }`
  - SVG polyline 렌더 + `active`일 때 pointer 입력으로 stroke 추가/지우개. undo/redo/clear/굵기/E 토글은 호출측 또는 내부 키핸들러로 유지(handwriting과 동일 시맨틱).
- `HandwritingCardContent`를 `DrawingLayer` 사용하도록 리팩터(동작 동일, 기존 테스트 그린 유지).

#### AC
```bash
cd web && npx vitest run src/components/workspace/cards/__tests__/CardContent.handwriting.test.tsx
cd web && npx vitest run src/components/workspace/cards/__tests__/DrawingLayer.test.tsx
```
(handwriting 기존 테스트 회귀 0 + DrawingLayer 단위 테스트 신규)

#### 금지사항
- 추출 과정에서 펜/지우개/undo 시맨틱을 바꾸지 마라. 이유: 회귀. 동작 보존이 목표.

- summary:
<!-- /STEP -->

<!-- STEP:5:pen-mode-wiring:pending -->
### T-5: 펜 모드 인터랙션 — 메모 위 그리기 (트랙 B 본체)

#### 읽을 파일
- `web/src/components/workspace/DraggableCard.tsx` — 드래그/더블클릭 진입, CardContent mount
- `web/src/components/workspace/Canvas.tsx` — 전역 커서(`cursorClass`), Esc 키 핸들
- `web/src/components/workspace/cards/_shared/DrawingLayer.tsx` — T-4 산출물
- `web/src/state/workspace.ts` — `penMode`/`penTool`/`penWidth`/`setOverlay`(T-3)

#### 작업
- `DraggableCard`: `penMode && card.kind==="text"`(메모)일 때
  - `CardContent` 위에 절대배치 `DrawingLayer active`를 얹고, `onChange`→`setOverlay(card.id, json)`.
  - `onMouseDown`(드래그)·`onDoubleClick`(편집 진입) 펜 모드 중 비활성.
  - overlay가 비어있지 않으면 펜 모드 아닐 때도 `DrawingLayer active={false}`로 그림 표시.
- `Canvas`: `penMode`면 전역 커서 펜(CSS `cursor: url(...)` 또는 펜 클래스), Esc로 `setPenMode(false)`.

#### AC
```bash
cd web && npx vitest run src/components/workspace/__tests__/penMode.test.tsx
cd web && npx tsc --noEmit
```
(테스트 신규: 펜 모드 중 카드 드래그 호출 안 됨; 메모 위 stroke가 overlay로 저장·재로드 시 표시; Esc로 펜 모드 해제)

#### 금지사항
- v1에서 image/link/audio/file/mindmap 등 비메모 카드에 DrawingLayer를 붙이지 마라. 이유: D7 — v1 메모 한정.

- summary:
<!-- /STEP -->

<!-- STEP:6:sidebar-tools:pending -->
### T-6: 사이드바 도구 정리 (마지막 — A·B 통합)

#### 읽을 파일
- `web/src/components/workspace/Sidebar.tsx` — `CAPTURE_META`, `CANVAS_GROUP`
- `web/src/state/workspace.ts` — `CAPTURE_TOOLS`, `ToolId`, `kindForTool`/`kindToDefaultToolId`
- `web/src/i18n/messages/ko.json` — `capture.tool.*` 라벨
- `web/src/state/__tests__/workspace.test.ts`, `src/state/__tests__/ac-capture.test.ts` — 단축키·캡처 기대

#### 작업
- `CAPTURE_TOOLS`에서 `code`/`checklist`/`highlight`/`handwriting` 제거 → 캡처 6종(text·image·link·audio·file·mindmap). Cmd+1~ 매핑은 배열 순서로 자동 정합.
- `CAPTURE_META`에서 같은 4종 제거, `text` 라벨을 "메모"로(i18n).
- `ToolId`에 `"pen"` 추가, `CANVAS_GROUP`에 펜 도구 아이템 추가 — 클릭 시 `togglePenMode()`(드롭-캡처 아님, 모드 토글).
- `kindForTool`/`kindToDefaultToolId`에서 제거된 kind 정리(잔여 호출은 text 폴백 유지).

#### AC
```bash
cd web && npx vitest run src/state/__tests__/workspace.test.ts src/state/__tests__/ac-capture.test.ts
cd web && npm run check:i18n
cd web && npx tsc --noEmit
```

#### 금지사항
- image/link/audio/file/mindmap 캡처 도구를 제거하지 마라. 이유: 범위 밖.
- 펜 도구를 `CAPTURE_TOOLS`(드롭→카드 생성)에 넣지 마라. 이유: 펜은 모드 토글이지 카드 생성기가 아님.

- summary:
<!-- /STEP -->

## 의존성 / 순서

```
트랙 A:  T-0 ──▶ T-1 ──▶ T-2 ┐
                              ├─▶ T-6 (마지막)
트랙 B:  T-3 ──▶ T-5 ◀── T-4 ┘
              (T-5는 T-3+T-4 필요)
```

- T-1·T-2는 `CardContent.tsx`를 함께 건드림 → A 트랙 내 순차(T-1 후 T-2).
- T-6은 `CAPTURE_TOOLS`/`Sidebar` 단일 소유 → T-2(종류 제거)+T-3(penMode 액션) 완료 후.
- 트랙 A와 트랙 B는 파일 겹침 최소 → 병렬 가능(squad 2워커 적합).

## 검증 (DOD)

- [ ] 각 STEP AC 그린 + `cd web && npx vitest run`(전체) 회귀 0(현재 465 기준)
- [ ] `cd web && npm run dev` 수동: 메모에 마크다운 4종 입력→렌더, 체크박스 토글, 펜 모드 켜고 메모 위 그리기→카드 이동 시 동반→Esc 해제
- [ ] 마이그레이션: 기존 code/checklist/highlight 카드가 있는 DB로 로드 시 손실 없이 마크다운 메모로 전환
