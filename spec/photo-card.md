# Spec: 사진 카드
Started: 2026-09-30

## 목표
캔버스에 이미지를 놓으면 메모 종이 없이 **사진 그 자체**가 카드로 붙는다.
우클릭으로 캡션 한 줄을 달면 폴라로이드처럼 흰 여백이 생기고, 더블클릭하면 크게 본다.
캡션은 메모 표·검색·AI가 그대로 읽는다.

## 비목표
- 기존 메모 안 이미지 블록을 사진 카드로 옮기지 않는다.
- 메모 편집 중 붙여넣기는 지금처럼 메모 안 이미지 블록이다.
- 이미지가 아닌 파일은 지금처럼 블록 메모다.
- 사진 카드에 여러 장을 넣지 않는다. 한 카드에 사진 한 장이다.
- 자르기·회전·필터 같은 편집은 하지 않는다.
- Markdown zip·JSON Canvas 내보내기에 사진 카드를 넣지 않는다. 백업은 moss 번들이 맡는다.
- 사진 카드는 연결선을 잇지 않는다.
- 파일 한도 불일치를 고치지 않는다. 웹은 이미지 10MB에서 막고, 서버 20MB 한도는 그대로다.
- 서버·sync 코드를 바꾸지 않는다.

## 성공 기준
1. 캔버스 빈 곳에 png를 드롭하면 1초 안에 사진 카드 1장이 생긴다. 메모 종이·제목이 보이지 않는다.
2. 캔버스 붙여넣기도 같은 결과다. 메모 편집 중 붙여넣기는 사진 카드를 만들지 않는다.
3. 새 카드 폭은 240px다. 높이는 원본 비율을 따른다. 800×600 원본이면 240×180이다.
4. 모서리를 끌어 리사이즈해도 가로세로 비율이 0.5% 오차 안에서 유지된다.
5. 우클릭 메뉴에 "캡션 달기"가 보인다. 누르면 사진 아래에 입력칸이 뜨고 포커스가 간다.
6. Enter나 바깥 클릭이면 저장된다. Esc면 원래 값으로 돌아간다.
7. 캡션이 있으면 흰 여백과 캡션 한 줄이 사진 아래에 그려진다. 캡션을 다 지우면 여백도 사라진다.
8. 여백이 생겨도 카드의 x·y·width·height는 변하지 않는다. 카드 왼쪽 위가 고정이다.
9. 더블클릭하면 Radix Dialog로 사진이 크게 보인다. Esc와 바깥 클릭으로 닫힌다.
10. 캡션 "제주 바다"를 단 사진은 메모 표 검색과 캔버스 검색에서 "제주"로 찾힌다. 표에서 이미지 배지 1개가 보인다.
11. 캡션 없는 사진은 표·검색·AI 요약·임베딩에 오르지 않는다.
12. 휴지통에서 영구 삭제하거나 휴지통을 비우면 OPFS blob이 지워진다. 휴지통에 있는 동안은 되살릴 수 있게 남는다.
13. 공유 보드에서 사진 카드를 만들면 다른 참여자 화면에 같은 사진이 뜬다. 나중에 공유로 바꾼 보드의 사진도 올라간다.
14. moss 번들 내보내기·가져오기를 거쳐도 사진과 캡션이 그대로다.
15. 이미지 5장과 pdf 1개를 같이 드롭하면 사진 카드 5장과 메모 1장이 24px 간격으로 쌓인다.
16. `vitest` 전체가 통과한다. 사진 카드 테스트가 최소 4개 추가된다.

## 경계 조건
- 지원 형식은 png·jpeg·gif·webp·svg다. 그 외 이미지는 지금처럼 경고 토스트를 띄우고 무시한다.
- 이미지 한도는 10MB다. 넘으면 토스트를 띄우고 카드를 만들지 않는다.
- 한 번에 20개까지만 받는다. 넘치면 지금처럼 초과 토스트다.
- 원본 크기를 못 읽으면 정사각형으로 만든다. 크기 없는 svg가 여기 해당한다.
- 캡션은 한 줄이다. 줄바꿈은 저장하지 않는다. 최대 200자다.
- 캡션 여백은 카드 높이에 들어가지 않는다. 그래서 여백이 아래 카드와 겹칠 수 있다. 선택 테두리와 메모판 소속 판정은 사진 부분만 본다.
- 공유 보드에서 아직 안 올라간 사진은 "올리는 중" 자리표시자를 보인다. 이 기기에도 서버에도 없으면 "사진 없음"이다.
- 옛 버전 클라이언트가 사진 카드를 받으면 종류를 모른다. 지금 라우터가 하듯 text로 떨어져 캡션만 보인다. 크래시는 없다.
- 펜 모드에서는 사진 위에 그릴 수 없다. text 카드만 그린다.
- 사진 카드는 기울이지 않는다. 회전은 0이다.
- 시스템 보드에서도 만들 수 있다. 홈에서 생성을 막지 않는다.

