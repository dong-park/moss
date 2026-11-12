/** Exit status plus the completion marker form the host-verifiable drain proof. */
export function installShutdownHandlers(deps: {
  sha: () => string | undefined;
  stopAccepting: () => void;
  closeControl: () => Promise<void>;
  destroySync: () => Promise<void>;
  closeDatabase: () => Promise<void>;
}): void {
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    // Closing the last listener can empty Bun's event loop while async database
    // work is still pending. Keep it alive until the explicit, proven exit.
    const keepAlive = setInterval(() => {}, 1000);
    deps.stopAccepting();
    let failed = false;
    try {
      // Both calls begin immediately: no new control or sync work is accepted.
      const results = await Promise.allSettled([deps.closeControl(), deps.destroySync()]);
      failed = results.some((result) => result.status === "rejected");
    } catch {
      failed = true;
    }
    try {
      await deps.closeDatabase();
    } catch {
      failed = true;
    }
    // An unversioned manual build reports sha null; the host requires its exact release SHA anyway.
    const sha = deps.sha() || undefined;
    if (sha !== undefined && (sha.length !== 40 || !/^[0-9a-fA-F]{40}$/.test(sha))) failed = true;
    // Do not include database errors, board IDs, tokens or other user data.
    const event = failed ? "moss_sync_shutdown_failed" : "moss_sync_shutdown_complete";
    console.log(JSON.stringify({ event, sha: sha ?? null }));
    clearInterval(keepAlive);
    process.exit(failed ? 1 : 0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
