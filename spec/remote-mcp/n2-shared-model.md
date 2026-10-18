# n2 — 공용 문서 모델 분리

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-2
**상위**: spec/remote-mcp/spec.md
**deps**: 없음
**상태**: 진행
**담당 행**: T3
**사람 확인**: 불필요

## 문제

- 문서 필드 목록이 두 벌이면 color·textSize·autoWidth 누락 사고가 되풀이된다(spec/collab-port.md).

## 목표

web/src/state/ydoc/model.ts의 맵 정의와 필드 목록을 공용 패키지로 옮기고 web·sync가 가져온다. 동작은 바꾸지 않는다.

## 선행 결정

없음

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] 담당 행의 Then이 실제로 보인다
- [ ] 새 로직 최소 1테스트

## 파일 포인터

web/src/state/ydoc/model.ts:118-130, sync/src/server.ts

## 구현 메모
- 병렬 경계 (2026-10-18, 메인): n1·n2·n3이 같은 워킹트리에서 동시에 돈다. server(Ktor)와 web/src/state/share/는 고치지 않는다(n1·n3 몫). sync/src/documentStore.ts·guardedStore.ts는 n1 몫이다. 커밋은 자기 파일만 지정해 add한다.
- 고쳐줘 (2026-10-18, 메인 · wave-20261018-1100 /review P1): web Docker 런타임 이미지에 shared/doc-model이 빠질 수 있다(bun file: 의존성이 링크면 /shared가 없음). docker compose build web sync를 실제로 돌리고, 런타임 컨테이너에서 web·sync가 shared 모듈을 읽고 뜨는지 확인한다(예: 컨테이너 시작 후 health 또는 node/bun으로 import 확인). 깨지면 Dockerfile을 고친다. Docker를 쓸 수 없으면 spec-board node review로 확인 대기에 두고 무엇을 못 돌렸는지 적는다.
- 병렬 경계 (2026-10-18, 메인 · 수정 웨이브): 고칠 파일은 web/Dockerfile·sync/Dockerfile·dockerignore·shared/doc-model 패키지 설정까지다. server와 web/src/state는 건드리지 않는다.
- 진행 메모 (2026-10-18, runner · Docker P1): 우려가 맞았다. web 이미지는 `bun install`이 node_modules/@moss/doc-model/package.json을 /shared를 가리키는 절대 심볼릭 링크로 만들어 (1) next build가 Turbopack "Invalid symlink"로 실패했고 (2) 런타임 이미지에는 /shared가 없었다. web/Dockerfile에서 설치 직후 링크 대신 shared/doc-model 실제 파일을 복사하도록 고쳤다. sync는 단일 스테이지라 /shared가 남아 링크가 유효해서 고치지 않았다. 확인(별도 프로젝트명 mossn2, 포트 3102·1334, 끝나고 정리): docker compose build web sync 성공, 런타임 컨테이너에서 web·sync 모두 @moss/doc-model import 성공, web / 200, sync 기동 로그와 / 200.
- 고쳐줘 (2026-10-18, 메인 · wave-20261018-1530 /review P2): web/.dockerignore가 없어 로컬 node_modules가 이미지 안의 shared 복사본을 덮을 수 있다. 저장소 루트 컨텍스트에 맞는 web용 dockerignore를 두고 docker compose build web을 다시 돌려 확인한다.
- 진행 메모 (2026-10-18, runner · dockerignore P2): 이미 있는 web/Dockerfile.dockerignore(커밋 73ff837)가 같은 일을 하고 있어 파일을 더하지 않았다. 컨텍스트가 저장소 루트라 BuildKit은 web/.dockerignore를 읽지 않고 <Dockerfile>.dockerignore(web/Dockerfile.dockerignore)나 루트 .dockerignore만 읽는다. 그래서 web/.dockerignore를 새로 두면 무시된다. 확인: shared/doc-model/node_modules와 web/node_modules에 감시용 파일(.leak-probe)을 심고 docker compose -p mossn2b build web 실행 → 이미지의 /app/node_modules/@moss/doc-model에는 package.json·src·test만 있고 node_modules·감시 파일 없음, bun에서 @moss/doc-model import 성공. 감시 파일·임시 이미지는 지웠다.
