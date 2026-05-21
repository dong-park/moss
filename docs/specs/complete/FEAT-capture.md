# FEAT-capture · 10종 빠른 입력

> 사용자가 떠오른 생각을 2초 안에 어떤 형태로든 남길 수 있게 한다. 제목·폴더·태그 강제 없음, 미완성 허용.

**Status**: ✅ complete (2026-05-21) — 검증 통과, AC 모두 충족
**Estimated**: L
**Blueprint**: `features[id="FEAT-capture"]`

---

## 1. 목표

생각이 사라지기 전에 잡는 것이 moss의 첫 약속. 사용자가 어떤 진입점(도구 드래그·단축키·모바일 캡처 바·익명 첫 진입)에서든 **2초 이내**에 메모를 남기고, 그 즉시 다음 사고로 넘어가거나 머무를 수 있어야 한다.

## 2. 범위

### 포함
- 10종 카드 type 인플레이스 편집 모드:
  - `text` (Aa) — 자유 텍스트, 자동 multiline
  - `handwriting` (✎) — Pencil/트랙패드 그리기 (캔버스 SVG path 저장)
  - `mindmap` (⌒) — root 노드 + 자식 노드 추가 (간단 트리)
  - `highlight` (⌘) — 인용 텍스트 + 출처 메타
  - `checklist` (☑) — 빈/체크 항목 다중
  - `image` (🖼) — 파일 선택 또는 클립보드 paste
  - `link` (🔗) — URL 입력 → 자동 preview(title/summary/thumb)
  - `audio` (🎤) — 즉시 녹음 시작 → 정지 시 저장 (Whisper transcribe는 옵션)
  - `file` (📎) — 파일 선택 + 미리보기
  - `code` (</>) — 빈 카드 + 언어 자동 감지 + 구문 강조
- 진입점 4가지:
  1. **데스크톱 메인**: 사이드바 도구 끌어다 놓기 (SCR-workspace `dragging` variant)
  2. **글로벌 단축키**: `Cmd+Shift+N` (마지막 사용 도구로 즉시 캔버스 중앙) → SCR-capture-bar `desktop-modal`
  3. **모바일**: 하단 캡처 바 탭 → SCR-capture-bar `mobile-sheet`
  4. **온보딩 첫 캡처**: SCR-onboarding `initial` → 입력 → `after-input` 전환
- 도구별 단축키 `Cmd+1` ~ `Cmd+0`
- 입력 직후 즉시 편집 모드 진입 (커서 활성)
- 빈 메모 허용 (REQ-8 — 사용자가 ESC 또는 빈 상태로 blur해도 카드 유지)
- 클립보드 자동 감지 (이미지 타입에서 paste, 링크 타입에서 URL 패턴)

### 제외 (다른 FEAT 담당)
- 카드 자유 배치·드래그·삭제 — [[FEAT-canvas]]
- 카드 위치 / 메타데이터 영속 — [[FEAT-storage]]
- 시스템 보드 자동 큐레이팅 — [[FEAT-home]]
- 사용자 보드 / 보드 선택 — [[FEAT-boards]]
- AI 임베딩·OCR·transcribe 자동 처리 — [[FEAT-ai-pipeline]]
- 첨부 파일 OPFS 저장 — [[FEAT-storage]]

## 3. 수용 기준

### AC-1 (REQ-1 충족) — 2초 이내 입력
- **Given** 워크스페이스 진입 상태
- **When** 사용자가 단축키 `Cmd+Shift+N` 누름
- **Then** 캡처 바가 200ms 이내 모달로 등장, 텍스트 커서 활성. 입력 + Enter까지 누적 2초 이내 가능.

### AC-2 (REQ-2 충족) — 10종 모두 작동
- **Given** 사이드바 10종 도구
- **When** 각 도구를 캔버스에 끌어다 놓음
- **Then** 도구별 빈 카드가 drop 위치에 생성되고 type별 편집 모드 활성 (예: text=커서, image=파일 dialog, audio=녹음 시작)

### AC-3 (REQ-8 충족) — 미완성 허용
- **Given** 빈 카드가 막 생성됨 (편집 모드)
- **When** 사용자가 한 글자도 입력하지 않고 ESC 또는 다른 곳 클릭
- **Then** 카드는 유지됨 (빈 상태). 어떤 압박 UI도 표시 안 함. 다음 진입 시 빈 상태 그대로.

### AC-4 — 입력 후 즉시 영속
- **Given** 카드에 한 글자라도 입력
- **When** 사용자가 blur (다른 곳 클릭) 또는 ESC
- **Then** 300ms debounce 후 [[FEAT-storage]]에 저장. 새로고침 후 그대로 복원.

### AC-5 — 클립보드 자동 paste
- **Given** 이미지 타입 카드 진입
- **When** 클립보드에 이미지가 있음
- **Then** 자동으로 paste 제안 (또는 즉시 적용 + undo 가능). 사용자가 파일 dialog 클릭 안 해도 됨.

### AC-6 — 모바일 캡처 바
- **Given** 모바일 (viewport ≤ 768px)
- **When** SCR-mobile-feed 하단 캡처 바 `+` 탭
- **Then** 하단 시트가 60% 높이로 올라옴 (SCR-capture-bar `mobile-sheet` variant). 카메라·마이크·사진 라이브러리 빠른 진입 노출.

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-1, REQ-2, REQ-8
- 등장 화면:
  - SCR-workspace (`dragging` variant 시 진입)
  - SCR-capture-bar (`desktop-modal` / `mobile-sheet` / `audio-recording` 3개 variant 모두)
  - SCR-onboarding (`initial` → `after-input`)
