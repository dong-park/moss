# FEAT-export · 내보내기 / 가져오기 (Markdown / JSON Canvas / .moss 번들)

> 데이터 소유권 확인. 무손실 백업·이전. 표준 포맷 호환 우선.

**Status**: 구현 완료 (수동 DOD 대기)
**Estimated**: M
**Blueprint**: `features[id="FEAT-export"]`
**갱신**: 2026-09-20 — 옛 종류 가져오기 거부, 제목·메모판·펜 획 싣기 규칙 추가

---

## 1. 목표

PRD §28-1 약속 1: "메모 본문은 기본적으로 사용자 기기에만 있다." 사용자가 언제든 자기 데이터를 끌어가서 다른 도구로 옮기거나 백업할 수 있어야 한다. 3가지 포맷: 표준 호환(Markdown / JSON Canvas) + 무손실(.moss 번들).

## 2. 범위

### 포함
- **내보내기 (Export)**:
  - 3종 포맷:
    1. **Markdown** (메모 1개 = 파일 1개, 폴더로 보드 표현)
    2. **JSON Canvas** (Obsidian 호환, 캔버스 좌표·연결 보존)
    3. **.moss 번들** (zip 내 JSON + OPFS blob, 무손실, 백업·이전용)
  - 범위 선택: 전체 / 현재 보드 / 선택한 메모
  - 진입: 보드피커 하단·보드 우클릭, `Cmd+Shift+E` (`Cmd+E`는 편집 진입)
  - 3 variant (SCR-export):
    - `modal-default` (범위 + 포맷 선택)
    - `in-progress` (버튼 → 진행 막대)
    - `success-toast` (완료 토스트 + 다운로드 안내)
  - 모바일: share sheet으로 위임 (다운로드)
- **가져오기 (Import)**:
  - `.moss` 번들 단방향 import (덮어쓰기 / 병합 선택)
  - 추후 (Phase 3): Notion / Obsidian / Pinterest
- 백업 자동화 (Phase 2): 7일 / 30일 주기 자동 생성 권유

### 2026-09-20 추가 — 무엇을 싣고 무엇을 막는가

[[FEAT-sticky-redesign]] n10이 이 스펙에 넘긴 요구와 [[FEAT-memo-title]]이 미룬 결정을 여기서 확정한다.

**가져오기 방어.** 지금 DB는 v5다. 메모 종류는 `text`·`comment`·`board`·`frame` 넷뿐이다. 옛 종류는 `image`·`link`·`audio`·`file`·`mindmap`·`handwriting`·`highlight`·`checklist`·`code`다. 가져오기는 옛 종류가 다시 들어오는 유일한 길이므로 여기서 막는다.

- 번들 스키마 버전이 5보다 낮으면 **번들 전체를 거부**한다. 옛 백업은 통째로 옛 데이터다. 한 행만 걸러내 봐야 나머지도 못 믿는다. (2026-09-20 사용자 결정 확정)
- 버전이 5인데 옛 종류 행이 섞여 있으면 **그 행만 건너뛰고** 나머지를 들인다. 손상되거나 손으로 고친 파일이다.
- 건너뛴 행은 완료 화면에 개수와 종류별 내역으로 보고한다. 조용히 버리지 않는다.
- 가져오기 전에 사용자 확인을 한 번 받는다. 덮어쓰기 모드는 기존 데이터를 지우기 때문이다.

**제목.** 세 포맷 모두 메모 제목을 싣는다. [[FEAT-memo-title]] 비목표 "내보내기가 제목을 싣는 일"은 이 결정으로 해소된다.

**메모판과 펜 획.** `.moss` 번들은 전량 보존한다. 메모판 행·소속·펜 획을 그대로 싣는다. Markdown과 JSON Canvas는 표준 호환이 먼저라서 펜 획을 싣지 못한다. 획이 있는 메모는 표식만 남기고 획 자체는 버린다.

| 항목 | .moss | Markdown | JSON Canvas |
|---|---|---|---|
| 제목 | 그대로 | frontmatter `title` | 본문 맨 앞 `# 제목` |
| 메모판 | frame 행 + 소속 그대로 | 보드 폴더 밑 판 이름 폴더 | group 노드 |
| 펜 획 | 그대로 | 버림, `hasOverlay: true` 표식 | 버림 |
| 첨부 바이트 | zip 안에 포함 | 상대 경로 링크 | 상대 경로 링크 |

