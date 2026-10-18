import { Pool } from "pg";
import { loadConfig, toPgConnection } from "./config.ts";
import { ensureDocumentsTable, PostgresDocumentStore } from "./documentStore.ts";
import { startInternalServer } from "./internalServer.ts";
import { createKtorIntrospector } from "./mcp.ts";
import { createKtorFileStore } from "./mcpFiles.ts";
import { createPostgresBoardSource } from "./mcpBoards.ts";
import { readTools } from "./mcpReadTools.ts";
import { writeTools } from "./mcpWriteTools.ts";
import { createPostgresBoardExists, createPostgresMembership } from "./membership.ts";
import { createSyncServer } from "./server.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new Pool({ ...toPgConnection(config), max: 5 });

  // [P1] Ktor's Flyway migration owns `documents`; wait for it instead of
  // binding the socket and losing edits to "relation does not exist".
  await ensureDocumentsTable(pool);

  const isMember = createPostgresMembership(pool);
  const store = new PostgresDocumentStore(pool);
  const sync = createSyncServer({
    config,
    store,
    isMember,
    boardExists: createPostgresBoardExists(pool),
    ...(config.mcp !== undefined
      ? {
          mcp: {
            config: config.mcp,
            introspect: createKtorIntrospector(config.mcp, config.internalSecret),
            isMember,
            boards: createPostgresBoardSource(pool, store),
            files: createKtorFileStore(config.mcp, config.internalSecret),
            tools: [...readTools, ...writeTools],
          },
        }
      : {}),
  });
  const port = await sync.listen();

  const internal = await startInternalServer({
    port: config.internalPort,
    host: config.internalHost,
    secret: config.internalSecret,
    revokeBoard: sync.revokeBoard,
    kickMember: sync.kickMember,
  });

  console.log(`moss sync listening on ws://0.0.0.0:${port} (internal control :${internal.port})`);

  const shutdown = async () => {
    await internal.close();
    await sync.destroy();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

try {
  await main();
} catch (error) {
  console.error("moss sync failed to start:", error instanceof Error ? error.message : error);
  process.exit(1);
}
