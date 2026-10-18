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