### 제외 (다른 FEAT 담당)
- 데이터 저장 자체 — [[FEAT-storage]]
- 첨부 파일 OPFS — [[FEAT-storage]]
- Pro 동기화 — Phase 2 (Yjs)

## 3. 수용 기준

### AC-1 (REQ-17 충족) — 3종 포맷 모두 작동
- **Given** 메모 100개·보드 7개·연결 50개 보유
- **When** "전체" 범위로 각 포맷 내보내기
- **Then**:
  - Markdown: 폴더 구조로 zip (`board-name/note-id.md`), 메모 본문 + frontmatter (kind, createdAt 등)
  - JSON Canvas: `.canvas` 파일, Obsidian으로 열어 카드 좌표·연결 그대로 보임
  - .moss bundle: 모든 메타데이터 + 첨부 blob 포함, 동일 moss에서 import 시 100% 복원

### AC-2 — 범위 선택
- **Given** 현재 보드 "Brand Exploration" 메모 24개
- **When** 범위 = "현재 보드", 포맷 = Markdown
- **Then** 24개 메모만 포함된 zip. 다른 보드 데이터 포함 안 함.

### AC-3 — 진행 표시
- **Given** 메모 1000개 + 큰 첨부 50개 (총 200MB)
- **When** 내보내기 시작
- **Then** `in-progress` variant — 진행 막대 + 메모 N/M + blob 압축 중 표시. 완료 시 `success-toast` 노출.

### AC-4 — Import 무손실
- **Given** `.moss` 번들 export 후 다른 브라우저에서 import
- **When** 같은 번들 import (덮어쓰기 모드)
- **Then** 메모·보드·연결·첨부·viewport 메모리까지 100% 복원

### AC-5 — 실패 graceful
- **Given** 내보내기 중 OPFS quota 초과 또는 네트워크 끊김
- **When** 작업 진행 중 에러
- **Then** 인라인 에러 표시 + 재시도 버튼. 부분 다운로드 정리. 메모 자체는 안전.

### AC-6 (2026-09-20) — 옛 스키마 번들은 통째로 거부한다
- **Given** manifest의 `schemaVersion`이 4인 `.moss` 번들
- **When** 가져오기를 실행한다
- **Then** 아무 행도 들어오지 않는다. 화면에 "이 백업은 예전 버전이라 가져올 수 없다"는 안내와 번들 버전·현재 버전이 함께 보인다. 기존 데이터는 그대로다.

### AC-7 (2026-09-20) — 옛 종류 행만 건너뛴다
- **Given** `schemaVersion`이 5이고 메모 10개 중 3개가 `image`·`link`·`mindmap`인 번들
- **When** 병합 모드로 가져온다
- **Then** 메모 7개가 들어온다. 완료 화면에 "3개를 건너뛰었다"와 종류별 개수가 보인다. 건너뛴 행은 DB에 남지 않는다.

### AC-8 (2026-09-20) — 제목 왕복
- **Given** 제목이 있는 메모 5개와 제목이 없는 메모 5개
- **When** `.moss`로 내보낸 뒤 덮어쓰기 모드로 다시 가져온다
- **Then** 제목 5개가 글자 그대로 돌아온다. 제목 없던 5개는 여전히 제목이 없다. 빈 문자열이 아니라 값 없음이다.

### AC-9 (2026-09-20) — 메모판과 펜 획 왕복
- **Given** 메모판 2개, 판에 속한 메모 8개, 펜 획이 있는 메모 3개
- **When** `.moss` 왕복
- **Then** 판 이름·크기·위치가 같다. 메모 8개의 소속이 같다. 펜 획 좌표가 같다. 판에 속하지 않은 메모의 소속은 값 없음으로 남는다.

