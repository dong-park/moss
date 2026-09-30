/**
 * Manual acceptance check for the brief's docker-compose criterion:
 * "두 클라이언트가 같은 값으로 수렴한다".
 *
 * Usage (after `docker compose up -d` and sharing a board from the app once):
 *
 *   SYNC_URL=ws://localhost:1234 \
 *   JWT_SECRET=<same as Ktor> \
 *   BOARD_ID=<board uuid> \
 *   USER_A=<member uuid> USER_B=<member uuid> \
 *   bun run converge
 *
 * The server re-checks `members` on every connection, so both users must be
 * members of BOARD_ID. Exits 0 on convergence, 1 otherwise.
 */
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { SignJWT } from "jose";
import * as Y from "yjs";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required`);
  return value;
}

async function boardToken(secret: string, userId: string, boardId: string): Promise<string> {
  return new SignJWT({ typ: "board", boardId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("moss")
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error(`timed out: ${label}`));
      setTimeout(tick, 50);
    };
    tick();
  });
}

const url = process.env.SYNC_URL ?? "ws://localhost:1234";
const secret = required("JWT_SECRET");
const boardId = required("BOARD_ID");
const userA = required("USER_A");
const userB = required("USER_B");
const key = `converge-${Date.now()}`;

const docA = new Y.Doc();
const docB = new Y.Doc();
const socketA = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: WebSocket });
const socketB = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: WebSocket });
const providerA = new HocuspocusProvider({
  name: boardId,
  document: docA,
  token: await boardToken(secret, userA, boardId),
  websocketProvider: socketA,
});
const providerB = new HocuspocusProvider({
  name: boardId,
  document: docB,
  token: await boardToken(secret, userB, boardId),
  websocketProvider: socketB,
});
providerA.attach();
providerB.attach();

try {
  await waitFor(() => providerA.isSynced && providerB.isSynced, 10_000, "both clients synced");
  docA.getMap("meta").set("name", key);
  await waitFor(() => docB.getMap("meta").get("name") === key, 5_000, "second client converged");
  console.log(`converged: both clients see meta.name=${key}`);
} finally {
  providerA.destroy();
  providerB.destroy();
  socketA.destroy();
  socketB.destroy();
}
