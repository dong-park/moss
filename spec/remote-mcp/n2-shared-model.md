# n2 — 공용 문서 모델 분리

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-2
**상위**: spec/remote-mcp/spec.md
**deps**: 없음
**상태**: 아직 안 함
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
