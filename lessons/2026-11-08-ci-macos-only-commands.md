# CI를 처음 붙일 때 macOS 실측을 Linux 통과로 옮겨 적지 않는다

## 맥락

2026-11-08 moss에 CI를 붙였다. spec은 macOS 실측으로 "mcp test 0"이라고 적었다. 증명 안 되는 전제에는 임베디드 Postgres만 올렸다. ubuntu 러너의 `mcp-checks`는 11초 만에 실패했다. `mcp/src/image.test.ts`가 macOS 전용 명령 `sips`로 시험 그림을 만들었기 때문이다. 적대 검토자 2명도 이 점을 못 찾았다.

## 다음에 할 일

- CI를 처음 붙이기 전에 테스트가 부르는 외부 명령을 찾는다. 예: `rg -n 'exec(File)?(Sync)?\(|spawn\(' <src>`.
- macOS에만 있는 명령이 나오면 그 테스트를 증명 안 되는 전제로 올린다. `sips`, `osascript`, `open`, `pbcopy`, `security`가 그 예다.
- 로컬에서 PATH를 줄여 Linux를 흉내 낸다. 예: `env PATH=<빈 폴더> $(which bun) test`.
- macOS 실측 표에는 "macOS에서"를 붙인다. Linux 통과로 옮겨 적지 않는다.

## 검증

`sips`를 뺀 PATH로 고치기 전 테스트를 돌려 같은 실패를 재현했다. 고친 뒤 `sips`가 있을 때와 없을 때 모두 12 pass·1 skip·0 fail이었다. PR #23에서 `mcp-checks`가 13초에 통과했다.

## 근거

- 바꾼 파일: `mcp/src/image.test.ts:86`
- 원천: `spec/moss-ci.md` 「증명 안 되는 전제」, PR #23 첫 CI 실행의 `mcp-checks` 실패 로그
