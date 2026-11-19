# 첫 벽 — 처음 온 사람 앞에 빈 유리벽과 마카만 놓인다

| 항목 | 값 |
|---|---|
| 문제 | 처음 온 사람이 로그인과 보드 고르기를 넘어야 첫 생각을 쓸 수 있고, 빈 캔버스 앞에서 무엇을 할지 몰라 막힌다 |
| 상위 | spec/glass-wall/README.md |
| 상위문제 | 손으로 쓰고 붙이며 공간에 생각을 펼치고 싶은 사람에게 맞는 개인용 벽이 없다 — 화이트보드 도구는 팀용이라 과하고, 메모앱은 시각적이지 않고, 종이와 포스트잇은 흩어져 다시 못 찾는다 |
| 상태 | 진행 |
| 시작 | 2026-10-11 |
| ID 머리 | FW |
| 시안 | mockups/03-first-a.png, mockups/03-first-b.png |
| 우선순위 | P0 |

## 문제 — 첫 생각을 쓰기 전에 관문이 둘 있고, 넘어도 빈 화면에서 막힌다

지금 moss를 처음 열면 로그인 화면이 먼저 뜬다. 로그인하면 "첫 보드를 골라 주세요" 화면에서 예제와 빈 보드 중 하나를 또 골라야 한다. 그걸 넘으면 빈 캔버스가 나오는데, 무엇부터 할지 알려 주는 것이 없다. 리서치는 이 빈 캔버스 마비를 첫날 이탈 원인으로 꼽았다.

## 목표 — 열자마자 빈 유리벽이 서 있고, 첫 획이 곧 첫 생각이다

처음 온 사람은 아무것도 고르지 않고 바로 빈 유리벽과 마카 트레이를 본다. 벽에는 힌트 한 줄만 있다: "마카를 집거나, 아무 데나 두 번 눌러 포스트잇". 첫 마카 획이나 첫 포스트잇이 그대로 저장되고, 제목이나 폴더나 태그를 묻지 않는다.

## 비목표 — 로그인과 저장 약속, 벽 재질, 마카 자체는 다른 티켓 몫이다

- **로그인 없이 쓰기와 "🔒 이 기기에만" 배지.** local-promise 몫이다. 이 티켓은 그 위에서 첫 화면을 고친다.
- **유리 재질과 빛.** glass-surface 몫이다. 이 티켓은 빈 벽이 뜨는 순간까지만 다룬다.
- **마카 트레이와 획의 모양.** wall-marker와 marker-feel 몫이다. 이 티켓은 "첫 획이 생기면 힌트가 사라진다"까지만 본다.
- **포스트잇의 붙는 손맛.** sticky-handfeel 몫이다.
- **휴대폰 첫 진입.** phone-to-wall 몫이다. 휴대폰에서는 마카가 없어 힌트가 맞지 않는다.
- **둘러보기 투어, 튜토리얼, 예제 벽.** 만들지 않는다. 힌트 한 줄이 전부다.

## 성공 기준 — 행 파일이 곧 성공 기준이다

행 파일이 곧 성공 기준이다.

## 경계 조건 — 새 사용자, 옛 사용자, 저장소 실패 세 갈래를 다 본다

- 처음 온 사람은 벽이 하나뿐이고 비어 있다.
- 예전 흐름으로 로그인했지만 보드를 고르지 않은 사람도 보드 고르기 화면을 다시 보지 않는다. 그 사람 벽에 이미 있던 예제 메모는 지우지 않는다.
- 시스템 보드에 메모를 쌓아 온 옛 사용자는 바뀐 것을 느끼지 못한다. 마지막 벽이 그대로 열린다.
- 이 브라우저에 저장할 수 없으면 빈 흰 화면 대신 안내 한 줄과 다시 시도 버튼을 보여 준다.
- 두 번 눌러 만든 포스트잇에 아무것도 안 쓰고 벗어나도 그 포스트잇은 빈 채로 벽에 남는다.
- 마카를 든 채 두 번 누르면 포스트잇이 생기지 않는다. 마카 점으로 남는다.
- 다른 탭에서 같은 첫 벽을 동시에 열어도 벽이 둘로 갈라지지 않는다.

## 기술 결정 — 첫 벽은 이미 있는 기본 보드를 쓴다

