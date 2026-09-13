# n4-memo-window — 메모 창 안의 링크·녹음·파일 블록

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n2-blocks (parseBlock·serializeBlock)
**상태**: done

## 문제

"겉은 포스트잇, 안은 문서"의 안쪽이 아직 글과 펜뿐이다. 녹음·파일·링크를 따로 카드로 만들던 기능이 메모 창 안으로 들어와야 한다.

## 목표

메모 창(MemoExpandDialog)에 블록 추가 메뉴(이미지·링크·녹음·파일)가 있고, 넣은 블록이 창 안에서 보이고 재생·열린다. 새로고침 후 그대로다. NodeView는 읽기 전용 모드도 지원해 n5가 앞면에 재사용한다.

## 작업

1. `web/src/components/workspace/cards/_shared/editor/extensions.ts`의 `editorPlugins[]` seam에 `opfsImagePlugin` 옆으로 링크·녹음·파일 NodeView 플러그인 추가. 블록 인식은 n2 `parseBlock`(문단 단독일 때만).
   - 링크: 제목 + 도메인, 클릭 시 새 탭. 미리보기 실패하면 URL만(spec §4).
   - 녹음: `web/src/components/workspace/cards/audio/Content.tsx`의 MediaRecorder·mimeType 선택 로직을 이식해 녹음/정지/재생. 바이트는 OPFS. 마이크 권한 없으면 블록 넣지 않고 토스트.
   - 파일: 파일명·크기·열기(Blob URL). OPFS에 없으면 "파일을 찾을 수 없음" 자리표시, 본문 참조 유지.
   - 각 NodeView에 `readonly` 모드(재생·열기 요소 숨김, 흐린 색) prop. 링크·녹음·파일 블록은 **고정 높이 한 줄 막대**이고, readonly 여부와 무관하게 박스 크기가 같아야 한다(n5 앞면이 이 모드를 쓰며 펜 좌표 1:1이 걸려 있음 — spec §11 /hate 반영). 이미지는 본문 칸 폭.
2. `web/src/components/workspace/cards/MemoExpandDialog.tsx` 헤더에 블록 추가 메뉴(4항목). 커서 위치에 `serializeBlock` 결과 문단 삽입. 파일·녹음 50MB, 이미지는 FEAT-memo-image-paste 한도(10MB) — 넘으면 토스트.
3. 카드와 창의 NodeView 높이가 같아야 펜 overlay 좌표가 맞는다 — `MEMO_CONTENT_WIDTH` 컬럼 1:1 규칙 유지(파일 상단 주석 참고).
4. 새 글자는 `web/src/i18n/messages/ko.json` 키로.
5. 테스트: `web/src/components/workspace/cards/__tests__/MemoBlocks.test.tsx` — 메뉴 4항목, 링크 삽입 후 본문 마크다운에 `"moss-link"` 블록, 녹음 블록 렌더(MediaRecorder 모킹 허용하되 실경로 갭 기록), 권한 거부 토스트, readonly 모드에서 재생 버튼 없음.

## 완료 기준

- [x] plan 공통 완료 기준 전부(`tsc` 통과, `vitest run` 전체 — 기준선 7개 실패만 유지, 새 실패 0, `check-i18n.mjs` exit 0, eslint 0)
- [x] `cd web && npx vitest run src/components/workspace/cards/__tests__/MemoBlocks.test.tsx` 통과(15/15)
- [x] spec AC-9: 메뉴 4항목, 링크 삽입→닫으면 링크 개수 +1(본문 `countBlocks`로 확인 — n2 own test + n4 구조 판정 테스트), 새로고침 후 블록 유지(링크로 실경로 확인)
  - 녹음 삽입·재생: 단위/구조 테스트는 통과(재생 버튼·readonly 테스트). 실브라우저 마이크 권한 플로우는 아래 갭 참고.
- [x] 실경로: `cd web && npx next dev -p 3104` 후 pharos in-pane 브라우저로 메모 창을 열어 링크 블록 1개를 추가하고 페이지를 새로고침해 유지되는 것을 확인(스크린샷 `/tmp/shot4.png`, `/tmp/shot5.png` — 새로고침 전/후 동일). 이 과정에서 실제 버그(아래 갭 1) 하나를 발견·수정했다.
  - 녹음·파일 블록의 dev 서버 실경로 확인은 못했다(파일 피커·마이크 권한 다이얼로그는 pharos 브라우저 CLI로 스크립트할 수 없음 — `browser eval`은 이 워크트리 샌드박스가 무조건 차단, `fill`은 file input에 값 주입 불가, `dblclick`/`hover`는 "not supported"). 링크 블록으로 메뉴→serializeBlock→파서→문서교체→데코레이션→영속 전체 경로가 검증됐고 파일·녹음은 같은 경로(putBlob→serializeBlock→appendMarkdown)를 공유하므로 구조적 위험은 낮다고 판단했지만, 사람이 dev 서버에서 파일 선택·마이크 허용까지 한 번 눌러보는 것을 권한다.

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

