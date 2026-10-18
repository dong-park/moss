# n3-bg-ui — 배경 그리기와 우클릭 메뉴

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: FT-3
**상위**: spec/frame-image-template/spec.md
**deps**: n1, n2
**상태**: 끝남
**담당 행**: T5
**사람 확인**: 불필요

## 문제

- 판 우클릭 메뉴가 자유·세로 칸만 고르게 한다.
- 저장된 배경 이미지를 판 뒤에 그리는 화면이 없다.

## 목표

판 우클릭에 "배경 이미지 올리기…"(배경 있으면 "바꾸기…"·"지우기")를 둔다. 고른 이미지를 판 뒤, 메모 아래에 깐다.

## 작업

1. `DraggableCard.tsx` 판 메뉴(1263행 근처 `FRAME_SKIN_MENU` 하위 메뉴)를 배경 항목으로 바꾼다. 숨은 파일 입력으로 고르고 `storePhoto` → `setFrameBackground`.
2. `cards/frame/Content.tsx`가 `attachmentRef`의 이미지를 판 뒤에 그린다. 사진 카드가 쓰는 이미지 읽기 경로를 재사용한다. `pointer-events: none`, 드래그 방해 없음.
3. 맞춤은 D2 답대로(`fill` 또는 `cover`), 진하기는 D3 답대로.
4. 파일이 기기에 없으면 사진 카드의 "찾을 수 없음" 자리표시를 따른다. 공유 보드에서 내려받는 중이면 빈 판으로 둔다.
5. 판 위 이미지 드롭은 D5 답대로. 추천 A면 손대지 않는다.
6. i18n 키를 더한다: `workspace.frameBg.upload`·`replace`·`clear`.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `npx vitest run src/components/workspace` 통과: 메뉴 항목이 배경 유무로 바뀐다, 고른 파일로 `setFrameBackground`가 불린다, 배경 `img`가 메모보다 아래이고 클릭을 막지 않는다
- [ ] 10MB 넘는 파일이나 지원 안 하는 형식은 토스트만 뜨고 판이 그대로다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/DraggableCard.tsx` | 판 우클릭 메뉴 |
| `web/src/components/workspace/cards/frame/Content.tsx` | 배경 그리기 |
| `web/src/components/workspace/cards/photo/Content.tsx` | 이미지 읽기·자리표시 참고 |
| `web/src/i18n/messages/ko.json` | 문구 |

## 구현 메모

