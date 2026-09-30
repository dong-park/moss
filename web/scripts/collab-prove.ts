/**
 * FEAT-collab-auth n7 real-path prove (AC-8·AC-10·AC-11 + 커서 지연).
 *
 * docker-compose의 postgres + sync를 띄운 뒤, 웹과 같은 `@hocuspocus/provider`로
 * 두 클라이언트를 붙여 실제 서버 위에서 수렴·오프라인 병합·토큰 재발급을 확인한다.
 * 브라우저 UI가 아니라 클라이언트 경로(provider + 서버)를 관통한다.
 *
 * Usage:
 *   JWT_SECRET=<Ktor와 동일> BOARD_ID=<uuid> USER_A=<uuid> USER_B=<uuid> \
 *   bun run scripts/collab-prove.ts
 *
 * 두 user는 BOARD_ID의 members 여야 한다(n5가 매 연결마다 확인).
 */
import { createHmac } from "node:crypto";
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import * as Y from "yjs";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required`);
  return value;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function boardToken(secret: string, sub: string, boardId: string, ttlSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({ iss: "moss", typ: "board", sub, boardId, iat: now, exp: now + ttlSeconds }),
  );
  const data = `${header}.${payload}`;
  const sig = b64url(createHmac("sha256", secret).update(data).digest());
  return `${data}.${sig}`;
}

function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error(`timed out: ${label}`));
      setTimeout(tick, 20);
    };
    tick();
  });
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

const url = process.env.SYNC_URL ?? "ws://localhost:1234";
const secret = required("JWT_SECRET");
const boardId = required("BOARD_ID");
const userA = required("USER_A");
const userB = required("USER_B");
// 토큰 수명을 짧게 둬 만료 뒤 재연결이 새 토큰을 받는지 본다 (AC-11).
const ttlSeconds = Number(process.env.TOKEN_TTL_SECONDS ?? "2");

const docA = new Y.Doc();
const docB = new Y.Doc();
const socketA = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: WebSocket });
const socketB = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: WebSocket });
const tokensA: string[] = [];
const tokensB: string[] = [];

const providerA = new HocuspocusProvider({
  name: boardId,
  document: docA,
  websocketProvider: socketA,
  token: () => {
    const token = boardToken(secret, userA, boardId, ttlSeconds);
    tokensA.push(token);
    return token;
  },
  onAuthenticationFailed: ({ reason }) => {
    throw new Error(`A authentication failed: ${reason}`);
  },
});
const providerB = new HocuspocusProvider({
  name: boardId,
  document: docB,
  websocketProvider: socketB,
  token: () => {
    const token = boardToken(secret, userB, boardId, ttlSeconds);
    tokensB.push(token);
    return token;
  },
  onAuthenticationFailed: ({ reason }) => {
    throw new Error(`B authentication failed: ${reason}`);
  },
});

const notesA = docA.getMap<Y.Map<unknown>>("notes");
const notesB = docB.getMap<Y.Map<unknown>>("notes");
const xOf = (notes: Y.Map<Y.Map<unknown>>, id: string) => notes.get(id)?.get("x");

async function main(): Promise<void> {
  providerA.attach();
  providerB.attach();
  await waitFor(() => providerA.isSynced && providerB.isSynced, 15_000, "both synced");

  // ── AC-8: 같은 메모를 동시에 다른 자리로 ──────────────────────────
  const note = new Y.Map<unknown>();
  note.set("id", "n1");
  note.set("x", 0);
  note.set("y", 0);
  notesA.set("n1", note);
  await waitFor(() => notesB.get("n1") !== undefined, 5_000, "B sees n1");

  notesA.get("n1")!.set("x", 100);
  notesB.get("n1")!.set("x", 200);
  await waitFor(() => xOf(notesA, "n1") === xOf(notesB, "n1"), 5_000, "AC-8 converge");
  const settled = xOf(notesA, "n1");
  assert(settled === 100 || settled === 200, `AC-8 last-writer value, got ${settled}`);
  assert(notesA.size === 1 && notesB.size === 1, "AC-8 note not duplicated/lost");
  console.log(`AC-8 PASS — 두 클라이언트가 x=${settled}로 수렴, 메모 1개 유지`);

  // ── AC-10: 오프라인 편집 후 복귀 ─────────────────────────────────
  // v3 provider.disconnect()는 deprecated no-op — 소켓을 직접 끊는다.
  socketB.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  notesB.get("n1")!.set("x", 111);
  notesB.get("n1")!.set("y", 11);
  notesB.get("n1")!.set("x", 222);
  const n2 = new Y.Map<unknown>();
  n2.set("id", "n2");
  n2.set("x", 5);
  n2.set("y", 5);
  notesB.set("n2", n2);
  await new Promise((r) => setTimeout(r, 300));
  assert(notesA.get("n2") === undefined, "AC-10 offline edit must not leak while disconnected");

  socketB.connect();
  await waitFor(
    () => notesA.get("n2") !== undefined && xOf(notesA, "n1") === 222,
    15_000,
    "AC-10 offline edits merged after reconnect",
  );
  console.log("AC-10 PASS — 오프라인 4건이 복귀 뒤 A 화면에 병합, 유실 없음");

  // ── AC-11: 보드 토큰 만료 뒤 재연결이 새 토큰을 받는다 ────────────
  const callsBefore = tokensA.length;
  await new Promise((r) => setTimeout(r, ttlSeconds * 1000 + 500)); // 토큰 만료
  socketA.disconnect();
  await new Promise((r) => setTimeout(r, 200));
  socketA.connect();
  await waitFor(() => providerA.isSynced, 15_000, "A reconnected with fresh token");
  assert(tokensA.length > callsBefore, "AC-11 token() must reissue on reconnect");
  assert(tokensA.at(-1) !== tokensA[0], "AC-11 reissued token differs");
  console.log(`AC-11 PASS — 재연결에서 토큰 재발급 (${callsBefore}→${tokensA.length}회)`);

  // ── 커서 지연: Awareness 왕복 p95 ────────────────────────────────
  providerA.setAwarenessField("user", { name: "A" });
  await waitFor(
    () => (providerB.awareness?.getStates().get(docA.clientID) as { user?: unknown } | undefined)?.user !== undefined,
    5_000,
    "B sees A awareness",
  );
  const samples: number[] = [];
  for (let i = 1; i <= 20; i++) {
    const started = performance.now();
    providerA.setAwarenessField("cursor", { x: i, y: i });
    await waitFor(
      () =>
        (providerB.awareness?.getStates().get(docA.clientID) as { cursor?: { x: number } } | undefined)
          ?.cursor?.x === i,
      5_000,
      `cursor ${i}`,
    );
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
  assert(p95 < 150, `커서 p95 < 150ms, got ${p95.toFixed(1)}ms`);
  console.log(`커서 PASS — Awareness 왕복 p95 ${p95.toFixed(1)}ms (20회)`);

  console.log("\nALL PASS (AC-8 · AC-10 · AC-11 · 커서 지연)");
}

try {
  await main();
} catch (error) {
  console.error(`\nPROVE FAILED: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  providerA.destroy();
  providerB.destroy();
  socketA.destroy();
  socketB.destroy();
}
