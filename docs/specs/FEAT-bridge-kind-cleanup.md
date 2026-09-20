# FEAT-bridge-kind-cleanup · 브리지 옛 카드 종류 생성 경로 정리

> 외부 에이전트가 브리지로 만드는 카드도 사람이 만드는 카드와 같아진다. 메모 한 종류에 블록이 들어간다.

**Status**: spec 작성
**Owner**: (미정)
**Estimated**: M
**상위 스펙**: [[FEAT-sticky-redesign]]
**Started**: 2026-09-20

---

## 1. 목표 (Job Statement)

외부 에이전트가 moss-mcp로 카드를 만들면 화면에 깨진 카드가 뜬다. 브리지가 아직 image·audio·file·link·mindmap을 독립 카드로 만들기 때문이다. 이 다섯 경로를 없애고, 같은 결과를 메모 본문 블록으로 내도록 바꾼다.

## 2. 범위

### 포함 (in-scope)

- `mossBridge.ts`의 옛 종류 생성 경로 6곳을 없앤다. `notes.createImage`·`notes.createAudio`·`notes.createFile`·`notes.createMindmap` op와 `notes.create`의 `kind:"link"`·`kind:"mindmap"` 분기다.
- 첨부(이미지·녹음·파일)를 본문 블록으로 넣는 경로를 하나로 모은다. 지금 이미지만 되는 `embedInlineImages`를 세 종류로 넓힌다.
- 링크를 블록 마크다운으로 만든다. `[제목](url "moss-link")` 형태다.
- 브리지가 저장하는 첨부에 용량·형식 한도를 건다. 지금은 무제한이다.
- moss-mcp 쪽 도구(`server.ts`)를 새 계약에 맞춘다. 도구 이름은 유지하고 속만 바꾼다.
- `scripts/smoke.ts`의 단정을 새 결과에 맞춘다.
- `mcp/README.md`의 도구 표를 고친다.

### 제외 (비목표)

- 옛 카드 **읽기** 경로 손대기. `notes.list`·`notes.get`은 지금처럼 어떤 kind든 그대로 돌려준다.
- 이미 저장된 옛 kind 행의 이관. FEAT-sticky-redesign이 v5 초기화로 정리했고, 남은 행은 열화 렌더가 받는다.
- 브리지가 메모 제목([[FEAT-memo-title]])을 싣는 일. 다음 iteration이다.
- `notes.createComment`·`notes.createBoard` 변경. 코멘트·파일함은 지금도 전용 화면이 있는 살아 있는 종류다.
- 브리지 보안 게이트·WS 릴레이 구조 변경.
- MCP 도구 이름 변경. 에이전트가 이미 쓰는 이름이다.

## 3. 수용 기준 (Acceptance Criteria)

### AC-1 — 브리지로 옛 독립 카드를 만들 수 없다
- **Given** moss 탭이 브리지에 붙어 있다.
- **When** `notes.createImage`·`notes.createAudio`·`notes.createFile`·`notes.createMindmap` 중 하나를 보낸다.
- **Then** "알 수 없는 op" 에러가 돌아온다.
- **And** `notes.create`에 `kind:"link"` 또는 `kind:"mindmap"`을 주면 지원하지 않는 kind 에러가 돌아온다.
- **And** 어떤 경우에도 `kind`가 text·comment·board·frame이 아닌 행이 DB에 생기지 않는다.

### AC-2 — 이미지를 블록으로 넣는다
- **Given** 에이전트가 PNG base64를 준다.
- **When** `notes_create_image`를 부른다.
- **Then** `kind:"text"` 메모 한 장이 생긴다.
- **And** 본문에 `![](opfs://<파일>)` 한 줄이 문단 단독으로 들어간다.
- **And** 앞면과 창에서 그 이미지가 블록으로 보인다.

### AC-3 — 녹음·파일도 블록으로 들어간다
- **Given** 에이전트가 audio/mpeg base64와 application/pdf base64를 준다.
- **When** `notes_create_audio`, `notes_create_file`을 각각 부른다.
- **Then** 각각 `[녹음](opfs://<파일> "moss-audio")`, `[<원본 파일명>](opfs://<파일> "moss-file")`을 본문에 담은 text 메모가 생긴다.
- **And** 파일명을 안 주면 라벨은 기본 이름으로 채운다. 빈 대괄호를 만들지 않는다.

### AC-4 — 링크도 블록으로 들어간다
- **Given** 에이전트가 `https://example.com`을 준다.
- **When** `notes_create`에 링크 파라미터를 실어 부른다.
- **Then** `[https://example.com](https://example.com "moss-link")`을 본문에 담은 text 메모가 생긴다.
- **When** `javascript:alert(1)` 같은 허용하지 않는 스킴을 준다.
- **Then** 에러가 돌아오고 카드가 생기지 않는다.

