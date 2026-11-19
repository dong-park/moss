# n6-link-preview-optin — 혼자 쓰는 벽의 링크 미리보기는 누를 때만 (D1)

> 자기완결 브리프. runner는 상위 spec과 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: LP-6
**상위**: spec/glass-wall/local-promise/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T2, T16

## 문제

혼자 쓰는 벽에 링크를 붙이면 그 주소가 저절로 moss 서버를 거친다.

링크 메모를 만들거나 주소를 붙여 넣으면 미리보기 제목을 가져오려고 서버에 주소를 보낸다. 배지가 "🔒 이 기기에만"이라고 하는데 이 요청이 몰래 나가면 약속이 거짓이 된다.

## 목표

공유하지 않은 벽에서는 링크 미리보기를 저절로 가져오지 않는다. 링크 메모에 "미리보기 가져오기" 버튼이 있고, 누를 때만 그 주소가 서버를 거친다. 공유한 벽은 지금처럼 저절로 가져온다.

## 확정 결정

- D1 = A. 혼자 쓰는 벽에서는 "미리보기 가져오기"를 눌렀을 때만 서버를 거친다. 버튼 옆에 "주소만 moss 서버를 거쳐요"를 보인다.

## 담당 행 메모

T2와 T16의 전제다. 이 노드가 끝나야 공유하지 않은 벽의 서버 요청이 0건이 된다.

## 작업

1. 링크 메모를 만들 때와 주소를 채울 때 미리보기를 가져오는 곳 두 군데를 찾는다. 현재 벽이 공유 중이 아니면 가져오지 않는다.
2. 미리보기 제목이 없는 링크 메모에 "미리보기 가져오기" 버튼과 "주소만 moss 서버를 거쳐요" 한 줄을 보인다. 공유 중인 벽에서는 보이지 않는다.
3. 버튼을 누르면 지금의 미리보기 함수를 그대로 부른다. 그사이 사용자가 내용을 고쳤으면 덮어쓰지 않는 지금 규칙을 지킨다.
4. MCP 브리지의 미리보기 경로는 로컬 개발 플래그가 켜졌을 때만 동작한다. 손대지 않는다.
5. ko.json에 버튼과 안내 키를 더한다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bun run test -- src/components/workspace/__tests__ src/state/__tests__` 중 링크 관련 테스트 통과. 링크 메모 테스트 파일이 없으면 새로 만든다
- [ ] 테스트: 공유하지 않은 벽에서 링크 메모를 만들면 `fetch`가 0번 불린다
- [ ] 테스트: 버튼을 누르면 `/api/preview`가 1번 불리고 제목이 채워진다
- [ ] 테스트: 공유 중인 벽에서는 버튼 없이 저절로 1번 불린다
- [ ] `cd web && bun scripts/check-i18n.mjs` exit 0
- [ ] 실경로: 테스트가 실제 링크 메모 생성 함수를 부른다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/linkMemo.ts` | `createLinkMemo`·`fillLinkMemo`. 38행에서 미리보기를 부른다 |
| `web/src/state/cardContent.ts` | 152행 `fetchLinkPreview()` |
| `web/src/components/workspace/Canvas.tsx` | 281행 주소 붙여넣기 |
| `web/src/components/workspace/cards/text/LinkInputFace.tsx` | 링크 입력 화면 |
| `web/src/components/workspace/cards/text/face.ts` | 메모 앞면. 링크 블록을 그리는 곳은 미확인 — 여기와 `cards/_shared/editor/`에서 찾는다 |
| `web/src/state/share/store.ts` | 현재 벽 공유 상태 `byBoard[id].status` |
| `web/src/state/bridge/mossBridge.ts` | 439행 브리지 미리보기. 손대지 않는다 |
| `web/src/app/api/preview/route.ts` | 서버 쪽. 손대지 않는다 |

## 다른 티켓과 겹침

- remove-ai가 같은 시기에 `Canvas.tsx`를 고칠 수 있다. 이 노드는 281행 근처만 손댄다.
