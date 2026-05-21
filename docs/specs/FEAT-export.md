# FEAT-export · 내보내기 / 가져오기 (Markdown / JSON Canvas / .moss 번들)

> 데이터 소유권 확인. 무손실 백업·이전. 표준 포맷 호환 우선.

**Status**: spec
**Estimated**: M
**Blueprint**: `features[id="FEAT-export"]`

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
  - 진입: 설정 메뉴, 보드 우클릭, `Cmd+E`
  - 3 variant (SCR-export):
    - `modal-default` (범위 + 포맷 선택)
    - `in-progress` (버튼 → 진행 막대)
    - `success-toast` (완료 토스트 + 다운로드 안내)
  - 모바일: share sheet으로 위임 (다운로드)
- **가져오기 (Import)**:
  - `.moss` 번들 단방향 import (덮어쓰기 / 병합 선택)
  - 추후 (Phase 3): Notion / Obsidian / Pinterest
- 백업 자동화 (Phase 2): 7일 / 30일 주기 자동 생성 권유

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

```ts
// .moss 번들 manifest
interface MossBundleManifest {
  version: "1.0";
  exportedAt: number;
  schemaVersion: 1;       // FEAT-storage DB schema version
  counts: { notes: number; boards: number; connections: number; embeddings: number };
  scope: "all" | "board" | "selection";
  scopeMeta?: { boardId?: string; noteIds?: string[] };
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
// Markdown frontmatter 예시
---
id: c-abc-123
kind: text
board: brand-exploration
x: 320
y: 140
width: 280
createdAt: 1716279600000
updatedAt: 1716279600000
---

본문 텍스트...
```

## 6. 인터페이스

### React 컴포넌트
- `<ExportModal open onClose />` — SCR-export `modal-default`
- `<ExportProgress percent count />` — `in-progress`
- `<ExportSuccess filename />` — `success-toast`
- `<ImportDialog />` — `.moss` 번들 import

### Store actions
- `useExport.run(opts: { scope; format; boardId?; noteIds? }): Promise<Blob>` — 압축된 zip blob
- `useExport.download(blob: Blob, filename: string): void` — 브라우저 download trigger
- `useImport.fromMossBundle(file: File, mode: "merge" | "overwrite"): Promise<void>`

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

- **Import**: Notion, Obsidian, Pinterest (Phase 3)
- **백업 자동화**: 7일·30일 주기 자동 .moss 생성 + 권장 (Phase 2)
- **클라우드 백업**: Pro 기능 — Google Drive / iCloud 자동 백업 (Phase 3)
- **선택적 export**: 검색 결과만, 날짜 범위만 (Phase 2)
- **PDF export**: 카드 시각 그대로 (Phase 2)

## 10. 검증 방법 (DOD)

- [ ] 3종 포맷 모두 정확 export + 외부 도구로 열어 확인 (Markdown → VS Code, JSON Canvas → Obsidian, .moss → moss import)
- [ ] 범위 (전체 / 보드 / 선택) 각각 데이터 정확
- [ ] 진행 표시 + 완료 토스트 시각 일치 (PRD §16)
- [ ] 1000 메모 export < 5s (Worker 활용)
- [ ] Import 무손실 — round-trip (export → import) 시 데이터 동일
- [ ] 실패 시 부분 파일 정리
