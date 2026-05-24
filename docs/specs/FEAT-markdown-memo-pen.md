# FEAT-markdown-memo-pen · 마크다운 통합 메모 + 펜 모드

> 블록을 "노션처럼 종류 골라 찍는" 방식에서 **마크다운 문법이 곧 블록**인 단일 메모 카드로 바꾸고, 그리기는 사이드바에서 펜을 꺼내 **메모지 위에 직접 끄적이는** 모드로 전환한다.

**Status**: 구현 완료 (P0+트랙A+트랙B+T-6, web@feat/markdown-memo-pen) — tsc/eslint/check-i18n 클린. ⏳ vitest(작성됨, drvfs로 로컬 미실행→CI)·브라우저 실측 대기
**Owner**: (미정)
**Estimated**: L (2트랙 — A 마크다운 메모 M, B 펜 모드 M)
**Blueprint**: (신규 — 승인 후 `docs/moss.blueprint.json#features`에 등록)

---

## 1. 목표 (Job Statement)

사용자가 / 생각을 캡처할 때 / 사이드바에서 카드 *종류*를 고르는 대신 / 메모 한 장에 마크다운으로 자유롭게 쓰고(코드·체크리스트·인용이 문법으로 자연스럽게 생김), 펜을 꺼내 그 메모지 위에 손으로 끄적여 보강할 수 있어야 한다.

현재는 text/code/checklist/highlight가 각각 독립 카드라 "무엇을 캡처할지" 결정을 먼저 강요한다(노션식 블록 피커의 마찰). 그리기도 별도 handwriting 카드를 떨어뜨리는 방식이라 "메모 위에 손글씨"가 안 된다.

## 2. 범위

### 포함 (in-scope)

