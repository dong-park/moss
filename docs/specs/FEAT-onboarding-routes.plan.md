# FEAT-onboarding-routes — 실행 계획 (DAG)

> 원천 spec은 `docs/specs/FEAT-onboarding-routes.md`. 노드 브리프는 이 문서 아래 절에 있다. 실행: `/go docs/specs/FEAT-onboarding-routes.md` + 노드 ID. deps 없는 노드는 병렬.

## 공통 완료 기준

1. `cd web && bun run test && bunx tsc --noEmit && bun run lint` 통과
2. 새 로직마다 테스트 최소 1개, Conventional Commits `feat(moss): …`
3. 실경로 검증: stub·직접 주입으로만 green이면 결산에 갭으로 기록
4. 노드마다 브랜치 하나, PR 하나. 쌓인 PR은 base를 재지정한 뒤 브랜치를 지운다

## DAG

```
n1 system-board-uuid ─► n3 board-routes ─┬─► n4 first-board ────┬─► n6 prove
                                          └─► n5 missing-shared ─┘
n2 auth-gate ─────────────────────────────┴─► n4, n5
```

진입점 2개: n1, n2. 첫 물결은 n1·n2 병렬. 둘째 물결은 n3. 셋째 물결은 n4·n5 병렬. critical path n1→n3→n5→n6, 길이 4 < 노드 6.

## edge 사유

- n1→n3: 주소 `/b/[id]`가 시스템 보드의 UUID를 쓴다. 둘 다 `workspace.ts`를 크게 고쳐 병렬이면 충돌한다
- n2→n4: 첫 보드 고르기는 로그인 직후에 뜬다
- n3→n4: 고른 보드의 `/b/<uuid>`로 이동한다
- n2→n5: 공유 보드 멤버십 확인에 로그인 세션이 필요하다
- n3→n5: 없는 보드·권한 없음 카드는 `/b/[id]` 페이지 안에서 뜬다
- n4→n6, n5→n6: 실환경 검증은 전 흐름이 붙은 뒤에 한다

## 커버리지

| 요구 | 노드 |
|---|---|
| D3, AC-7 | n1 |
| D5·D5-2·D5-3, AC-4, AC-15 | n2 |
| D1·D2·D4·D8, AC-1·2·3·6·12 | n3 |
| D5-1, AC-5 | n4 |
| D6·D7, AC-8·9·10·11·13 | n5 |
| AC-14, 스펙 문서 갱신 | n6 |

## 진행

통합 브랜치 `feat/onboarding-routes`, 워크트리 `/Users/donghwan/poc-wt/onb-main`. 노드 브랜치는 여기서 갈라지고 여기로 병합한다. 끝에 PR 하나로 올린다.

## 노드 인덱스

| ID | 이름 | deps | 크기 | 상태 |
|---|---|---|---|---|
| n1 | system-board-uuid | — | L | 완료 d115072 |
| n2 | auth-gate | — | M | 완료 aa61cbd |
| n3 | board-routes | n1 | M | 완료 da5d8e7 |
| n4 | first-board | n2, n3 | S | 대기 |
| n5 | missing-shared | n2, n3 | M | 대기 |
| n6 | prove | n4, n5 | S | 대기 |

## n1 · system-board-uuid

시스템 보드를 UUID id를 가진 평범한 보드 행으로 바꾼다.

- `SYSTEM_BOARD_ID = "system"` 상수를 지운다. 참조 13개 파일은 `boards.isSystem` 조회나 `settings.systemBoardId`로 바꾼다
- `storageBoardId()`의 null 매핑을 없앤다. `boardId === null` 분기 15곳을 고친다
- 이전 함수: 기존 Dexie→Yjs 이전 뒤에 이어 돈다. UUID 발급, boards 행 저장, notes·connections의 boardId=null을 새 id로, Yjs 문서 키 이전. `settings.systemBoardMigratedAt`으로 한 번만 돈다. 중간에 끊겨도 다시 돌면 같은 결과다
- `mossBridge.ts`, 내보내기, 가져오기가 id로 찾게 한다. 옛 번들의 boardId=null은 시스템 보드 UUID로 바꾼다
- 테스트: 이전 전후 메모 수·내용 동일, 두 번 돌려도 중복 없음, 이전 중단 후 재실행
- 끝: AC-7 이전 부분