### AC-5 — 한 메모에 여러 블록을 넣는다
- **Given** 에이전트가 본문 글과 첨부 두 개를 한 번에 준다.
- **When** `notes_create`를 부른다.
- **Then** 메모 한 장 안에 글과 블록 두 개가 순서대로 들어간다.
- **And** `placeholder`를 주면 본문의 `{{이름}}` 자리에 블록이 들어간다. 안 주면 본문 끝에 붙는다.

### AC-6 — 한도를 넘으면 거절한다
- **Given** 에이전트가 10MB를 넘는 이미지를 준다.
- **Then** 에러가 돌아온다. OPFS에 blob이 남지 않는다.
- **And** 50MB를 넘는 녹음·파일도 같다.
- **And** 지원하지 않는 이미지 MIME은 거절한다.

### AC-7 — 스모크가 통과한다
- **Given** `NEXT_PUBLIC_MOSS_BRIDGE=1`로 띄운 moss 탭이 붙어 있다.
- **When** `mcp/scripts/smoke.ts`를 돌린다.
- **Then** PASS로 끝난다.
- **And** 보드 A의 카드가 전부 `kind:"text"`다. 개수 단정이 새 결과와 맞는다.

### AC-8 — 링크 미리보기는 그대로 산다
- **Given** OG 메타가 있는 URL이다.
- **When** `notes_create_link_preview`를 부른다.
- **Then** 제목 링크 블록 + 썸네일 이미지 블록 + 요약 글이 든 text 메모가 생긴다.
- **And** 썸네일을 못 가져와도 링크 블록과 요약은 남는다.

## 4. 경계 조건

### 입력 범위

- 이미지 10MB, 녹음·파일 50MB. `attachmentLimits.ts`가 유일한 출처다. 브리지가 따로 숫자를 선언하지 않는다.
- 지원 이미지 MIME은 png·jpeg·gif·webp·svg+xml.
- 링크 URL은 http·https·mailto만. 정규화 결과가 원문과 다르면 거절한다.
- 파일명·링크 제목의 `] " ( ) \`와 제어문자는 `serializeBlock`이 이스케이프한다. 브리지가 따로 손대지 않는다.

### 실패 모드

- blob 저장 실패나 한도 초과면 카드를 만들지 않는다. 절반만 만들어진 메모를 남기지 않는다.
- 첨부 여러 개 중 하나가 실패하면 op 전체를 실패로 돌린다. 앞서 저장한 blob은 고아로 남을 수 있다. 이 고아는 용량 경고([[FEAT-extras]] quota)가 이미 다루는 범위다.
- moss 탭이 안 붙어 있으면 지금처럼 `MossNotConnectedError`다. 변화 없다.

### 동시성

- 현재 보드면 store를 타고, 다른 보드면 Dexie에 직접 쓴다. 이 분기는 그대로 유지한다.
- blob 저장은 moss 탭에서만 일어난다. OPFS가 브라우저 전용이라서다.

## 5. 데이터 모델

새 테이블도 새 필드도 없다. 브리지가 쓰는 행의 `kind`가 좁아질 뿐이다.

```ts
// 브리지가 만들 수 있는 kind (좁아진 뒤)
type BridgeCreatableKind = "text" | "comment" | "board";

// notes.create 파라미터 (블록 일반화 뒤)
interface NotesCreateParams {
  content?: string;
  boardId?: string;
  x?: number; y?: number; width?: number; height?: number;
  /** 본문에 박을 블록들. 이미지·녹음·파일·링크 네 종류. */
  blocks?: BridgeBlockInput[];
}

type BridgeBlockInput =
  | { type: "image"; dataBase64: string; mimeType: string; placeholder?: string }
  | { type: "audio"; dataBase64: string; mimeType: string; placeholder?: string }
  | { type: "file"; dataBase64: string; mimeType?: string; filename?: string; placeholder?: string }
  | { type: "link"; url: string; title?: string; placeholder?: string };