- **첫 벽 = 기존 시스템 보드.** 누구에게나 이미 있는 보드라 새 보드를 만드는 단계가 없다. 그래서 보드 고르기 화면도 필요 없다. D3=A로 확정했다.
- **첫 실행 예제 메모를 심지 않는다.** 시안은 빈 벽이다. 예제는 빈 벽의 마비를 덮어 줄 뿐, 첫 생각을 대신 써 버린다.
- **힌트는 벽이 비어 있는지만 보고 띄운다.** 따로 "봤음" 표시를 저장하지 않으니 기기를 옮겨도 어긋나지 않는다.

## 확인 안 된 것 — 키보드만 쓰는 사람의 첫 포스트잇

- 두 번 누르기를 못 하는 키보드 사용자에게 첫 포스트잇을 여는 길은 아직 정하지 않았다. 지금 Dock에 있는 새 메모 버튼이 유리벽에서도 남는지에 달렸다. glass-surface와 wall-marker가 Dock의 운명을 정하면 다시 본다.
- 첫 벽 화면이 뜨기까지 걸리는 시간 목표는 정하지 않았다. 지금 시간을 재 본 기록이 없다.

## 공통 완료 기준 — 타입·테스트·린트·i18n 검사가 모두 통과한다

1. `cd web && bunx tsc --noEmit` 오류 0.
2. 노드 브리프에 적은 `bunx vitest run …` 통과. 전체 스위트를 돌렸다면 알려진 플래키 2종은 단독 재실행으로 가린다 — `Canvas.virtualization.test.tsx`, `useShortcuts.test.tsx`.
3. `cd web && bunx eslint <고친 파일>` 새 오류 0. 기존 오류 `ExportModal.tsx:39`는 세지 않는다.
4. `cd web && bun scripts/check-i18n.mjs` exit 0.
5. 새 로직마다 테스트가 1개 이상 있다. 커밋은 Conventional Commits.
6. 실경로 검증: stub이나 상태 직접 주입으로만 통과했으면 그 갭을 노드 구현 메모에 적는다.

## DAG — 여섯 노드, 가장 긴 줄은 셋

```
n1-first-run ──┬──> n2-wall-name ──────┐
               └──> n5-storage-failure ─┤
n3-empty-hint ──────────────────────────┼──> n6-browser-check
n4-dblclick-sticky ─────────────────────┘
```

가장 긴 줄은 n1 → n2 → n6, 노드 셋이다. n1·n3·n4는 동시에 뜬다.

### 선이 있는 이유

- n1 → n2: n2의 이름 테스트가 n1이 바꾼 첫 실행 결과를 쓴다. 벽 1개·메모 0장인 그 벽의 이름을 본다.
- n1 → n5: n5는 n1이 고친 `RootBoardRedirect`와 첫 실행 흐름 위에 실패 분기를 얹는다.
- n1·n2·n3·n4·n5 → n6: n6은 앞 다섯 노드의 결과를 실브라우저에서 시안과 대조한다.
- n3과 n4는 둘 다 `Canvas.tsx`를 고치지만 영역이 다르다. 그래서 선을 긋지 않았다.

### 행과 노드 짝

| 행·결정 | 노드 |
|---|---|
| T1 | n1 라우팅, n3 빈 벽 화면, n6 눈 확인 |
| T2 | n3, n6 |
| T3 | n3 힌트 조건, n6 — 선행 wall-marker |
| T4 | n4, n6 |
| T5 | n1, n6 |
| T6 | n4, n6 |
| T7 · T8 · T10 | n1 |
| T9 | n5 |
| T11 | n1 개수, n2 이름 |
| D1 · D2 · D3 | n1 |
| D4 | n2 |
| D5 · D8 | n3 |
| D6 · D7 | n4 |

### 다른 티켓에 걸린 선행

- local-promise 로그인 게이트 철거: n1 테스트와 n6의 T1 판정.
- wall-marker 벽 획 저장과 마카 트레이: n3의 획 개수 연결과 n6의 T3 판정.
- glass-surface 유리 배경: n6의 바탕 재질 판정.

## 노드 인덱스