## n2 · auth-gate

로그인하지 않으면 워크스페이스를 렌더하지 않고 로그인 온보딩을 보여 준다.

- 온보딩 화면: 소개 한 줄, 기능 3개, 기존 `GoogleButton`. 캔버스 배경 위 가운데 카드
- 게이트는 `AuthBootstrap`이 세션 복원을 끝낸 뒤 판정한다. 판정 전에는 빈 화면이다. 원래 주소는 `?next=`로 넘기고 로그인 뒤 돌아간다
- D5-3: 한 번 로그인한 기기는 오프라인에서 세션이 만료돼도 워크스페이스를 연다. 온라인 복귀 시 기존 `SessionExpiredCard`가 뜬다
- D5-2: 로컬 데이터 주인 계정을 `settings.ownerUserId`에 기록한다. 다른 계정 로그인 시 안내 카드
- 로그인 없이 혼자 쓰기를 검사하던 기존 테스트는 로그인 상태를 주입하도록 고친다
- 끝: AC-4, AC-15, AC-13 오프라인 세션 부분

## n3 · board-routes

URL을 보드 전환의 원본으로 만든다.

- `app/b/[boardId]/page.tsx` 추가. 지금 `app/page.tsx`의 워크스페이스 본문을 컴포넌트로 뽑아 여기서 렌더한다. effect가 `params.boardId`로 `setCurrentBoard`를 부른다
- `app/page.tsx`는 갈림길만 남긴다. 마지막 연 보드로 replace
- `setCurrentBoard` 호출부를 `router.push`로 바꾼다. createBoard, toggleSystemBoard, 함 카드 진입, Breadcrumb, MCP 브리지가 들어간다
- `createBoard`는 `crypto.randomUUID()` id를 만들고 id만 돌려준다. 전환은 호출부가 push한다
- 같은 보드로 push하면 history를 쌓지 않는다. migrationPending 중 진입은 이전이 끝난 뒤 연다
- 끝: AC-1·2·3·6·12

## n4 · first-board

로그인했는데 보드가 없으면 첫 보드를 고르게 한다.

- "예제로 시작": 예제 메모 3장이 든 보드를 만들고 `/b/<uuid>`로 이동
- "빈 보드로 시작": 빈 보드를 만들고 이동
- 시스템 보드만 있고 사용자 보드가 없는 기존 사용자는 이 화면을 보지 않는다
- 끝: AC-5

## n5 · missing-shared

로컬에 없는 보드 주소를 처리한다.

- 로그인 상태면 서버에 멤버십을 묻는다. 멤버면 공유 보드를 받아 연다
- 멤버가 아니거나 서버에도 없으면 "이 보드를 볼 수 없어요" 카드. 존재 여부는 구분하지 않는다
- 로컬 보드가 휴지통에 있거나 지워졌으면 "찾을 수 없는 보드예요" 카드와 "마지막 보드로" 버튼
- 오프라인에 로컬에 없는 보드면 "연결되면 다시 시도할게요"
- 초대 수락(`InviteRoute`) 뒤 `/b/[boardId]`로 replace
- 카드는 `SessionExpiredCard`와 같은 틀
- 끝: AC-8·9·10·11·13

## n6 · prove

- Playwright로 AC-1·3·4·6·7·9·10·11을 실환경에서 돌린다. 로컬 docker compose + Next dev
- AC-14 전체 회귀
- `FEAT-collab-auth.md` AC-1을 폐기로 표시한다. `FEAT-home.md`의 시스템 보드 id 서술을 고친다
- 스펙 Status를 갱신한다
