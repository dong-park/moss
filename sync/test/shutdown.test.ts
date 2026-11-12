import { expect, test } from "bun:test";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import { signBoardToken, waitFor } from "./helpers.ts";

test("SIGTERM of an unversioned manual build persists and exits 0 with a null-revision marker", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moss-shutdown-"));
  const env: Record<string, string | undefined> = { ...process.env, STATE_PATH: join(dir, "state"), CLOSED_PATH: join(dir, "closed"), FAIL_STORE: "0" };
  delete env.RELEASE_SHA;
  const child = Bun.spawn([process.execPath, "run", "test/fixtures/shutdown.ts"], {
    cwd: import.meta.dir + "/..", env, stdout: "pipe", stderr: "pipe",
  });
  const reader = child.stdout.getReader();
  const line = new TextDecoder().decode((await reader.read()).value);
  const { port } = JSON.parse(line.trim()) as { port: number };
  const board = "b-shutdown-unversioned";
  const token = await signBoardToken({ userId: crypto.randomUUID(), boardId: board });
  const doc = new Y.Doc();
  const websocket = new HocuspocusProviderWebsocket({ url: `ws://127.0.0.1:${port}`, WebSocketPolyfill: WebSocket });
  const provider = new HocuspocusProvider({ document: doc, name: board, token, websocketProvider: websocket });
  provider.attach();
  try {
    await waitFor(() => provider.isSynced);
    doc.getMap("proof").set("dirty", "unversioned");
    await waitFor(() => provider.unsyncedChanges === 0);
    process.kill(child.pid, "SIGTERM");
    const exit = await child.exited;
    let output = line;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      output += new TextDecoder().decode(next.value);
    }
    expect(exit).toBe(0);
    expect(output).toContain(JSON.stringify({ event: "moss_sync_shutdown_complete", sha: null }));
    const restored = new Y.Doc();
    Y.applyUpdate(restored, await readFile(join(dir, "state")));
    expect(restored.getMap("proof").get("dirty")).toBe("unversioned");
    restored.destroy();
  } finally {
    provider.destroy(); websocket.destroy(); doc.destroy();
    if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; }
    await rm(dir, { recursive: true, force: true });
  }
});

for (const fail of [false, true]) {
  test(`SIGTERM ${fail ? "fails nonzero without success marker on store failure" : "persists dirty state before exit 0 and completion marker"}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "moss-shutdown-"));
    const child = Bun.spawn([process.execPath, "run", "test/fixtures/shutdown.ts"], {
      cwd: import.meta.dir + "/..",
      env: { ...process.env, RELEASE_SHA: "a".repeat(40), STATE_PATH: join(dir, "state"), CLOSED_PATH: join(dir, "closed"), FAIL_STORE: fail ? "1" : "0" },
      stdout: "pipe", stderr: "pipe",
    });
    const reader = child.stdout.getReader();
    const first = await reader.read();
    const line = new TextDecoder().decode(first.value);
    const { port } = JSON.parse(line.trim()) as { port: number };
    const board = "b-shutdown-test";
    const token = await signBoardToken({ userId: crypto.randomUUID(), boardId: board });
    const doc = new Y.Doc();
    const observer = new Y.Doc();
    const websocket = new HocuspocusProviderWebsocket({ url: `ws://127.0.0.1:${port}`, WebSocketPolyfill: WebSocket });
    const a = new HocuspocusProvider({ document: doc, name: board, token, websocketProvider: websocket });
    const otherSocket = new HocuspocusProviderWebsocket({ url: `ws://127.0.0.1:${port}`, WebSocketPolyfill: WebSocket });
    const b = new HocuspocusProvider({ document: observer, name: board, token, websocketProvider: otherSocket });
    a.attach(); b.attach();
    try {
      await waitFor(() => a.isSynced && b.isSynced);
      doc.getMap("proof").set("dirty", "saved on SIGTERM");
      // A second real client proves the server accepted the edit before signal.
      await waitFor(() => observer.getMap("proof").get("dirty") === "saved on SIGTERM");
      process.kill(child.pid, "SIGTERM");
      const exit = await child.exited;
      let output = line;
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        output += new TextDecoder().decode(next.value);
      }
      expect(exit).toBe(fail ? 1 : 0);
      expect(await readFile(join(dir, "closed"), "utf8")).toBe("closed");
      const marker = { event: fail ? "moss_sync_shutdown_failed" : "moss_sync_shutdown_complete", sha: "a".repeat(40) };
      expect(output).toContain(JSON.stringify(marker));
      if (fail) expect(output).not.toContain("moss_sync_shutdown_complete");
      else {
        const restored = new Y.Doc();
        Y.applyUpdate(restored, await readFile(join(dir, "state")));
        expect(restored.getMap("proof").get("dirty")).toBe("saved on SIGTERM");
        restored.destroy();
      }
    } finally {
      a.destroy(); b.destroy(); websocket.destroy(); otherSocket.destroy();
      doc.destroy(); observer.destroy();
      if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; }
      await rm(dir, { recursive: true, force: true });
    }
  });
}
