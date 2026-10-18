# n4-memo-lod — 메모를 줌 구간마다 다르게

> 자기완결 브리프. 상위 spec + 이 파일만 본다. `**상태**:` 줄은 손으로 고치지 않는다.

**agent**: runner
**id**: PZ-4
**상위**: spec/postit-group-zoom/spec.md
**deps**: n1, n2
**상태**: 끝남
**담당 행**: T4
**사람 확인**: 불필요

## 문제

- 50%에서 메모 제목이 7px, 25%면 4px가 되어 읽을 수도 알아볼 수도 없다.

## 목표

보통 구간: 제목이 화면 기준 10px 밑으로 안 작아진다. 멀리 구간: 제목 대신 회색 줄 두 개. 고치는 중이면 제목 그대로.

## 작업

1. `cards/text/Content.tsx`: 제목 감싸개에 `data-memo-front-title`, 그 뒤에 숨은 `data-memo-lines`.
2. `globals.css`: mid 글씨 `max(15px, 10px*inv)`, far 줄 표시.

## 완료 기준

- [x] spec 공통 완료 기준 전부
- [x] 메모 앞면에 줄 표시 요소가 있고 기본은 숨는다(테스트)
- [x] 기존 text 카드 테스트 통과

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/text/Content.tsx` | 메모 앞면 |
| `web/src/app/globals.css` | 구간 규칙 |

## 구현 메모

- 2026-10-18 커밋 7860979. 제목 감싸개 data-memo-front-title + 바로 뒤 data-memo-lines(형제 선택자). 멀리 구간에서 포커스 중이면 제목 유지. 형제 순서 테스트 추가. CSS 실제 적용은 n5 캡처로 본다.
