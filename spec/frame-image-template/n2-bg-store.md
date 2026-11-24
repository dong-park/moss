# n2-bg-store — 배경 이미지 저장·정리·비율

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: FT-2
**상위**: spec/frame-image-template/spec.md
**deps**: 없음
**상태**: 끝남
**담당 행**: T3, T4
**사람 확인**: 불필요

## 문제

- 판에는 이름과 스킨만 저장되고 이미지를 둘 자리가 없다.
- 이미지를 바꾸거나 판을 지울 때 남는 파일 정리 규칙이 없다.

## 목표

스토어에 `setFrameBackground(id, photo)`·`clearFrameBackground(id)`를 둔다. 배경은 판 행의 `attachmentRef`·`mediaType`, 원본 크기는 `content`의 `bg: { w, h }`다.

## 작업

1. `frameContent.ts`: `FrameContentJson`에 `bg?: { w: number; h: number }`를 더하고 정규화한다(양수 아니면 없음). 이름 바꾸기가 `bg`를 지우지 않게 한다.
2. `workspace.ts`: `setFrameBackground(id, { ref, mediaType, w, h })` — 옛 ref가 있으면 지우고 새 ref를 쓴다. 비율 맞춤 결정이 A면 폭은 그대로, 높이를 `폭 × h / w`로 맞추고(최소·최대 높이로 자름) 소속을 다시 판정한다.
3. `clearFrameBackground(id)` — ref·mediaType·bg를 비우고 파일을 지운다. 판 크기는 그대로.
4. `deleteFrame`이 배경 파일도 지운다. 지우기 실패는 지금처럼 무시하고 고아로 둔다.
5. `resizeFrame`: 배경이 있고 비율 맞춤이면 높이를 폭에 맞춰 비율을 지킨다(모서리 핸들 기준).

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `npx vitest run src/state` 통과: 올리기 → 새로고침 뒤 ref 유지, 바꾸기·지우기·판 삭제 때 옛 파일 삭제 호출, 멤버 메모 좌표 불변
- [ ] 비율 맞춤 때 커진 판이 판 밖 메모를 새로 소속시키는 결과가 손 리사이즈와 같다
- [ ] 공유 동기화 모델 테스트(`ydoc/__tests__/model.test.ts`)에 판 `attachmentRef` 왕복 한 건

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/frameContent.ts` | 판 content 인코딩 단일 소스 |
| `web/src/state/workspace.ts` | `resizeFrame`(2692행), `renameFrame`, `deleteFrame`(2834행), `resolveMembership` |
| `web/src/state/db/opfs.ts` | `deleteBlob` |
| `web/src/components/workspace/canvasCapture.ts` | `storePhoto` 반환형 `StoredPhoto` |

## 구현 메모
- (메인, 2026-10-18) 공유 보드에서 다른 사람이 판을 지우면 내 기기 파일은 안 지워진다. 사진 카드와 같은 한계로 둔다.