**아키텍처 선택**: 링크·녹음·파일은 commonmark 스키마에서 "문단 + link 마크"로만 존재하고(별도 노드 타입 없음) 이미지처럼 실제 스키마 노드가 아니라, NodeView 대신 `wikilink.ts`와 같은 데코레이션 패턴(`_shared/editor/blockView.ts`)을 썼다 — 문단이 텍스트 자식 1개 + link 마크 하나로만 이루어져 있고(`문단 단독`) `mark.attrs.title`이 `moss-link`/`moss-audio`/`moss-file` 중 하나일 때만 블록으로 인식해 원문을 숨기고 위젯을 그린다. 링크는 추가로 `normalizeLinkUrl(href)===href`(n2와 동일 검증자)일 때만 블록 — 아니면 그냥 링크 텍스트로 남아 저장형 XSS를 막는다(n2 재심사 P1과 동일 기준).

블록 추가 메뉴(`BlockMenu.tsx`)는 헤더(`MemoExpandDialog`)에 두되, `useInstance()`로 본문과 같은 Milkdown 인스턴스를 잡아야 해서 `MilkdownProvider`를 `MemoExpandDialog`의 `Dialog.Content` 레벨로 끌어올렸다(기존에는 `ExpandedMarkdownEditor` 내부에 있었음 — 이 컴포넌트는 여기서만 쓰이므로 안전). 삽입은 커서 위치가 아니라 "문서를 마크다운으로 직렬화 → `serializeBlock` 결과를 빈 줄로 구분해 덧붙임 → 전체 재파싱해 문서 교체"다(entire-doc replace, `@milkdown/utils`의 `replaceAll`과 동일 원리를 한 액션에 합침).

**갭 1(실경로에서 발견·수정)**: 처음엔 `current + "\n" + markdown`으로 이어붙였는데, commonmark에서 단일 `"\n"`은 같은 문단 안 줄바꿈(soft break)일 뿐이라 새 문단이 안 만들어지고 기존 텍스트에 인라인으로 섞였다(블록으로 인식되지 않음). 빈 줄(`"\n\n"`)로 고쳐 해결 — dev 서버 실경로 확인 없이는 vitest 목만으로 잡지 못했을 버그.

**갭 2(남은 것)**: 커서 위치가 아니라 "문서 끝에 새 문단으로 추가"다 — 브리프의 "커서 위치에 삽입"과 다르다. `replaceAll` 방식(전체 교체)이라 커서를 정확한 위치에 유지한 채 삽입하려면 별도 트랜잭션 매핑이 필요한데, n4 범위에서는 생략했다. 사용자는 삽입 후 커서가 문서 처음으로 이동한 것처럼 보일 수 있다 — n10 마무리나 후속 다듬기에서 재검토.

**갭 3**: 오디오/파일 blob URL 캐시(`blockView.ts`의 `blobUrlCache`)는 세션 동안 revoke하지 않는다. `OpfsImageNodeView`처럼 destroy 훅에서 회수하지 않는데, 위젯이 데코레이션 재생성 때마다 안정적으로 재사용되는지 보장이 약해 회수 시점을 안전하게 잡기 어려웠다. 세션 중 다량의 첨부를 열면 누적 leak 가능성 있음.

**실경로 검증**: `npx next dev -p 3104` + pharos in-pane 브라우저(claude-in-chrome은 이 서브에이전트 툴셋에 없어 pharos로 대체)로 메모 창을 열어 "블록 추가 → 링크"로 `https://moss.example/docs`를 넣었다. 처음엔 위 갭 1 버그로 인라인 텍스트로 섞였고, 고친 뒤 재확인하니 별도 박스(🔗 모스 문서 · moss.example)로 렌더됐다. 페이지를 새로고침(`navigate`)한 뒤 다시 열어도 블록이 그대로 유지됨을 확인했다(스크린샷: `/tmp/shot4.png` 삽입 직후, `/tmp/shot5.png` 새로고침 후 — 로컬 임시 경로라 이 세션 밖에서는 사라짐, 필요하면 재현 가능).
녹음·파일은 pharos 브라우저 CLI가 파일 피커에 값을 못 넣고(`fill`은 `<input type=file>`에서 브라우저가 차단) `browser eval`은 이 워크트리 샌드박스가 "git 격리" 오탐으로 항상 거부해 스크립트로 마이크 권한을 우회할 수 없었다 — 수동 확인을 권한다(위 완료 기준 항목 참고).
