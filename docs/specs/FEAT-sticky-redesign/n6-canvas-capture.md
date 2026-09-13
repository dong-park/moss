# n6-canvas-capture — 캔버스 붙여넣기·파일 드롭이 블록 든 메모를 만든다

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n2-blocks (serializeBlock)
**상태**: pending

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

- [ ] plan 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/components/workspace/__tests__/canvasCapture.test.tsx` 통과
- [ ] spec AC-6·AC-7 전 항목 (spec §10 통합 테스트 "이미지 붙여넣기 뒤 notes에 text 행 1개와 이미지 블록")
- [ ] 실경로: dev 서버에서 스크린샷 붙여넣기·PDF 드롭 후 새로고침해 메모 유지 확인, 결과를 `구현 메모`에

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