- 등장 flow:
  - FLOW-capture-revisit (step 1·2)
  - FLOW-board-build (step 2·3)
  - FLOW-onboarding (step 3·4)

### 다른 feature
- **의존**: [[FEAT-storage]] (Note 저장), [[FEAT-canvas]] (카드를 캔버스에 배치)
- **의존받음**: [[FEAT-home]] (재노출), [[FEAT-ai-pipeline]] (저장 후 임베딩 큐 자동 등록), [[FEAT-mobile]]

### 외부 라이브러리
- `lucide-react` 또는 자체 SVG (도구 아이콘은 이미 PNG로 존재)
- `react-aria` 또는 native MediaRecorder API (audio)
- `lowlight` 또는 `prismjs` (code 구문 강조)
- 링크 preview API: 자체 백엔드 endpoint `/api/preview?url=...` (Open Graph fetch)

## 5. 데이터 모델

[[FEAT-storage]]의 `Note` 인터페이스에 의존. 본 feature는 `Note.kind`별 `content`·`attachmentRef` 필드 사용 규약을 정의:

| kind | content 필드 | attachmentRef |
|---|---|---|
| text | 본문 plain text | — |
| handwriting | SVG path JSON | — (또는 OPFS) |
| mindmap | 트리 JSON `{ root: { id, text, children: [...] } }` | — |
| highlight | `{ quote: string, source?: string }` JSON | — |
| checklist | `[{ id, text, done }]` JSON | — |
| image | alt 텍스트 | OPFS 경로 |
| link | URL + preview `{ url, title?, summary?, thumbUrl? }` JSON | — |
| audio | transcript (있으면) + duration | OPFS 경로 (오디오 파일) |
| file | 파일명 + MIME | OPFS 경로 |
| code | `{ code: string, lang?: string }` JSON | — |

## 6. 인터페이스

### Store actions (FEAT-storage 위에 capture-specific)
- `useWorkspace.createCardAt(toolId: ToolId, x, y, boardId): string` — 빈 카드 + 편집 모드 진입
- `useWorkspace.commitContent(id, content): void` — 편집 종료 시 영속

### React 컴포넌트
- `<DraggableToolItem id="text" />` — 사이드바 도구 (이미 존재)
- `<CaptureBar variant="desktop-modal" | "mobile-sheet" | "audio-recording" />` — SCR-capture-bar의 본 구현
- `<CardEditor kind={kind} value={content} onChange onCommit />` — type별 인플레이스 편집 컴포넌트
  - kind별 sub: `<TextEditor>`, `<HandwritingEditor>`, `<ChecklistEditor>`, ...

### Hooks
- `useShortcuts()` — `Cmd+Shift+N`, `Cmd+1` ~ `Cmd+0` 글로벌 단축키
- `useClipboardWatch(kind)` — 클립보드 변화 감지 (kind에 따라 필터)

## 7. 시각·인터랙션

- PRD 참조: §7-3 (Capture), §12 SCR-capture-bar, §15 SCR-onboarding
- 잔향 모션: 카드 등장 시 80~120ms ease-out + 미세 회전 ±1.5° (PRD §8-4)
- placeholder: "지금은 그냥 남겨두셔도 좋아요..." — i18n 키 `capture.placeholder`
- 도구별 drop 시 즉시 편집 활성 (cursor blink 200ms 이내)

## 8. 비기능 요구사항

- **속도**: 도구 드래그 시작 → drop → 편집 활성까지 누적 < 500ms
- **모바일 햅틱**: drop 시 light haptic (iOS Safari 한정, 가능 시)
- **접근성**: 모든 도구에 키보드 단축키 (`Cmd+1`~`Cmd+0`). 도구 아이콘은 `aria-label` 한국어.
- **i18n**: 모든 placeholder·라벨은 [[FEAT-i18n]] 키 통과
- **프라이버시**: 클립보드 감지는 사용자 권한 (`navigator.clipboard.readText`) — 거부 시 fallback (paste 단축키 안내)

## 9. 다음 iteration

- 도구 사용 패턴 학습 — 자주 쓰는 도구가 사이드바 상단으로 (UI 위치 변경은 옵트인)
- 브라우저 익스텐션 — 외부에서 링크·이미지 → moss로 (PRD §7-3)
- AI assisted capture — 텍스트 입력 시 자동 카테고리 제안 (옵트인)
- 손글씨 OCR — handwriting → text 자동 변환 (Phase 2)

## 10. 검증 방법 (DOD)

- [ ] 10종 type 각각 드래그/단축키/모바일 진입 시나리오 e2e 테스트
- [ ] 입력 2초 이내 가능 — 사용자 측정 (단축키 → Enter)
- [ ] 빈 카드 ESC 시 유지 확인
- [ ] 클립보드 자동 paste 검증
- [ ] 모바일 하단 시트 60% 높이, 카메라/마이크/사진 빠른 진입 작동
- [ ] PRD §12 와이어프레임 시각 대조 (모든 variants)
