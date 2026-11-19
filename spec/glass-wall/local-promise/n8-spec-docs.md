# n8-spec-docs — 로그인 필수를 전제한 옛 스펙에 폐기 줄을 단다 (T17 문서 부분)

> 자기완결 브리프. runner는 상위 spec과 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: general-purpose
**id**: LP-8
**상위**: spec/glass-wall/local-promise/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T17

## 문제

옛 스펙 두 개가 아직 "로그인해야 쓴다"고 적혀 있다.

FEAT-onboarding-routes는 로그인을 기본으로 정했고, 그 결정으로 FEAT-collab-auth의 "로그인 없이 혼자 쓰기"를 폐기했다. local-promise가 그 결정을 되돌린다. 문서를 그대로 두면 다음 사람이 로그인 게이트를 다시 넣는다.

## 목표

두 옛 스펙의 해당 결정과 수용 기준에 "local-promise로 폐기" 줄이 붙는다. FEAT-collab-auth AC-1은 다시 살아 있다고 적힌다.

## 담당 행 메모

| 행 | 이 노드가 맡는 부분 |
|---|---|
| T17 | FEAT-onboarding-routes의 D4·D5와 AC-4에 이 스펙으로 폐기됐다는 줄이 붙는다. 테스트 부분은 n1 몫이다 |

## 작업

1. `docs/specs/FEAT-onboarding-routes.md` 머리 요약 "moss는 로그인해야 쓴다"에 폐기 줄을 단다.
2. 같은 파일 D4의 로그인 분기, D5, AC-4에 각각 "⛔ 폐기 2026-10-11 — spec/glass-wall/local-promise, 로그인 없이 혼자 쓰기" 형식의 줄을 단다. D5-1 첫 보드 고르기는 first-wall 몫이라 "first-wall로 대체" 줄만 단다.
3. 같은 파일 "로그인 없이 혼자 쓰기 테스트를 로그인 주입으로 고친다" 줄과 "혼자 쓰는 보드 서버 백업은 로그인 필수라 다음 단계 후보" 줄에도 폐기 줄을 단다.
4. `docs/specs/FEAT-collab-auth.md` AC-1의 "⛔ 폐기" 표시 옆에 "2026-10-11 local-promise로 되살림"을 적는다. D8 "혼자 쓸 때는 로그인 없음"이 다시 유효하다고 적는다.
5. 본문은 지우지 않는다. 줄만 단다.

## 완료 기준

- [ ] `grep -c "local-promise" docs/specs/FEAT-onboarding-routes.md` 결과 4 이상
- [ ] `grep -c "local-promise" docs/specs/FEAT-collab-auth.md` 결과 2 이상
- [ ] `git diff --stat docs/specs` 에서 두 파일 모두 삭제 줄 수가 더한 줄 수보다 적다
- [ ] 코드 파일을 고치지 않았다. `git diff --name-only` 에 `web/` 경로가 없다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `docs/specs/FEAT-onboarding-routes.md` | 3행 요약, 46~50행 D4·D5, 71행 AC-4, 130행 테스트 줄, 165행 백업 줄 |
| `docs/specs/FEAT-collab-auth.md` | 49행 D8, 78행 AC-1 |

## 다른 티켓과 겹침

- first-wall도 FEAT-onboarding-routes D5-1을 대체한다. 이 노드는 D5-1에 "first-wall로 대체" 한 줄만 단다.
