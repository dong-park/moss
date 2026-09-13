# n6-canvas-capture — 캔버스 붙여넣기·파일 드롭이 블록 든 메모를 만든다

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n2-blocks (serializeBlock)
**상태**: done

## 문제

지금 캔버스 URL 붙여넣기는 link 카드를 만들고, 이미지 blob 붙여넣기 분기와 파일 드롭 경로는 아예 없다. 메모 한 종류 원칙과 어긋난다.

## 목표

캔버스에 이미지·URL을 붙여넣거나 파일을 떨어뜨리면 해당 블록 하나가 든 text 메모가 생긴다. image·link·file 종류 행은 늘지 않는다.

## 작업

1. `web/src/components/workspace/Canvas.tsx` onPaste(160행 부근):
   - 이미지 blob → OPFS 저장 → `serializeBlock({type:"image"})` 본문 text 메모를 화면 가운데에.
   - URL 한 줄 → link 카드 대신 링크 블록 text 메모.
   - 입력칸에 커서가 있으면 동작 안 함(기존 규칙).
2. 캔버스 파일 드롭 핸들러 신규: 이미지 파일→이미지 블록, 그 외→파일 블록. 여러 개면 파일마다 메모 1개, 놓은 자리에서 24px씩 비켜 쌓기. 최대 20개, 초과분 토스트. 파일 50MB·이미지 10MB 초과 토스트.
3. 시스템 보드에 드롭하면 기존 사이드바 드롭 토스트("새 보드로 승격")와 같은 동작(`web/src/components/workspace/Sidebar.tsx` tryDrop 참고).
4. 테스트 `web/src/components/workspace/__tests__/canvasCapture.test.tsx`: PNG 붙여넣기 → notes text 행 +1·이미지 블록 본문·image 행 +0, URL → 링크 블록, PDF 드롭 → 파일 블록, 21개 드롭 → 20개+토스트, 입력칸 포커스 시 무시.

## 완료 기준

- [x] plan 공통 완료 기준 전부
- [x] `cd web && npx vitest run src/components/workspace/__tests__/canvasCapture.test.tsx` 통과
- [x] spec AC-6·AC-7 전 항목 (spec §10 통합 테스트 "이미지 붙여넣기 뒤 notes에 text 행 1개와 이미지 블록")
- [~] 실경로: dev 서버 기동·캔버스 로드는 확인. paste/drop 실조작은 갭(구현 메모 참고).

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/Canvas.tsx` | onPaste, 캔버스 루트(`data-canvas-root`) |
| `web/src/components/workspace/useClipboardWatch.ts` | 클립보드 감시 참고 |
| `web/src/components/workspace/Sidebar.tsx` | tryDrop 좌표 변환·시스템 보드 토스트 |
| `web/src/components/workspace/cards/_shared/editor/imagePaste.ts` | 이미지 OPFS 저장 |
| `web/src/state/workspace.ts` | addCardAt |
| `web/src/state/blocks.ts` | n2 산출물 |

## 구현 메모

**상태**: done.

- `web/src/components/workspace/canvasCapture.ts` 신규 — OPFS 저장(이미지 10MB·파일 50MB 한도) +
  `state/blocks.ts`의 `serializeBlock`으로 블록 마크다운을 만드는 순수 헬퍼. `imagePaste.ts`(n4/n5 소유,
  다른 노드가 동시 작업)는 건드리지 않고 같은 제한값만 독립적으로 반영했다.
- `web/src/components/workspace/Canvas.tsx`:
  - onPaste: 이미지 blob → `addCardAtViewportCenter("text", …)` + 이미지 블록 본문. URL 한 줄 →
    `serializeBlock({type:"link", url})`가 null이면(허용 스킴 밖) 아무 것도 하지 않고 리턴 —
    기존 일반 텍스트 붙여넣기 동작으로 떨어진다. null이 아니면 text 메모 + 링크 블록, OG 메타는
    비동기로 title만 갱신.
  - onCanvasDrop/onCanvasDragOver 신규 — 파일 드롭마다 이미지/파일 블록 든 text 메모 1개,
    24px씩 비켜 쌓기, 20개 초과분은 토스트, 입력칸 포커스 시 무시. 시스템 보드 드롭은
    `Sidebar.tryDrop`과 동일한 "새 보드로 승격" 토스트를 재사용.
  - `addCardAt`/`workspace.ts`의 기존 시그니처는 바꾸지 않았다 — "text" 툴로 호출만 추가.
- 테스트 `canvasCapture.test.tsx` 8개: PNG 붙여넣기(image 행 +0), URL 붙여넣기(link 행 +0),
  포커스 중 무시(paste·drop 둘 다), PDF/이미지 드롭, 21개 드롭 제한, 시스템 보드 드롭 토스트.
  jsdom에서 실제 clipboardData/dataTransfer를 defineProperty로 주입해 Canvas 전체를 렌더해
  검증 — stub 직접 주입이 아니라 컴포넌트 결선까지 통과하는 실경로 테스트.
- **갭**: dev 서버(`npx next dev -p 3106`)를 띄워 캔버스 로드는 확인했으나(`[data-canvas-root]`
  대기 성공), 실제 스크린샷 붙여넣기·파일 드롭 조작은 이 워크트리 안에서 pharos in-pane 브라우저의
  `browser eval`이 "worktree 격리" 안전장치로 차단되어(클립보드/DataTransfer 합성 이벤트를 보낼
  다른 수단이 없음) 수행하지 못했다. 사람이 실브라우저에서 스크린샷 붙여넣기 1회, PDF 드롭 1회,
  새로고침 후 메모 유지를 확인해 주길 권한다.

**2단계 리뷰 반영**:
- 파일 블록 "열기"(사용자 결정, `blockView.ts`의 `shouldOpenFileInNewTab`): PDF·이미지(svg 제외)·
  오디오·text/plain만 새 탭(`window.open`), 그 외(html·svg·기타)는 `<a download>`로 강제 다운로드
  (파일명은 블록 라벨 그대로) — svg·html은 스크립트를 담을 수 있어 새 탭 열람 대신 다운로드를
  강제한다. 파일 본체 MIME을 저장하지 않으므로 파일명 확장자로 판정한다(한계 — 확장자를 속인
  업로드는 오탐 가능, n10에서 필요하면 실제 저장 시 MIME도 같이 기록하도록 확장).
- 한도·지원 형식은 `state/attachmentLimits.ts`로 단일화했다(`imagePaste.ts`·`BlockMenu.tsx`·
  `canvasCapture.ts` 공유). `canvasCapture.ts`의 한국어 하드코딩 토스트를 `capture.canvas.*` i18n
  키로 옮겼다.
- 시스템 보드 다중 파일 드롭 시 "새 보드로 승격" 토스트를 파일마다가 아니라 드롭 배치당 1번으로
  묶었다(`Canvas.tsx` `onCanvasDrop`) — 액션은 그 배치에서 만든 카드 전체를 한 번에 승격한다.
- OG 메타 비동기 갱신이 사용자의 그 사이 편집을 덮어쓰지 않도록, 도착 시점 카드 content가 삽입
  직후 값과 같을 때만 `setContent`를 호출하도록 가드를 추가했다(`Canvas.tsx` onPaste).