### AC-10 (2026-09-20) — 첨부가 없어도 메모는 산다
- **Given** 본문이 OPFS 첨부를 가리키지만 그 파일이 지워진 메모 1개
- **When** 내보내고 다시 가져온다
- **Then** 내보내기는 끝까지 간다. manifest에 빠진 첨부 참조가 기록된다. 가져오기 뒤 메모 본문은 그대로 남고, 완료 화면에 "첨부 1개를 찾지 못했다"가 보인다. 첨부 하나 때문에 메모를 버리지 않는다.

## 3-1. 경계 조건 (2026-09-20)

- 번들 크기 0바이트, zip이 아닌 파일, manifest 없는 zip — 세 경우 모두 거부하고 이유를 화면에 적는다.
- `manifest.json`의 `schemaVersion`이 숫자가 아니면 거부한다.
- 앞으로 나올 버전, 즉 `schemaVersion`이 현재보다 높은 번들도 거부한다. 모르는 필드를 조용히 버리면 손실이다.
- 병합 모드에서 id가 겹치면 기존 행을 남기고 들어온 행을 건너뛴다. 건너뛴 개수를 보고한다.
- 지워진 메모판을 가리키는 `frameId`는 가져올 때 값 없음으로 푼다. 메모는 제자리에 남는다.
- 제목이 80자를 넘거나 줄바꿈이 섞여 들어오면 `normalizeTitle`을 통과시킨 값으로 저장한다.
- 내보내기 중 메모가 0개면 빈 번들을 만들지 않고 "내보낼 것이 없다"고 알린다.
- 가져오기는 한 트랜잭션으로 끝낸다. 도중에 실패하면 아무것도 들어오지 않는다.

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-17
- 등장 화면: SCR-export 3 variant 모두
- 등장 flow: 직접 등장 flow 없음 (사용자가 명시 진입)

### 다른 feature
- **의존**: [[FEAT-storage]] (전체 데이터 query + OPFS blob 읽기), [[FEAT-canvas]] (선택한 메모 id 전달), [[FEAT-i18n]]
- **의존받음**: 없음

### 외부 라이브러리
- `jszip` — zip 압축
- `js-yaml` (Markdown frontmatter)
- JSON Canvas 명세: https://jsoncanvas.org

## 5. 데이터 모델

2026-09-20 갱신: manifest를 1.1로 올린다. 스키마 버전 검증과 빠진 첨부 보고에 쓸 칸이 필요해서다.

```ts
// .moss 번들 manifest (1.1 — 2026-09-20)
interface MossBundleManifest {
  version: "1.1";
  exportedAt: number;
  /** Dexie DB 버전. 지금은 5. 가져오기가 이 값으로 거부를 판단한다. */
  schemaVersion: number;
  counts: {
    notes: number;
    frames: number;      // kind="frame" 행 수 (notes에 포함된 값의 부분집합)
    boards: number;
    connections: number;
    embeddings: number;
  };
  scope: "all" | "board" | "selection";
  scopeMeta?: { boardId?: string; noteIds?: string[] };
  /** 본문이 가리키지만 OPFS에서 못 찾은 참조. 내보내기를 막지는 않는다. */
  missingAttachments?: string[];
}

// 가져오기 검증 결과 — 완료 화면이 그대로 읽는다.
interface ImportReport {
  imported: { notes: number; frames: number; boards: number; connections: number };
  skippedLegacyKind: { kind: string; count: number }[];
  skippedDuplicateId: number;
  missingAttachments: number;
  unlinkedFrameRefs: number;
}

// 번들 구조 (zip 내부)
// manifest.json
// notes.json
// boards.json
// connections.json
// embeddings.json (옵션)
// settings.json
// attachments/{ref}.{ext}
```

```ts
// Markdown frontmatter 예시 (2026-09-20 갱신 — title·frame·hasOverlay 추가)
---
id: c-abc-123
kind: text
title: 브랜드 톤 정리
board: brand-exploration
frame: 레퍼런스 모음       # 속한 메모판 이름. 소속 없으면 칸 자체를 뺀다
x: 320
y: 140
width: 280
hasOverlay: true          # 펜 획이 있었다는 표식. 획 자체는 이 포맷에 없다
createdAt: 1716279600000
updatedAt: 1716279600000
---

본문 텍스트...
```

제목은 frontmatter에만 둔다. 본문 맨 앞에 `# 제목`을 덧붙이지 않는다. 다시 가져올 때 본문이 한 줄씩 불어나기 때문이다.

