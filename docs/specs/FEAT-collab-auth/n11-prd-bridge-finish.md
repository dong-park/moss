# n11-prd-bridge-finish — PRD 수정과 브리지 회귀

> 자기완결 브리프. runner는 `docs/specs/FEAT-collab-auth.md`와 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n7
**상태**: pending

## 문제

PRD가 협업을 제외하고 Supabase를 가정한다. MCP 브리지는 Yjs 이전 뒤에도 같은 응답을 내야 한다.

## 목표

PRD 3곳이 결정과 맞고, 브리지 명령이 공유 보드에서도 같은 형식으로 동작한다.

## 작업

1. PRD §4-2·§34-2의 협업 제외 삭제, §23·§1026을 '공유 보드는 서버 평문'으로, §1287 Supabase를 Ktor로.
2. `mcp/` 브리지 테스트를 돌리고, 공유 보드에서 `notes.create`가 다른 참여자에게 1초 안에 보이는지 확인한다.
3. FEAT-collab-auth Status를 갱신한다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd mcp && bun test` 통과
- [ ] AC-16: 공유 보드에 브리지로 만든 메모가 1초 안에 다른 참여자에게 보임
- [ ] `grep -n '팀 협업' PRD.md` 결과에 '제외' 문맥이 없음
- [ ] 실경로: 관통이 프로덕션 경로를 탐. 우회 green이면 갭 기록

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `PRD.md` | 수정 대상 |
| `mcp/src/bridge.ts` | 브리지 클라이언트 |
| `web/src/state/bridge/mossBridge.ts` | 웹 쪽 브리지 |

## 구현 메모

