# n3-wall-badge — 오른쪽 위 배지와 공유 버튼 (T3, T12·T13 배지)

> 자기완결 브리프. runner는 상위 spec과 이 파일만 본다. 진행·상태는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다.

**agent**: runner
**id**: LP-3
**상위**: spec/glass-wall/local-promise/spec.md
**deps**: n2-share-state
**상태**: 아직 안 함
**담당 행**: T3, T12, T13

## 문제

지금 화면에는 이 벽이 어디 있는지 알려 주는 표시가 없다.

시안 01과 06은 오른쪽 위에 "🔒 이 기기에만" 배지를 둔다. 06은 그 옆에 "공유 ↗" 알약 버튼을 함께 둔다. 사용자는 이 배지로 내 생각이 이 기기에만 있는지 늘 확인한다.

## 목표

모든 벽의 오른쪽 위에 배지가 늘 보이고, 벽의 공유 상태에 따라 네 문구 중 하나를 보인다. 배지 옆에 "공유 ↗" 버튼이 늘 있다.

## 확정 결정

- D4 = A. 배지 옆에 "공유 ↗"를 늘 둔다.
- D5 = A. 로그아웃한 기기의 공유 벽은 "☁ 공유 중 · 로그인하면 맞춰요".
- D6 = A. 올리는 동안은 "올리는 중".

## 배지 문구

| 상태 (n2의 선택자 값) | 배지 |
|---|---|
| 이 기기에만 | 🔒 이 기기에만 |
| 올리는 중 | 올리는 중 |
| 공유 중 | ☁ 공유 중 |
| 공유 중이지만 로그아웃 | ☁ 공유 중 · 로그인하면 맞춰요 |

## 담당 행 메모

| 행 | 수용 기준 요약 |
|---|---|
| T3 | 혼자 쓰는 벽 A에서는 "🔒 이 기기에만", 공유한 벽 B로 옮기면 같은 자리에 "☁ 공유 중", 다시 A로 오면 돌아온다 |
| T12 | 로그아웃 뒤 혼자 쓰는 벽 배지는 "🔒 이 기기에만" |
| T13 | 공유 해제 뒤 배지가 "🔒 이 기기에만"으로 돌아온다 |

## 작업

1. 배지 컴포넌트를 새로 만든다. 상태는 n2의 선택자 하나만 읽는다. 모양은 시안의 흰 반투명 알약이다. 값은 `spec/glass-wall/mockups/gen.py`의 `.badge`를 따른다.
2. 배지 옆에 "공유 ↗" 검은 알약 버튼을 둔다. 공유 중인 벽에서는 이 버튼이 지금의 링크 복사·멤버 팝오버를 연다. 혼자 쓰는 벽에서 누르면 무엇을 할지는 n4가 붙인다. 이 노드는 누름을 밖으로 넘기는 자리만 만든다.
3. 지금의 공유 아이콘과 아바타 줄을 배지 묶음 안으로 옮긴다. 아바타 줄은 공유 중일 때만 보인다.
4. 첫 벽인 시스템 보드에도 배지는 보인다. 시스템 보드의 공유 버튼은 n5가 연다. 이 노드에서는 지금처럼 숨긴 채 둔다.
5. 같은 벽을 연 다른 탭에서 공유 상태가 바뀌면 배지도 바뀐다. 상태 저장소가 탭 사이를 맞추지 않으면 그것을 구현 메모에 남기고 n9가 확인하게 한다.
6. ko.json에 배지 키 네 개와 공유 버튼 키를 더한다. 키 후보는 `wall.badge.local`·`uploading`·`shared`·`sharedLoggedOut`, `wall.share.button`.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bun run test -- src/components/share` 통과
- [ ] 배지 테스트가 네 상태 각각의 문구를 확인한다
- [ ] 벽을 A에서 B로, 다시 A로 바꾸는 테스트가 문구 전환을 확인한다
- [ ] `cd web && bun scripts/check-i18n.mjs` exit 0
- [ ] 실경로: 배지가 실제 공유 저장소와 n2 선택자를 읽는다. 상태를 props로 꽂아 넣은 테스트만으로 끝내지 않는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/share/ShareControl.tsx` | 지금 공유 아이콘·아바타·팝오버 묶음 |
| `web/src/components/share/ShareControlMount.tsx` | 현재 벽에 붙이는 배선. 시스템 보드면 null |
| `web/src/components/share/SharePopover.tsx` | 공유 중일 때 쓰는 팝오버 |
| `web/src/components/share/MemberAvatar.tsx` | 아바타 줄 |
| `web/src/components/share/__tests__/ShareControlMount.test.tsx` | 고칠 테스트 |
| `web/src/state/share/store.ts` | n2가 더한 상태 선택자 |
| `web/src/i18n/messages/ko.json` | 문구 |
| `spec/glass-wall/mockups/01-main.png` | 배지만 보이는 시안 |
| `spec/glass-wall/mockups/06-share.png` | 배지와 공유 버튼 시안 |

## 다른 티켓과 겹침

- glass-surface가 유리벽 위 오른쪽 위 공간을 그린다. 배지 자리는 이 노드가 정한다. 겹치면 배지를 위에 둔다.
