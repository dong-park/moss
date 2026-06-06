# moss-mcp

외부 에이전트(Claude 등)가 **실행 중인 moss를 데이터 레벨로 다루는** MCP(stdio) 서버.

moss의 사용자 데이터는 브라우저 IndexedDB(Dexie)에만 산다 — Node 프로세스가 직접 못 읽는다.
그래서 이 서버는 **WS 릴레이를 호스팅**하고, 실행 중인 moss 탭이 클라이언트로 접속해
데이터 op를 받아 처리한다. UI/DOM 시뮬레이션이 아니라 순수 데이터 RPC다.

```
외부 에이전트 ──stdio──▶ moss-mcp ──ws://127.0.0.1:7333──▶ 실행 중 moss 탭
                                                          └─ useWorkspace 액션 → 화면 반영 + Dexie 영속
```

## 구성 (MVP — notes)

도구:

| 도구 | 설명 |
|---|---|
| `ping` | 브리지 연결 상태 + 현재 보드 id |
| `notes_list` | 현재 보드의 카드 목록 |
| `notes_get` | id로 카드 단건 조회 |
| `notes_create` | 현재 보드에 카드 생성(화면 즉시 반영) |
| `notes_update` | 카드 본문 교체 |
| `notes_delete` | 카드 삭제 |

> **MVP 범위**: 모든 notes op는 **현재 보드** 기준, **text(마크다운) 카드**.
> boards/connections, `ai.*`(HTTP), `dev.*`(fs/CLI)는 후속(T5~).

## 실행

1. **moss를 브리지 플래그로 띄운다** (브라우저 탭이 열려 있어야 함):
   ```bash
   cd web && NEXT_PUBLIC_MOSS_BRIDGE=1 npm run dev   # localhost:3000
   ```
   프로덕션 빌드에서 이 플래그 없이 빌드하면 브리지는 비활성(보안 게이트).

2. **MCP 클라이언트에 등록** (예: Claude Code `.mcp.json`):
   ```json
   {
     "mcpServers": {
       "moss": { "command": "bun", "args": ["run", "/ABS/PATH/moss/mcp/src/server.ts"] }
     }
   }
   ```

## 환경 변수

| 변수 | 기본 | 설명 |
|---|---|---|
| `MOSS_BRIDGE_PORT` | `7333` | WS 릴레이 포트 (서버) |
| `MOSS_BRIDGE_HOST` | `127.0.0.1` | WS 릴레이 바인드 호스트 |
| `NEXT_PUBLIC_MOSS_BRIDGE` | (off) | moss 측. `1`이면 브리지 클라이언트 활성 |
| `NEXT_PUBLIC_MOSS_BRIDGE_URL` | `ws://127.0.0.1:7333` | moss 측. 접속할 릴레이 URL |

## 개발

```bash
bun install
bun test          # BridgeCore 단위 테스트
bunx tsc --noEmit # 타입체크
bun run scripts/smoke.ts   # 브라우저 e2e 스모크(moss 탭 접속 대기 → notes 왕복)
```

> 주의: Bun 1.2.6의 `ws` 빌트인은 WebSocketServer teardown에서 세그폴트가 있다.
> 그래서 상관/타임아웃 로직은 전송 계층과 분리된 `BridgeCore`로 소켓 없이 단위 테스트하고,
> 실제 소켓 왕복은 `scripts/smoke.ts`(브라우저 e2e)로 검증한다.