파일 이름은 제목이 있으면 제목을 슬러그로 쓰고, 없으면 메모 id를 쓴다. 같은 폴더에서 이름이 겹치면 뒤에 짧은 id를 붙인다.

## 6. 인터페이스

### React 컴포넌트
- `<ExportModal open onClose />` — SCR-export `modal-default`
- `<ExportProgress percent count />` — `in-progress`
- `<ExportSuccess filename />` — `success-toast`
- `<ImportDialog />` — `.moss` 번들 import

### Store actions
- `useExport.run(opts: { scope; format; boardId?; noteIds? }): Promise<Blob>` — 압축된 zip blob
- `useExport.download(blob: Blob, filename: string): void` — 브라우저 download trigger
- `useImport.fromMossBundle(file: File, mode: "merge" | "overwrite"): Promise<ImportReport>`

### 2026-09-20 추가 — 순수 함수로 떼어낼 것

검증은 DB와 파일 시스템 없이 단위 테스트할 수 있어야 한다. 다음 셋을 순수 함수로 둔다.

- `validateManifest(raw: unknown): { ok: true; manifest: MossBundleManifest } | { ok: false; reason: string }`
- `partitionImportNotes(rows: unknown[]): { accepted: Note[]; skipped: { kind: string }[] }` — 옛 종류 판정을 여기 한 곳에 둔다
- `LEGACY_NOTE_KINDS` — 거부 대상 종류 집합. `NoteKind`에서 현재 쓰는 넷을 뺀 나머지다

`CardContent.tsx`의 default 분기는 그대로 둔다. 그 분기는 이미 들어와 버린 옛 행의 마지막 안전망이고, 가져오기 검증은 그 앞을 막는 별개의 층이다.

## 7. 시각·인터랙션

- PRD 참조: §16 SCR-export 3 variant, §29 Export/Import
- 모달 톤: 잔잔, 데이터 소유권 강조 ("당신의 데이터입니다" 카피, 단 강요 X)
- 진행 막대: 종이 위에 잉크가 채워지는 느낌 (PRD §8-4 모션)
- 완료 토스트: 우하단, 다운로드 폴더 안내, 3초 dismiss

## 8. 비기능 요구사항

- **성능**: 1000 메모 zip 생성 < 5s (Web Worker로 분리 권장)
- **메모리**: 큰 첨부는 stream 처리, 메모리에 다 안 올림
- **확장성**: JSON Canvas 명세 변경 추적 (annual 검토)
- **i18n**: 모든 카피 i18n 키

## 9. 다음 iteration

> 2026-09-20 확정: v4 번들 전체 거부(§2·AC-6) — "옛 종류 행만 걸러 들이기"는 버림.

- **Import**: Notion, Obsidian, Pinterest (Phase 3)
- **백업 자동화**: 7일·30일 주기 자동 .moss 생성 + 권장 (Phase 2)
- **클라우드 백업**: Pro 기능 — Google Drive / iCloud 자동 백업 (Phase 3)
- **선택적 export**: 검색 결과만, 날짜 범위만 (Phase 2)
- **PDF export**: 카드 시각 그대로 (Phase 2)
- (2026-09-20) **Markdown·JSON Canvas 가져오기**: 이번에는 내보내기만 한다. 두 포맷은 펜 획을 싣지 못해 왕복이 무손실이 아니다.
- (2026-09-20) **옛 번들 변환기**: 버전 4 이하 백업을 v5 형태로 바꿔 들이는 일. 이번에는 거부만 한다.

## 10. 검증 방법 (DOD)

- [ ] 3종 포맷 모두 정확 export + 외부 도구로 열어 확인 (Markdown → VS Code, JSON Canvas → Obsidian, .moss → moss import)
- [ ] 범위 (전체 / 보드 / 선택) 각각 데이터 정확
- [ ] 진행 표시 + 완료 토스트 시각 일치 (PRD §16)
- [ ] 1000 메모 export < 5s (Worker 활용)
- [ ] Import 무손실 — round-trip (export → import) 시 데이터 동일
- [ ] 실패 시 부분 파일 정리

### 2026-09-20 추가