## 상태 모델
카드 상태는 두 가지뿐이다. 캡션이 비어 있으면 **그냥 사진**, 있으면 **폴라로이드**다.
캡션 입력칸이 열린 상태는 `editingId`가 이 카드일 때다.

| 지금 | 행동 | 다음 |
|---|---|---|
| 그냥 사진 | 우클릭 "캡션 달기" | 입력 중 |
| 폴라로이드 | 우클릭 "캡션 고치기" | 입력 중 |
| 입력 중 | Enter·바깥 클릭, 내용 있음 | 폴라로이드 |
| 입력 중 | Enter·바깥 클릭, 내용 없음 | 그냥 사진 |
| 입력 중 | Esc | 이전 상태 |
| 아무 상태 | 더블클릭 | 크게 보기 열림. 카드 상태는 그대로 |

불가능한 조합: 캡션 입력 중에 크게 보기가 열리는 것. 더블클릭은 입력칸 위에서 막는다.

## 기술 결정
- 종류 이름은 `photo`다. 옛 `image`는 레거시 종류로 이미 타입에 남아 있어 재사용하면 옛 행과 섞인다.
- 사진 참조는 `Note.attachmentRef`에, MIME은 `mediaType`에 넣는다. 두 필드가 이미 있고 Y.Doc 키·번들 내보내기·휴지통 blob 정리가 전부 이 필드를 본다. 새 필드가 없다.
- 캡션은 `content`에 평문으로 넣는다. 표·검색·AI가 content를 읽으니 따로 잇지 않아도 된다.
- 저장·업로드는 `storeAttachment`를 그대로 쓴다. 공유 보드 업로드와 다른 참여자 내려받기가 이미 들어 있다.
- 화면에 띄울 URL은 `resolveAttachment`로 받는다. ready·pending·missing 세 상태를 이미 돌려준다.
- 높이는 만들 때 원본 비율로 한 번 계산해 `height`에 저장한다. 리사이즈는 저장된 width÷height를 비율로 쓴다. 종류별 고정 비율 표에는 못 넣는다. 사진마다 다르기 때문이다.
- 캡션 여백은 카드 상자 밖으로 흘러넘치게 그린다. textbox가 이미 overflow visible을 쓴다. 높이를 다시 계산하지 않아도 되고 리사이즈 비율이 안 깨진다.
- 크게 보기는 `expandedCardId`를 재사용한다. MemoExpandDialog가 종류를 보고 사진이면 PhotoLightbox를 그린다. 새 전역 상태가 없다.
- 새 store 액션 `addPhotoAt`을 둔다. `addCardAt`은 도구 id로 종류를 고르고 편집 모드를 켜는데, 사진은 참조·비율이 필요하고 편집 모드에 들어가면 안 된다.

## 구현 메모
- 기준 12는 "되돌리기 만료 시 삭제"였다가 prove에서 뒤집었다. 휴지통에서 되살리려면 blob이 있어야 해서, 메모 첨부처럼 영구 삭제·비우기 때 지운다.
- 우클릭 메뉴에서 여는 입력칸은 다음 프레임에 편집을 켠다. 열린 메뉴가 포커스를 가둬 입력칸이 곧바로 blur·저장되던 문제다.

### 작업 단위
노드 7개다. A0 실험이 먼저, 그다음 A가 뿌리고 B·C·D·E는 A만 기다린다. F는 전부 기다린다.

