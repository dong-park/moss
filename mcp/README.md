# moss-mcp

외부 에이전트(Claude 등)가 **실행 중인 moss를 데이터 레벨로 다루는** MCP(stdio) 서버.

moss의 사용자 데이터는 브라우저 IndexedDB(Dexie)에만 산다 — Node 프로세스가 직접 못 읽는다.
그래서 이 서버는 **WS 릴레이를 호스팅**하고, 실행 중인 moss 탭이 클라이언트로 접속해
데이터 op를 받아 처리한다. UI/DOM 시뮬레이션이 아니라 순수 데이터 RPC다.

```
외부 에이전트 ──stdio──▶ moss-mcp ──ws://127.0.0.1:7333──▶ 실행 중 moss 탭
                                                          └─ useWorkspace 액션 → 화면 반영 + Dexie 영속
```

## 도구

### 데이터 (브리지 — moss 탭 필요)

| 도구 | 설명 |
|---|---|
| `ping` | 브리지 연결 상태 + 현재 보드 id |
| `notes_list` | 현재 보드의 카드 목록 |
| `notes_get` | id로 카드 단건 조회 |
| `notes_create` | 카드 생성(kind: text·link·mindmap, boardId로 타 보드 타겟) |
| `notes_update` | 카드 본문 교체 |
| `notes_delete` | 카드 삭제 |
| `boards_list` | 사용자 보드 목록 + 현재 보드 id |
| `boards_create` | 새 보드 생성(그 보드로 전환) |
| `boards_rename` | 보드 이름 변경 |
| `boards_delete` | 보드 삭제 |
| `boards_switch` | 현재 보드 전환(이후 `notes_*`가 이 보드 기준) |
| `connections_list` | 연결 목록(noteId 필터 가능) |
| `connections_create` | 두 노트 사이 수동 연결 생성 |
| `connections_delete` | 연결 삭제 |

> notes op는 기본 **현재 보드**(또는 `boardId`로 타 보드). `notes_create`의 `kind`:
> `text`(마크다운)·`link`(content=URL)·`mindmap`(content=중심 토픽). 코드/체크리스트/인용은
> text 카드에 마크다운으로, image/audio/file은 첨부가 필요해 미지원.
> connections는 캔버스에 렌더되지 않는 데이터(현재 AI 파이프라인이 사용).

### AI (HTTP — dev 서버만 필요, 브라우저 불필요)

| 도구 | 라우트 |
|---|---|
| `ai_embed` | `POST /api/ai/embed` |
| `ai_summarize` | `POST /api/ai/summarize` (kind: flow/cluster/rhythm) |
| `ai_connection_label` | `POST /api/ai/connection-label` |
| `ai_preview` | `GET /api/preview` — same-origin 가드 때문에 **브리지 경유**(moss 탭 필요) |

### dev / 프로젝트 (fs + child_process — 서버 불필요)

| 도구 | 동작 |
|---|---|
| `dev_test` | `vitest run [pattern]` (web) |
| `dev_lint` | `eslint .` (web) |
| `dev_typecheck` | `tsc --noEmit` (web) |
| `dev_build` | `next build` (web, 느림) |
| `dev_read_doc` | 레포 내 문서 읽기(경로 가드) |
| `dev_list_docs` | 주요 문서/스펙 목록 |

> **요약**: 데이터·`ai_preview`는 moss 탭(브리지)이 필요하고, `ai_embed/summarize/connection_label`은
> dev 서버 HTTP만, `dev_*`는 서버 없이도 동작한다.

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
| `MOSS_HTTP_BASE` | `http://localhost:3000` | AI 도구가 칠 dev 서버 베이스 URL |
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
