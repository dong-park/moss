# n8 — 실제 커넥터 연결 확인

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-8
**상위**: spec/remote-mcp/spec.md
**deps**: n6, n7
**상태**: 아직 안 함
**담당 행**: T11
**사람 확인**: 필요

## 문제

- 단위 테스트와 가짜 클라이언트는 실제 연결 증거가 아니다.

## 목표

배포된 환경에서 Claude 커넥터를 추가해 읽기·쓰기·해제를 확인하고 캡처를 근거로 남긴다. ChatGPT와 Cursor도 같은 순서로 시도하고 안 되는 것은 확인 불가로 적는다. 기존 mcp/ 처리는 D5를 따른다.

## 선행 결정

D5

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] 담당 행의 Then이 실제로 보인다
- [ ] 새 로직 최소 1테스트

## 파일 포인터

spec/remote-mcp/evidence/n8

## 구현 메모
