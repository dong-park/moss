# n5-export — 번들·제이슨 캔버스에 배경 싣기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: FT-5
**상위**: spec/frame-image-template/spec.md
**deps**: n2
**상태**: 끝남
**담당 행**: T7
**사람 확인**: 불필요

## 문제

- 판 배경이 내보내기에서 빠지면 다른 기기로 옮길 때 템플릿을 잃는다.

## 목표

moss 번들은 판 배경까지 왕복한다. 제이슨 캔버스는 그룹 노드의 `background`로 이미지를 싣는다. 마크다운은 판 폴더에 이미지 파일만 둔다.

## 작업

1. moss 번들: `collectAttachments`가 판의 `attachmentRef`도 모으는지 테스트로 확인한다. 가져오기(`mossBundleImport.ts` 423행)가 판 행의 ref를 되살리는지 본다.
2. 제이슨 캔버스(`jsonCanvasExport.ts` 52행): group 노드에 `background`(이미지 상대 경로)와 `backgroundStyle: "ratio"` 또는 `"cover"`(D2 답)를 싣는다.
3. 마크다운: 판 이름 폴더에 배경 이미지를 `_background.<확장자>`로 둔다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `npx vitest run src/state/export` 통과: 배경 판 왕복 뒤 ref·bg 크기 같음, 제이슨 캔버스 group에 background 칸
- [ ] 배경 파일이 없을 때 내보내기가 멈추지 않고 누락 목록에 오른다(지금 첨부 규칙)

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/export/attachments.ts` | 첨부 수집 |
| `web/src/state/export/mossBundleImport.ts` | 가져오기 |
| `web/src/state/export/jsonCanvasExport.ts`, `markdownExport.ts` | 표준 형식 |

## 구현 메모