**트랙 A — 마크다운 통합 메모**
- `text/code/checklist/highlight` 4종을 단일 **마크다운 메모 카드**(kind="text" 재정의)로 통합.
- **라이브 프리뷰(WYSIWYG)** — Milkdown 에디터로 타이핑하면서 곧바로 렌더(올서타이프). source 진실은 마크다운 문자열(round-trip). 카드 focus 시 편집 가능, blur/Esc 시 정적 표시.
- 지원 문법(v1): 제목(`#`~`###`), 굵게/기울임/취소선, 순서/비순서 목록, 작업목록(`- [ ]`/`- [x]`), 펜스 코드블록(```` ```lang ````), 인라인 코드, 인용(`>`), 링크, 수평선(`---`).
- 보기 모드에서 작업목록 체크박스 **클릭 시 source 마크다운의 `[ ]`↔`[x]` 토글**(편집 모드 진입 없이 즉시 저장) — 기존 checklist UX 보존.
- 사이드바 캡처 도구에서 `code`/`checklist`/`highlight` 제거, `text`를 "메모"로 단일화.
- 기존 code/checklist/highlight 카드 데이터 마이그레이션(§5, §11 D3).

**트랙 B — 펜 모드 (메모지 위 그리기)**
- 사이드바에 **펜 도구** 추가 → 클릭 시 펜 모드 토글. 펜 모드 중 캔버스 커서가 펜 모양으로 변경.
- 펜 모드 중 메모 카드 표면을 드래그하면 그 카드에 종속된 **overlay 레이어**에 SVG 스트로크가 그려짐(카드와 함께 이동·저장·삭제).
- 펜/지우개 토글(E), 굵기(`[`/`]`), undo/redo(Cmd+Z/Cmd+Shift+Z), 전체 지움(Cmd+Backspace) — 기존 handwriting 시맨틱 재사용.
- 펜 모드 종료: 펜 도구 재클릭 또는 Esc.
- 기존 handwriting Content의 그리기 로직을 공유 컴포넌트/훅으로 추출해 overlay와 레거시 handwriting 카드가 공용.

### 제외 (out-of-scope)
- **mindmap 카드** — 트리 구조라 마크다운 통합 대상 아님. 현행 유지.
- image/audio/file/link 카드 — 현행 유지(마크다운 안에서 첨부 표현은 다음 iteration).
- 마크다운 표(table), 원시 HTML passthrough, 수식(LaTeX) — v1 제외(§9).
- 코드블록 구문 강조(syntax highlighting) — v1은 모노스페이스만, 강조는 §9.
- 펜 모드의 색상 팔레트·도형 도구 — v1은 단색 펜+지우개만(§9).
- 펜 overlay를 image/link/audio/file 등 비메모 카드에도 그리기 — v1은 메모 카드 한정(§11 D7).

## 3. 수용 기준 (Acceptance Criteria)

### AC-1 마크다운 렌더링
- **Given** 메모 카드에 `# 제목`, `- [ ] 할일`, ```` ```js\nconst x=1\n``` ````, `> 인용`이 입력됨
- **When** 편집 모드를 빠져나감(Esc/외부 클릭)
- **Then** 각각 제목·체크박스 목록·코드블록(모노스페이스)·인용 블록으로 렌더된다

### AC-2 마크다운 라운드트립 (WYSIWYG)
- **Given** 마크다운 content가 저장된 메모 카드
- **When** 카드를 focus해 Milkdown 편집기로 내용을 수정하고 blur/Esc
- **Then** Milkdown이 직렬화한 마크다운 문자열이 `content`에 저장되고, 재로드 시 동일하게 복원된다(문법 손실 0)

### AC-3 작업목록 인터랙티브 체크
- **Given** 보기 모드의 `- [ ] 우유 사기`
- **When** 렌더된 체크박스를 클릭
- **Then** source가 `- [x] 우유 사기`로 바뀌어 저장되고, 편집 모드로 진입하지 않는다

### AC-4 기존 카드 마이그레이션
- **Given** 마이그레이션 전 code/checklist/highlight 카드가 존재하는 DB
- **When** 앱이 새 버전으로 로드됨
- **Then** 각 카드가 kind="text"로 전환되고 content가 동등한 마크다운으로 변환된다(code→펜스블록, checklist→`- [ ]`목록, highlight→`>`인용). 원본 정보 손실 0, 위치·크기·연결 유지

### AC-5 펜 모드 진입/커서
- **Given** 기본 상태
- **When** 사이드바 펜 도구 클릭
- **Then** 펜 모드가 켜지고 캔버스 커서가 펜으로 바뀌며, 카드 드래그-이동이 비활성화된다. 재클릭/Esc로 해제되고 커서 복귀

### AC-6 메모 위 그리기 + 종속 저장
- **Given** 펜 모드 ON, 메모 카드 위
- **When** 카드 표면을 드래그
- **Then** 그 카드 overlay에 스트로크가 그려지고, 펜 모드 해제 후에도 유지되며, 카드를 이동하면 그림도 함께 이동한다

### AC-7 펜 편집 도구
- **Given** 펜 모드 ON
- **When** `E`(지우개 토글)/`[` `]`(굵기)/Cmd+Z/Cmd+Shift+Z/Cmd+Backspace
- **Then** 각각 지우개·굵기·undo·redo·전체지움이 동작한다(기존 handwriting과 동일 시맨틱)

## 4. 의존성

### 코드 기준점
- 라우터: `web/src/components/workspace/cards/CardContent.tsx`
- 통합 대상 Content: `cards/{text,code,checklist,highlight}/Content.tsx`
- 재사용 원본: `cards/handwriting/Content.tsx` (그리기 로직)
- 모델: `web/src/state/db/schema.ts` (`Note`, `NoteKind`, Dexie `version`)
- content 직렬화: `web/src/state/cardContent.ts` (parse/serialize·`HandwritingPoint`)
- 사이드바: `web/src/components/workspace/Sidebar.tsx`, `web/src/state/workspace.ts` (`CAPTURE_TOOLS`, `ToolId`, 카드 생성/드래그 액션)
- 캔버스 상호작용: `web/src/components/workspace/Canvas.tsx` (커서·드래그·overlay 렌더)

### 외부 라이브러리 (신규)
- **Milkdown** — `@milkdown/core`, `@milkdown/react`, `@milkdown/preset-commonmark`, `@milkdown/preset-gfm`(작업목록·취소선), 코드블록/리스트 플러그인. remark 기반이라 마크다운 round-trip 충실. (§11 D2)
- ⚠ **빌드 주의**: `web/AGENTS.md` — 이 Next 16은 표준과 다름. Milkdown은 `"use client"` 컴포넌트로 격리하고, SSR/하이드레이션 경계·동적 import 필요 여부를 `node_modules/next/dist/docs/`에서 먼저 확인.
- ⚠ Milkdown(ProseMirror) 에디터 인스턴스가 카드마다 mount → 캔버스 가상화/대량 카드 성능 영향 확인 필요(§8). blur 시 readonly 정적 렌더로 다운그레이드해 인스턴스 수 억제 검토.

### 다른 feature
- **의존받음**: FEAT-capture(캡처 도구 목록 변경), FEAT-card-entry-mode(editing 포커스 라이프사이클 — 펜 모드와 충돌 조정 필요), FEAT-export(마크다운 export는 통합 후 단순화 가능)

## 5. 데이터 모델

```ts
// schema.ts — Note에 비인덱스 optional 필드 추가 (Dexie stores() 변경 불필요)
export interface Note {
  // ...기존 필드...
  /** 펜 모드로 카드 위에 덧그린 손글씨 레이어. JSON {paths:[[{x,y}...]...]}. 없으면 그림 없음.
   *  좌표는 카드 content box 기준 상대좌표. */
  overlay?: string;
}

// NoteKind: code/checklist/highlight를 union에서 제거(마이그레이션 후).
//   text = 마크다운 메모. handwriting/mindmap/image/link/audio/file 유지.
//   ※ 마이그레이션 코드가 끝날 때까지 union에 레거시 kind를 남길지 여부는 D3에서 결정.
```

마이그레이션(`MossDB` `version(2).upgrade`):
- `code`   → `text`, content: ```` ```{lang}\n{code}\n``` ````
- `checklist` → `text`, content: `items.map(i => "- [" + (i.done?"x":" ") + "] " + i.text).join("\n")`
- `highlight` → `text`, content: `"> " + quote (+ "\n> — " + source)`
- `overlay`는 신규 optional → 기존 행 변경 불필요(undefined 허용).

## 6. 인터페이스

### Store (Zustand, `workspace.ts`)
- `penMode: boolean` + `penTool: "pen"|"eraser"` + `penWidth: number` — 펜 모드 전역 상태
- `togglePenMode()` / `setPenMode(on)` — 진입·해제(해제 시 editing 충돌 정리)
- `setNoteOverlay(noteId, overlayJson)` — overlay 저장(기존 카드 update 액션 재사용 가능)
- `CAPTURE_TOOLS`에서 `code/checklist/highlight/handwriting` 제거, `text` 라벨 "메모"로. `ToolId`에 `"pen"` 추가(캔버스 그룹).

### React 컴포넌트
- `<MarkdownMemoContent card editing onChange onCommitEdit />` — text 카드 Content 교체. editing=true면 Milkdown WYSIWYG 인스턴스, false면 직렬화 마크다운 정적 렌더(readonly). onChange는 직렬화된 마크다운 문자열을 받음
- `<DrawingLayer card active onChange />` — handwriting에서 추출한 공유 SVG 그리기 레이어. overlay·레거시 handwriting 공용.
- Canvas: 펜 모드일 때 커서 CSS(`cursor: url(pen)`), 카드 위 DrawingLayer를 `active`로, 카드 드래그 핸들러 비활성.

## 7. 시각·인터랙션

- 메모 카드: focus 시 Milkdown 라이브 프리뷰(타이핑하며 렌더), blur 시 정적 렌더. 카드 표면 PNG는 text 카드 v2 surface 사용 — Milkdown 기본 테마 CSS를 surface inset/타이포에 맞춰 오버라이드.
- 펜 모드: 사이드바 펜 아이콘 active 표시 + 전역 커서 펜. 메모지 위 드래그 = 그리기, 카드 이동은 펜 모드 해제 후.
- 펜 모드와 카드 편집 모드는 **상호배타** — 펜 모드 진입 시 열린 편집 카드 commit, 편집 진입 시 펜 모드 해제(§11 D1과 연동).

## 8. 비기능 요구사항

- **성능**: WYSIWYG 타이핑 입력→렌더 < 50ms 체감. 펜 스트로크 지연 체감 없음(기존 handwriting 수준). **Milkdown 인스턴스는 focus된 카드에만** 두고 나머지는 정적 렌더로 — 캔버스 N장 동시 mount 회피(메모리·초기화 비용).
- **접근성**: 펜 모드 토글 키보드 도달, 작업목록 체크박스 키보드 토글 가능, ARIA 라벨.
- **프라이버시**: 모두 로컬(Dexie/OPFS). react-markdown은 raw HTML 비활성(XSS 방지).
- **i18n**: 한국어 v1, 라벨은 i18n 키. 펜/메모 도구 라벨 키 추가.
- **데이터 안전**: 마이그레이션은 idempotent, 실패 시 원본 보존(트랜잭션). 백업 export 권고.

## 9. 다음 iteration (의도적 보류)

- 코드블록 구문 강조 — react-markdown + rehype-highlight, v1 단순화 우선
- 마크다운 표·이미지 임베드·수식 — 수요 확인 후
- 펜 색상·형광펜·도형 — 단색 펜 먼저
- 비메모 카드 overlay 그리기(이미지 위 주석 등) — overlay 모델은 일반화 가능하게 설계, 활성화는 다음
- 마크다운 슬래시 커맨드·단축 메뉴 — Milkdown 플러그인으로 가능하나 v1은 순수 문법만

## 10. 검증 방법 (DOD)

- [x] 타입: `tsc --noEmit` 클린 (전 단계)
- [x] 린트: `eslint` 클린, `check:i18n` 통과
- [x] 단위 **작성**: markdownMigration / penMode / DrawingLayer / text(stub) + 단축키·캡처 갱신
- [~] 빌드: `next build` (SSR/Milkdown 번들·CSS 검증) — 실행 중/대기
- [ ] ⛔ 단위 **실행**: WSL drvfs에서 vitest 워커 행(60s 타임아웃) — 로컬 불가, **CI/정상 터미널 위임**
- [ ] 브라우저 실측(사용자): 메모 4종 문법 렌더, 펜 모드 켜고 메모 위 그리기→카드 이동 동반→Esc 해제, 마이그레이션 손실 0
- [ ] cleanup: 미사용 i18n placeholder 키(capture.text/code/highlight.placeholder) 제거 — 비차단

> 환경 메모: 이 세션은 `/mnt/c`(WSL drvfs)라 vitest 워커가 안 뜬다(코드 문제 아님 — 직전 465/465 통과). 게이트는 tsc/eslint/build로 대체, 단위 실행은 CI 또는 Linux FS에서.

## 11. DECISIONS (확정)

| # | 결정 | 확정 | 사유/리스크 |
|---|---|---|---|
| **D1** | 마크다운 렌더 모델 | ✅ **라이브 프리뷰(WYSIWYG, 올서타이프)** | 사용자 선택. 타이핑하며 렌더. 구현량↑이나 사용감 우선 |
| **D2** | 에디터 라이브러리 | ✅ **Milkdown** (remark 기반 마크다운 네이티브 WYSIWYG) | source=마크다운 round-trip 충실. raw HTML off. ProseMirror 인스턴스 비용은 §8로 관리 |
| **D3** | 기존 카드 처리 | ✅ **Dexie v2 마이그레이션**(전환) | 목표가 "종류 통합". **사용자 로컬 데이터 변경 = 최대 리스크** → idempotent+트랜잭션, 실패 시 원본 보존 |
| **D4** | handwriting 카드 운명 | 사이드바에서 제거, 로직은 DrawingLayer로 추출. 레거시 카드는 보기 유지 | 펜 모드가 상위호환. 레거시 paths를 overlay로 옮길지는 선택 |
| **D5** | mindmap | 현행 유지(통합 제외) | 트리는 마크다운 부적합 |
| **D6** | overlay 저장 | `Note.overlay?` 비인덱스 필드 | 스키마 인덱스 변경 불필요 = 저위험 |
| **D7** | 펜 대상 범위 | v1 메모 카드 한정 | 일반화 설계하되 활성화는 메모부터 |