| 노드 | 내용 | 의존 |
|---|---|---|
| A0 실험 | `/hate` 급소 확인: `attachmentRef` 경로는 실사용자가 거친 적이 없다. 기존 text 카드에 `setAttachment(id, "opfs:x.png")`를 붙인 vitest 1개로 ① 두 번째 Y.Doc에서 `resolveAttachment`가 ready ② moss 번들 내보내기→가져오기 뒤 blob 유지 ③ `purgeAttachments`가 blob 삭제 를 확인. 실패한 항목은 여기서 고친다(성공 기준 12·13·14의 전제). | 없음 |
| A 모델 | `NoteKind`에 `"photo"` 추가. `widthForKind`·`CARD_ASPECT_BY_KIND` 항목. `addPhotoAt(x, y, {ref, mediaType, naturalW, naturalH})`. `isCaptureKind`에서 photo 제외. `legacyKinds`·`partitionImportNotes` 허용 목록에 photo. | 없음 |
| B 생성 | `canvasCapture.ts`에 `storePhoto(file)` — 검증·저장 후 `{ref, mediaType, naturalW, naturalH}` 반환. Canvas.tsx onPaste·onDrop이 image면 `addPhotoAt`, 아니면 기존 경로. 쌓기 인덱스는 공유. | A |
| C 렌더 | `cards/photo/Content.tsx` — `<img>` + pending·missing 자리표시자 + 캡션 여백 + 입력칸. `CardContent.tsx` case. DraggableCard: overflow visible, 우클릭 "캡션 달기/고치기", 드래그 가드 셀렉터에 `[data-photo-caption-input]`, 더블클릭 → `setExpandedCard`. `MemoExpandDialog`가 photo면 `PhotoLightbox`. ResizeHandles 비율. i18n 키. | A |
| D 표·검색·AI | `buildMemoRows`·`memoSearch`·`MemoSearchLayer`가 photo 포함. 캡션 빈 사진은 content가 비어 자동 제외. 배지는 image 1. `nowStaying`은 textbox처럼 제외. | A |
| E 공유 backfill | `collectLocalRefs`가 content 마크다운만 훑는다. `note.attachmentRef`도 모으게 한다. 나중에 공유로 바꾼 보드의 사진이 올라가려면 필요하다. | A |
| F 검증 | vitest: CardContent.photo, canvasCapture photo, workspace addPhotoAt, memoTable/memoSearch photo. 로컬 compose에서 공유 보드 왕복 1회 수동 확인. | B C D E |

### 건드리는 파일
- `web/src/state/db/schema.ts` — NoteKind
- `web/src/state/workspace.ts` — widthForKind, CARD_ASPECT_BY_KIND, isCaptureKind, addPhotoAt
- `web/src/state/export/legacyKinds.ts`, `web/src/state/export/partitionImportNotes.ts`
- `web/src/components/workspace/canvasCapture.ts`, `web/src/components/workspace/Canvas.tsx`
- `web/src/components/workspace/cards/photo/Content.tsx` 새 파일, `cards/photo/PhotoLightbox.tsx` 새 파일
- `web/src/components/workspace/cards/CardContent.tsx`, `cards/MemoExpandDialog.tsx`
- `web/src/components/workspace/DraggableCard.tsx`, `ResizeHandles.tsx`
- `web/src/state/memoTable.ts`, `web/src/state/memoSearch.ts`, `web/src/components/workspace/MemoSearchLayer.tsx`
- `web/src/state/share/attachments.ts` — collectLocalRefs
- `web/src/i18n/messages/*.json` — `cards.photo.caption.add`, `cards.photo.caption.edit`, `cards.photo.pending`, `cards.photo.missing`, `cards.photo.lightboxLabel`

### 손대지 않아도 되는 곳
- `ydoc/model.ts` NOTE_KEYS — attachmentRef·mediaType·content 이미 포함.
- `export/attachments.ts` collectAttachments — attachmentRef 기준. 번들 왕복 자동.
- `storage.ts` purgeAttachments·휴지통 blob 삭제 — attachmentRef 기준.
- `share/attachments.ts` storeAttachment·resolveAttachment — 그대로 호출.
- `dexieMigration.ts` — kind가 문자열이면 통과.
- `useAIPipeline`·`enqueueEmbed` — content 기반. 빈 캡션은 이미 걸러진다.
- 서버·sync.

### 세부
- 원본 크기: `createImageBitmap(file)`로 width·height. 실패하면 1:1. svg는 `<img>`에 로드해 naturalWidth를 읽고, 그것도 0이면 1:1.
- `addPhotoAt` 높이: `clamp(240 × naturalH ÷ naturalW, CARD_MIN_HEIGHT, CARD_MAX_HEIGHT)`.
- ResizeHandles: `ratio = card.kind === "photo" ? card.width / card.height : aspectForKind(card.kind)`.
- 캡션 입력칸은 board/Content.tsx 이름 입력칸 패턴을 그대로 쓴다. Enter → blur, Esc → 원복 후 blur, blur → `setContent` 후 `onCommitEdit`.
- 캡션 저장은 `trim()` 후 줄바꿈 제거, 200자 절단.
- 크게 보기 `<img>`는 `max-w-[90vw] max-h-[90vh] object-contain`. 캡션이 있으면 아래 한 줄.
- 삭제된 사진 카드의 blob은 휴지통 되돌리기 만료 때 지운다. 지금 메모와 같은 시점이다.
- 옛 `kindToDefaultToolId`는 photo를 text로 돌린다. 다음 카드 흐름에 오지 않으므로 default면 된다.

## 열린 질문
없음. 브리프로 전부 정해졌다.
