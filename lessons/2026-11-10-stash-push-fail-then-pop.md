# 옛 코드를 볼 때 git stash를 쓰지 않는다

## 맥락

cmd-z-undo 웨이브 3 수정 서브에이전트가 고치기 전 코드를 보려고 `git stash push <경로>`를 불렀다. 경로 오류로 push가 실패했다. 이어진 `git stash pop`은 그대로 돌아 사용자의 옛 stash를 작업 트리에 풀었다. 그 stash는 다른 브랜치 `feat/card-clipboard`의 스펙 파일 6개였다.
서브에이전트가 풀린 6개를 `git rm`으로 걷어 냈다. stash@{0}은 목록에 그대로 남아 잃은 것은 없었다.

## 다음에 할 일

- 고치기 전 코드는 `git show <sha>:<경로>`나 그 커밋의 `git worktree add --detach`로 본다. 작업 트리를 stash로 비우지 않는다.
- 서브에이전트 브리프에 "git stash를 쓰지 않는다"를 적는다. 사용자의 stash가 쌓여 있는 레포에서는 pop 한 번이 남의 일을 푼다.
- 꼭 stash를 써야 하면 `git stash push … && … && git stash pop`처럼 앞 명령이 실패하면 멈추게 잇는다.

## 검증

이후 n5·n6 runner 브리프에 "git stash를 쓰지 않는다"를 넣었다. 리뷰 재현은 검토자 워크트리에서 돌렸다. stash 목록은 `stash@{0}: WIP on feat/card-clipboard: fe1c961` 하나 그대로다.

## 근거

- 수정 리포트 「사고 1건」 — 스크래치패드 `review/code-w3-fix.report.md`, 커밋 f2802c3을 만든 서브에이전트
- `spec/cmd-z-undo/n5-trash.md`·`spec/cmd-z-undo/n6-files.md` 구현 메모 — runner 브리프는 메인 프롬프트에 있다
