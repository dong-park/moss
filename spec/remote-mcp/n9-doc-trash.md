# n9 — 문서 휴지통과 되살릴 수 있는 delete_note

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-9
**상위**: spec/remote-mcp/spec.md
**deps**: n6
**상태**: 아직 안 함
**담당 행**: T4
**사람 확인**: 불필요

## 문제

- web 휴지통은 Dexie에만 있어 Yjs 문서로 표현되지 않는다. 그래서 MCP delete_note는 메모를 문서에서 바로 지우고, 지운 메모를 되살릴 길이 없다.
- 공유 보드의 다른 멤버가 메모에 지시문을 심으면 에이전트가 그 글을 읽고 내 다른 보드 메모를 지울 수 있다(wave-20261018-2200 /review 보안 P1). 지운 것을 되살릴 수 있어야 피해가 한정된다.

## 목표

D10 → A. doc-model에 문서 휴지통(trash 맵: 메모 스냅샷·지운 시각·지운 주체(MCP 클라이언트 이름이면 그 이름)·함께 지운 연결선)을 둔다. MCP delete_note는 메모를 trash 맵으로 옮긴다. web 휴지통 패널이 Dexie 휴지통과 함께 이 맵도 보여 주고 되살린다. 되살리면 메모와 연결선이 원래 자리로 돌아오고 다른 기기·멤버 화면에도 반영된다. 비우기·보관 기간은 web 휴지통의 기존 규칙을 따른다.

## 선행 결정

D10, D6

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] MCP로 지운 메모가 web 휴지통에 보이고, 되살리면 다른 클라이언트(헤드리스 provider)에도 돌아온다 — 테스트
- [ ] trash 맵 필드가 doc-model 필드 목록에 있어 새로고침 뒤에도 남는다(누락 시 컴파일 에러 검사 유지)
- [ ] delete_note 설명에서 '휴지통에 가지 않는다'를 지우고 되살릴 수 있다고 적는다
- [ ] 새 로직 최소 1테스트

## 파일 포인터

shared/doc-model/src/index.ts, sync/src/mcpWriteTools.ts(delete_note), web 휴지통(web/src/state/ 아래 trash 관련, 휴지통 패널 컴포넌트), web/src/state/ydoc/

## 구현 메모
- 시작 (2026-10-18, 메인): n6 runner가 D10을 올리며 남긴 조사(web 휴지통이 Dexie 전용)를 n6 브리프 구현 메모에서 먼저 읽는다. 문서 크기 한도(10MB)를 trash 맵도 함께 쓰므로 delete_note가 쓰기 전 공간 확인을 거치게 한다.
