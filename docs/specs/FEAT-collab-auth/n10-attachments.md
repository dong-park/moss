# n10-attachments — 공유 보드 첨부 업로드

> 자기완결 브리프. runner는 `docs/specs/FEAT-collab-auth.md`와 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n4, n7
**상태**: server(작업 1·2)·web(작업 3·4) 완료. web 전체 1080/1080(기준선 `Canvas.virtualization` 1건 제외) · tsc · lint green. docker compose 실경로로 upload/download·403 확인

## 문제

D12: 공유 보드의 이미지·음성·파일 카드를 다른 참여자도 봐야 한다.

## 목표

공유 보드 첨부가 Ktor를 거쳐 서버 디스크 볼륨에 저장되고 멤버만 내려받는다.

## 작업

1. n4에 `POST /boards/{id}/files`, `GET /boards/{id}/files/{fileId}`를 추가한다. 저장 경로 `/data/files/{boardId}/{fileId}`, docker 볼륨.
2. 파일 1개 20MB, 보드당 500MB 한도. 멤버 아닌 요청 403. 공유 해제 시 디렉터리 삭제.
3. 웹: 공유 보드에서 첨부를 만들면 OPFS에 둔 뒤 업로드하고, Y.Doc 카드에 fileId를 쓴다. 받는 쪽은 없으면 내려받아 OPFS에 캐시.
4. 업로드 전·실패 상태는 '올리는 중' 자리표시자.

## 완료 기준

- [x] spec 공통 완료 기준 전부
- [x] `cd server && ./gradlew test`: 한도·403·해제 시 삭제 테스트 (43/43 green)
- [x] cd web && vitest 전체(1 실패는 기준선 `Canvas.virtualization`) && tsc --noEmit && eslint 변경 파일 0
- [ ] 두 브라우저에서 이미지 카드가 보이는 수동 확인 또는 prove — 미실시(자동 테스트로 대체)
- [x] 실경로: docker compose로 server 기동 후 mint JWT로 `POST /boards/{id}/files`(part `file`) → 201 `{id,name,size,contentType}`, `GET .../files/{id}` 원본 바이트 일치, 비멤버 403 확인

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/db/opfs.ts` | OPFS 저장 |
| `web/src/state/export/attachments.ts` | 첨부 다루는 기존 코드 |
| `web/src/state/attachmentLimits.ts` | 기존 한도 |

## 구현 메모

- 서버 계약 (web 작업 3·4가 맞출 것):
  - `POST /boards/{id}/files` — `multipart/form-data`, part 이름 `file`. 인증 Bearer 필수, 보드 멤버만.
    성공 `201` + `{id, name, size, contentType}`. `id`는 서버 발급 UUID → Y.Doc 카드의 fileId로 쓴다.
    파일 1개 20MB 초과 또는 보드 누적 500MB 초과면 `413` `too_large`.
  - `GET /boards/{id}/files/{fileId}` — 보드 멤버만. `200` + 원본 `Content-Type`,
    `Content-Disposition: inline; filename*=UTF-8''…`. 비멤버 `403`.
  - 저장 경로 `FILES_DIR/{boardId}/{fileId}` (기본 `/data/files`, compose named volume `filedata`).
  - 공유 해제(`DELETE /boards/{id}/share`) 시 `files` 행(cascade)과 보드 디렉터리를 함께 삭제.
  - 스키마 변경 없음: `files` 테이블은 V1에 이미 있고 컬럼이 충분해 V4 마이그레이션 불필요.

- web 구현 (2026-09-28):
  - `state/share/files.ts` — `realFilesApi.upload/download` (위 계약 그대로). multipart part `file`,
    응답 `{id,name,size,contentType}`.
  - `state/share/attachments.ts` — `storeAttachment`(OPFS 먼저 → 공유 보드면 업로드 백그라운드),
    `uploadAttachment`(성공 시 Y.Doc `files` 맵에 `opfs:<file>` → fileId 기록), `resolveAttachment`
    (OPFS 미스 + 공유 보드면 fileId로 내려받아 같은 이름으로 캐시, 매핑 전·실패는 pending).
  - Y.Doc에 `files` Y.Map 추가(`ydoc/model.ts`). 블록 본문은 로컬 ref(`opfs://<file>`)를 그대로
    동기화하고, fileId는 이 맵으로만 흐른다 — 블록 문법·기존 첨부 렌더를 건드리지 않는다.
  - 생성 경로(imagePaste·canvasCapture·BlockMenu·MarkdownToolbar·mossBridge)는 `putBlob` 대신
    `storeAttachment`를 탄다. 렌더(image NodeView·blockView audio/file)는 `resolveAttachment`로
    해석하고 pending이면 '올리는 중' 자리표시자.
  - 가정: 이 기기와 서버가 아는 "공유" 신호는 n7 `useCollab.boardId` 또는 n8 `useShare.byBoard`
    status(둘 다 n9 없이 존재). n9의 `/me/boards` 복원이 붙으면 자동으로 확장된다.
  - 갭: 공유 이전에 만든 로컬 첨부(맵에 fileId 없음)는 다른 참여자에게 영구 '올리는 중'으로 보인다
    (소급 업로드는 범위 밖). 업로드 완료 시 다른 참여자의 열린 화면이 자동으로 이미지로 바뀌는
    실시간 전환은 doc observer 미구현 — 새로 열면 정상.
  - 4413(문서 10MB 초과): `collab/store.ts` onClose가 close code 4413을 받아 '보드가 너무 커요'
    토스트 + `error="boardTooLarge"`.