자동 검증 — `npm run test`와 `npx tsc --noEmit`이 둘 다 그린이어야 한다.

- [ ] 단위: `validateManifest` — 버전 4 거부, 버전 5 통과, 버전 6 거부, 숫자 아님 거부, manifest 없음 거부
- [ ] 단위: `partitionImportNotes` — 옛 종류 9가지가 전부 skipped로, `text`·`comment`·`board`·`frame`은 전부 accepted로 갈린다
- [ ] 단위: `LEGACY_NOTE_KINDS` + 현재 쓰는 4종의 합이 `NoteKind` 전체와 같다. 종류가 늘면 이 테스트가 깨져 갱신을 강제한다
- [ ] 단위: 제목 왕복 — 값 있음·값 없음·80자 초과·줄바꿈 섞임 4가지
- [ ] 단위: 소속 왕복 — 판 있음·판 없음·지워진 판 가리킴 3가지
- [ ] 단위: Markdown frontmatter 생성 — 제목 있는 메모와 없는 메모에서 `title` 칸 유무가 갈린다
- [ ] 통합: 옛 종류가 섞인 번들을 가져오면 DB의 notes에 옛 종류 행이 0개다

수동 검증 — 브라우저에서 확인한다.

- [ ] 버전 4 번들을 끌어다 놓으면 거부 안내가 보이고 기존 메모가 그대로다
- [ ] 옛 종류가 섞인 번들을 가져오면 완료 화면에 건너뛴 개수가 보인다
- [ ] 제목·메모판·펜 획이 있는 캔버스를 `.moss`로 내보내고 다시 가져와 눈으로 같은지 본다
- [ ] Markdown zip을 풀어 판 이름 폴더와 frontmatter `title`을 확인한다

## 11. 구현 메모

- 갱신일 2026-09-20. 갱신 근거: [[FEAT-sticky-redesign]] n10이 넘긴 요구와 [[FEAT-memo-title]] 비목표 해소.
- 현재 DB 버전 5. `web/src/state/db/schema.ts`의 `this.version(5)`가 notes·boards·connections·embeddings를 비운다. settings만 남는다.
- `NoteKind` 전체 12종: `text` `handwriting` `mindmap` `highlight` `checklist` `image` `link` `audio` `file` `code` `board` `frame`.
- 현재 쓰는 4종: `text` `comment` `board` `frame`. `comment`는 `NoteKind`에 없고 content 마커로 구분된다 — 검증 함수가 이 차이를 알아야 한다.
- 거부 대상 9종: `image` `link` `audio` `file` `mindmap` `handwriting` `highlight` `checklist` `code`.
- `web/src/components/workspace/cards/CardContent.tsx`는 `comment`·`board`·`frame`만 분기하고 나머지는 default로 `TextCardContent`에 떨어진다. 크래시는 없고 `attachmentRef`가 화면에 안 나온다.
- 관련 필드: `Note.title` `Note.frameId` `Note.overlay` `Note.attachmentRef` `Note.mediaType` — 전부 비인덱스 optional.
- 제목 정규화: `web/src/state/memoTitle.ts`의 `normalizeTitle`, 최대 80자.
- 메모판 이름 인코딩: `web/src/state/frameContent.ts`의 `encodeFrameContent`·`decodeFrameContent`, 최대 40자, 기본값 `새 메모판`.
- 첨부 읽기: `web/src/state/db/opfs.ts`의 `getBlob(ref)`가 없으면 `null`을 반환한다. AC-10의 빠진 첨부 판정에 그대로 쓴다.
- **단축키**: export는 `Cmd+Shift+E` — `Cmd+E`는 FEAT-card-flow 편집 진입(`useCardFlowShortcuts`)과 충돌 방지.
- **파일 트리**:
  - 순수 로직: `web/src/state/export/*` (validateManifest, partitionImportNotes, mossBundleExport/Import, markdownExport, jsonCanvasExport)
  - store: `web/src/state/exportStore.ts`
  - UI: `web/src/components/export/*` (ExportModal, ExportProgress, ImportDialog, DataTransferMenu)
  - 진입: `BoardPicker` 보드 ContextMenu·하단 메뉴, `ShortcutsBinder` → `useExportShortcuts`