| ID | 브리프 | deps | 상태 |
|---|---|---|---|
| n1 | [n1-first-run.md](n1-first-run.md) | — | 아직 안 함 |
| n2 | [n2-wall-name.md](n2-wall-name.md) | n1 | 아직 안 함 |
| n3 | [n3-empty-hint.md](n3-empty-hint.md) | — | 아직 안 함 |
| n4 | [n4-dblclick-sticky.md](n4-dblclick-sticky.md) | — | 아직 안 함 |
| n5 | [n5-storage-failure.md](n5-storage-failure.md) | n1 | 아직 안 함 |
| n6 | [n6-browser-check.md](n6-browser-check.md) | n1, n2, n3, n4, n5 | 아직 안 함 |

## 파킹 / 보류 로그

| 날짜 | 노드 | 사유 |
|---|---|---|
| | | |

## 구현 메모

- 지금 흐름: `app/page.tsx` → `WorkspaceShell` 로그인 게이트 → `RootBoardRedirect`(`WorkspaceShell.tsx` 110~133행) → `needsFirstBoard(boards, cards)`가 참이면 `FirstBoardChooser`.
- `needsFirstBoard`는 `state/workspace.ts` 1149행. 사용자 보드가 없고 카드가 전부 `SEED_CARDS` id일 때 참이다.
- `SEED_CARDS`는 `state/workspace.ts` 1108행. id `seed-todo`·`seed-preview`·`seed-empty`. 첫 실행 시드는 2045~2062행, `installPromptShown` 설정으로 한 번만 심는다.
- `createExampleBoard`는 2191행, `FirstBoardChooser`만 부른다. `createBoardFromTemplate`(템플릿 선택)는 별개 경로라 남긴다.
- 지울 i18n 키: `ko.json` 568행 `onboarding.firstBoard.*`. 다른 언어 파일도 같은 키.
- 빈 시스템 보드 안내: `cards/SystemBoardEmpty.tsx`, 문구 `workspace.system.empty.*` "조금 더 머무르면 패턴이 보일 거예요". README의 remove-ai 메모는 SystemBoardEmpty를 남긴다고 적었다. 이 티켓이 내용을 힌트 한 줄로 갈아 끼우면 remove-ai와 충돌하지 않는다 — 컴포넌트 자리는 남고 문구만 바뀐다.
- 빈 캔버스 두 번 누르기는 지금 아무 동작이 없다. `onDoubleClick`은 `DraggableCard.tsx` 959행과 `BoardPicker.tsx`에만 있다. 생성 함수는 `Canvas.tsx`가 쓰는 `addCardAt("text", wx, wy)`를 재사용한다. 화면→월드 좌표 변환은 `Canvas.tsx` 562~565행과 같다.
- 빈 메모 정리: 빈 textbox는 불러올 때 지우는 규칙이 있다(`state/workspace.ts` 2064행 근처, FEAT-text-tool). 두 번 눌러 만든 포스트잇은 `text` 카드라 이 규칙에 걸리지 않게 둔다 — D6 B, sticky-handfeel D6과 같은 답.
- 뒤집힌 결정: D6을 "빈 포스트잇은 지운다"로 추천했다가 "남긴다"로 바꿨다 — 사용자 결정. 자리만 잡아 둔 종이도 생각의 흔적이다.
- 로그인 게이트 철거는 local-promise가 한다. FEAT-onboarding-routes D5·D5-1을 이 티켓과 local-promise가 함께 뒤집는다. D5-1(첫 보드 고르기)은 이 티켓, D5(로그인 필수)는 local-promise.
- 기존 테스트: `components/workspace/__tests__/FirstBoardChooser.test.tsx`는 D1에 따라 지운다. `needsFirstBoard`를 쓰는 테스트도 함께 찾는다.
- 시안 하단 왼쪽 회색 라벨("로그인 없음 · 보드 고르기 없음…", "첫 획이 곧 첫 생각…")은 시안 설명이지 화면 요소가 아니다.
- 노드 분해: n2가 시스템 보드 이름 바꾸기를 연다. D4를 정할 때 "나중에 바꿀 수 있다"를 전제했는데, 지금 시스템 보드는 이름을 못 바꾼다.
- 같은 파일을 고치는 노드: `ko.json`은 n1·n2·n3·n5, `Canvas.tsx`는 n3·n4, `workspace.ts`는 n1·n2·n4. 영역이 겹치지 않는다. Edit 충돌이 나면 다시 읽고 고친다.
