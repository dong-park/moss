# n4-memo-window — 메모 창 안의 링크·녹음·파일 블록

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n2-blocks (parseBlock·serializeBlock)
**상태**: pending

## 문제

"겉은 포스트잇, 안은 문서"의 안쪽이 아직 글과 펜뿐이다. 녹음·파일·링크를 따로 카드로 만들던 기능이 메모 창 안으로 들어와야 한다.

## 목표

메모 창(MemoExpandDialog)에 블록 추가 메뉴(이미지·링크·녹음·파일)가 있고, 넣은 블록이 창 안에서 보이고 재생·열린다. 새로고침 후 그대로다. NodeView는 읽기 전용 모드도 지원해 n5가 앞면에 재사용한다.

## 작업

1. `web/src/components/workspace/cards/_shared/editor/extensions.ts`의 `editorPlugins[]` seam에 `opfsImagePlugin` 옆으로 링크·녹음·파일 NodeView 플러그인 추가. 블록 인식은 n2 `parseBlock`(문단 단독일 때만).
   - 링크: 제목 + 도메인, 클릭 시 새 탭. 미리보기 실패하면 URL만(spec §4).
   - 녹음: `web/src/components/workspace/cards/audio/Content.tsx`의 MediaRecorder·mimeType 선택 로직을 이식해 녹음/정지/재생. 바이트는 OPFS. 마이크 권한 없으면 블록 넣지 않고 토스트.
   - 파일: 파일명·크기·열기(Blob URL). OPFS에 없으면 "파일을 찾을 수 없음" 자리표시, 본문 참조 유지.
   - 각 NodeView에 `readonly` 모드(재생·열기 요소 숨김) prop.
2. `web/src/components/workspace/cards/MemoExpandDialog.tsx` 헤더에 블록 추가 메뉴(4항목). 커서 위치에 `serializeBlock` 결과 문단 삽입. 파일·녹음 50MB, 이미지는 FEAT-memo-image-paste 한도(10MB) — 넘으면 토스트.
3. 카드와 창의 NodeView 높이가 같아야 펜 overlay 좌표가 맞는다 — `MEMO_CONTENT_WIDTH` 컬럼 1:1 규칙 유지(파일 상단 주석 참고).
4. 새 글자는 `web/src/i18n/messages/ko.json` 키로.
5. 테스트: `web/src/components/workspace/cards/__tests__/MemoBlocks.test.tsx` — 메뉴 4항목, 링크 삽입 후 본문 마크다운에 `"moss-link"` 블록, 녹음 블록 렌더(MediaRecorder 모킹 허용하되 실경로 갭 기록), 권한 거부 토스트, readonly 모드에서 재생 버튼 없음.

## 완료 기준

- [ ] plan 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/components/workspace/cards/__tests__/MemoBlocks.test.tsx` 통과
- [ ] spec AC-9: 메뉴 4항목, 링크 삽입→닫으면 링크 개수 +1(본문 `countBlocks`로 확인), 녹음 삽입·재생, 새로고침 후 네 블록 유지
- [ ] 실경로: `cd web && npm run dev` 후 브라우저에서 메모 창을 열어 링크·녹음·파일 블록을 각 1개 넣고 새로고침해 유지되는지 스크린샷을 `구현 메모`에 경로로 남긴다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/MemoExpandDialog.tsx` | 메모 창(Radix Dialog, Milkdown + DrawingLayer) |
| `web/src/components/workspace/cards/_shared/editor/extensions.ts` | editorPlugins seam |
| `web/src/components/workspace/cards/_shared/editor/imagePaste.ts` | opfsImagePlugin·OPFS 변환 |
| `web/src/components/workspace/cards/audio/Content.tsx` | 녹음 로직 이식 원본 |
| `web/src/state/db/opfs.ts` | OPFS 저장 |
| `web/src/state/blocks.ts` | n2 산출물 |

## 부분 납품

링크·파일 블록 우선. 녹음 블록은 파킹 가능(플랜 파킹 로그에 기록) — n5는 링크·파일만으로도 진행할 수 있다.

## 구현 메모

