import { createSyncServer } from "../../src/server.ts";
import { installShutdownHandlers } from "../../src/shutdown.ts";


const sync = createSyncServer({
  config: {
    port: 0, internalPort: 0, internalHost: "127.0.0.1", internalSecret: "test-internal",
    databaseUrl: "postgres://unused", jwtSecret: "test-secret-at-least-32-bytes-long!!",
    maxDocumentBytes: 10 * 1024 * 1024, maxConnectionsPerBoard: 10,
    debounceMs: 60000, maxDebounceMs: 60000,
  },
  store: {
    fetch: async () => null,
    store: async (_name, state) => {
      if (process.env.FAIL_STORE === "1") throw new Error("test store unavailable");
      await Bun.write(process.env.STATE_PATH!, state);
    },
    delete: async () => {},
  },
  isMember: async () => true,
  boardExists: async () => true,
});
const port = await sync.listen();
installShutdownHandlers({
  sha: () => process.env.RELEASE_SHA,
  stopAccepting: () => {},
  closeControl: async () => {},
  destroySync: () => sync.destroy(),
  closeDatabase: async () => {
    await Bun.write(process.env.CLOSED_PATH!, "closed");
  },
});
console.log(JSON.stringify({ port }));