```

`images[]`는 `blocks[]`의 부분집합이다. 기존 `images` 파라미터를 유지할지는 §9 D2에서 정한다.

## 6. 기술 결정

**방향은 (a) 삭제 + 블록 문법 생성으로 대체다.** (b) 옛 op를 속으로 변환해 남기는 길은 버린다.

근거 셋이다.

첫째, 이 브리지는 공개 API가 아니다. 소비자는 같은 레포의 `mcp/` 하나뿐이고 두 패키지는 함께 버전이 올라간다. 하위호환을 지킬 외부 호출자가 없다.

둘째, 옛 op를 남기면 거짓말이 된다. `notes.createImage`라는 이름은 "이미지 카드를 만든다"는 약속인데 결과는 메모다. 반환값의 `kind:"image"`·`attachmentRef`도 더는 맞지 않는다. 이름과 결과가 어긋난 op는 에이전트를 더 헷갈리게 한다.

셋째, 계약 표면은 **MCP 도구 이름 쪽에서** 지킨다. `notes_create_image`는 에이전트가 이미 아는 동사이고 입력 모양(path 또는 base64)도 그대로 맞다. 도구 이름은 살리고 속만 새 브리지 op로 갈아끼운다. 두 층이 서로 다른 속도로 움직이는 셈이다 — 브리지 op는 데이터 모델을 따라가고, MCP 도구는 에이전트 어휘를 따라간다.

**블록 문법은 `state/blocks.ts`의 `serializeBlock` 하나만 쓴다.** 브리지가 문자열을 직접 조립하지 않는다. 이스케이프·스킴 검사가 한 곳에 있어야 저장형 XSS 구멍이 두 벌 생기지 않는다.

**한도는 `attachmentLimits.ts`에서 읽는다.** `canvasCapture.ts`를 그대로 재사용하지는 않는다. 그쪽은 `File`을 받고 실패를 토스트로 알린다. 브리지는 base64를 받고 실패를 op 에러로 돌려야 한다. 공유하는 것은 상수와 `serializeBlock`이지 함수 본체가 아니다.

**마인드맵은 없앤다.** 블록 대응물이 없고 화면도 이미 지워졌다. 대안은 §9 D1.

## 7. 시각·인터랙션

사람이 쓰는 화면은 바뀌지 않는다. 브리지로 만든 메모가 사람이 붙여넣기로 만든 메모와 같은 모양으로 보이면 된다.

- 블록 렌더는 [[FEAT-sticky-redesign]] AC-8·AC-9가 이미 정한 그대로다.
- 이미지가 있으면 카드 폭 기본값 720을 유지한다. `MEMO_CONTENT_WIDTH` 컬럼에 맞춘 값이다.

## 8. 비기능 요구사항

- **보안**: 브리지는 `NEXT_PUBLIC_MOSS_BRIDGE=1`일 때만 산다. 이 게이트를 건드리지 않는다. 링크 스킴 화이트리스트는 `normalizeLinkUrl`이 유일한 관문이다.
- **성능**: base64 디코딩과 OPFS 쓰기가 첨부당 한 번. 지금과 같다.
- **i18n**: 브리지 에러 메시지는 에이전트가 읽는 글이다. 지금처럼 한국어 하드코딩을 유지한다. i18n 키로 만들지 않는다.

## 9. 사용자 결정 필요

> 2026-09-20 확정: D1 없앰, D2 blocks[] 통합, D3 web+mcp 한 커밋 — 전부 추천대로.

### D1 — 마인드맵 생성 능력
**추천: 그냥 없앤다.** `notes_create_mindmap` 도구와 `kind:"mindmap"`을 삭제한다. 마인드맵 화면은 n10에서 이미 지웠으므로 만들어도 볼 방법이 없다.
대안은 트리를 중첩 목록 마크다운으로 바꿔 text 메모에 넣는 것이다. 내용은 보존되지만, 제품에 없는 기능을 위해 변환 코드를 새로 쓰게 된다.

### D2 — 기존 `images[]` 파라미터
**추천: `blocks[]`로 통합하고 `images[]`는 없앤다.** 파라미터가 둘이면 같은 일을 하는 길이 두 개가 된다.
대안은 `images[]`를 남겨 `notes_create_link_preview`의 기존 호출 모양을 안 건드리는 것이다. 호출부가 레포 안 한 곳뿐이라 통합 비용은 작다.

### D3 — 커밋 순서
**추천: 한 커밋에 web과 mcp를 함께 담는다.** 브리지 op와 MCP 도구는 같은 계약의 양쪽 끝이다. 나눠 커밋하면 중간 커밋에서 smoke가 깨진다.
대안은 노드를 나누되 mcp 노드를 web 노드 바로 뒤에 붙이고 그 사이를 검증하지 않는 것이다.

## 10. 다음 iteration (의도적 보류)

- 브리지가 메모 제목을 싣는 일 — [[FEAT-memo-title]] 비목표에 걸려 있다.
- 고아 blob 회수 — 실패한 op가 남긴 OPFS 파일을 지우는 일. 지금은 용량 경고가 받는다.
- 브리지로 블록을 **읽는** 구조화된 op — 지금은 본문 마크다운 문자열로만 나간다.
- `notes.createComment`·`notes.createBoard`의 정리 여부 — 두 종류가 살아 있는 한 건드릴 이유가 없다.

## 11. 검증 방법 (DOD)

- [ ] `web`: `bun run test` (vitest) 통과. `mossBridge.test.ts`의 옛 kind 케이스 7건을 블록 케이스로 교체.
- [ ] `web`: `tsc --noEmit` 통과.
- [ ] `web`: `bun run lint` 통과.
- [ ] `mcp`: `bun test` 통과.
- [ ] `mcp`: `tsc --noEmit` 통과.
- [ ] 수동: moss 탭을 `NEXT_PUBLIC_MOSS_BRIDGE=1`로 띄우고 `bun run scripts/smoke.ts` → PASS.
- [ ] 수동: 스모크가 만든 보드를 눈으로 본다. 이미지·녹음·파일·링크 블록이 메모 안에서 렌더된다. 깨진 JSON 텍스트 카드가 없다.
- [ ] `mcp/README.md` 도구 표가 실제 도구와 맞는다.

## 12. 구현 메모

### 삭제·수정 대상 (행번호는 2026-09-20 `feat/sticky-redesign` 기준)

`web/src/state/bridge/mossBridge.ts`

| 대상 | 행 | 처리 |
|---|---|---|
| `buildNoteContent` | 84–104 | link·mindmap 분기 삭제. text만 남으면 함수 자체가 불필요 |
| `createAttachmentCard` | 133–167 | 삭제. `ws.addCardAt(kind)`+`setAttachment`가 옛 kind 행을 만든다 |
| `embedInlineImages` | 174–193 | `embedInlineBlocks`로 일반화. `serializeBlock` 호출로 교체 |
| `buildMindmapNode` | 196–209 | 삭제(D1 추천 기준) |
| `notes.create` kind 분기 | 245–297 | `kind` 파라미터 제거, `blocks[]` 처리 |
| `notes.createImage/Audio/File` | 328–333 | 삭제 |
| `notes.createMindmap` | 336–363 | 삭제 |

- `serializeLink`·`serializeMindmap`·`makeMindmapNodeId`·`MindmapNode` import(33–38행)가 전부 죽는다. `cardContent.ts`의 해당 함수는 다른 호출자가 있는지 확인 후 판단 — 이 스펙 범위 밖이면 남긴다.
- `putBlob`·`makeAttachmentFilename` import(39행)는 유지.
- `toBridgeNote`(106–119)는 그대로. 읽기 경로는 비목표.

`mcp/src/server.ts`

| 도구 | 행 | 처리 |
|---|---|---|
| `notes_create` | 116–188 | `kind` enum 삭제, `images` → `blocks`(D2) |
| `notes_create_link_preview` | 190–223 | 링크를 `serializeBlock` 결과로. 지금은 `[**title**](url)` 평문 조립(210행) |
| `notes_create_image` | 246–276 | 새 브리지 op 위로 재구현. 이름 유지 |
| `notes_create_audio` | 278–305 | 같음 |
| `notes_create_file` | 307–334 | 같음 |
| `notes_create_mindmap` | 336–351 | 삭제(D1) |

`mcp/scripts/smoke.ts`

- 43–50행: `kind:"link"`·`kind:"mindmap"` 호출 교체.
- 52–66행: `notes.createImage/Audio/File` 호출 교체.
- 67–69행: `notes.createMindmap` 호출 삭제.
- 70–79행 `kindsOk`: 전부 `kind === "text"` + 본문에 블록 문자열 포함 확인으로 교체.
- 93행 `boardAList.length === 9`: 카드 개수가 줄어든다. 새 값으로 고친다.

### 재사용할 것

- `web/src/state/blocks.ts` — `serializeBlock`, `normalizeLinkUrl`. 문법·이스케이프·스킴 검사의 유일한 출처.
- `web/src/state/attachmentLimits.ts` — `MAX_IMAGE_BYTES`(10MB), `MAX_ATTACHMENT_BYTES`(50MB), `SUPPORTED_IMAGE_TYPES`.
- `web/src/state/db/opfs.ts` — `putBlob`, `makeAttachmentFilename`. 브리지가 이미 쓴다.
- `web/src/components/workspace/canvasCapture.ts` — **패턴만** 참고. `storeImageBlock`(64–82), `storeFileBlock`(88–109)이 같은 일을 `File` + 토스트로 한다. 함수 자체는 재사용하지 않는다(§6).

### 왜 지금 고장인가

- 옛 카드 화면은 n10에서 삭제됐다. `cards/` 아래에 `board`·`comment`·`frame`·`text`만 남는다.
- `CardContent.tsx`의 `default`가 image·link·audio·file·mindmap을 `TextCardContent`로 떨군다. 그래서 link 카드는 `{"url":"..."}` JSON이 글자로 보인다.
- `markdownMigration.ts`의 `migratedContent`는 code·checklist·highlight만 다룬다. link·mindmap·image·audio·file은 `null`을 받아 kind가 그대로 남는다. 다른 보드에 저장한 뒤 나중에 열어도 열화 렌더다.

### 관련 스펙

[[FEAT-sticky-redesign]] · [[FEAT-memo-title]] · [[FEAT-memo-image-paste]] · [[FEAT-ai-pipeline]]
