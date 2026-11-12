// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const SHA = "a".repeat(40);
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
async function get(build: string, release: string) {
  vi.stubEnv("BUILD_SHA", build);
  vi.stubEnv("RELEASE_SHA", release);
  const { GET } = await import("./route");
  return GET();
}
describe("deployment readiness", () => {
  it("returns the build revision without caching", async () => {
    const response = await get(SHA, SHA);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ status: "ready", sha: SHA });
  });
  it.each(["", "abc", "g".repeat(40), "a".repeat(41), SHA + "\n"])("rejects invalid runtime revision %j", async (release) => {
    expect((await get(SHA, release)).status).toBe(503);
  });
  it("does not let runtime revision relabel the compiled build", async () => {
    const response = await get(SHA, "b".repeat(40));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
  it("requires a valid compiled build revision", async () => {
    expect((await get("", SHA)).status).toBe(503);
  });
  it("reports an explicit unversioned manual build only without any release revision", async () => {
    const response = await get("", "");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ status: "unversioned" });
    // A runtime revision cannot turn an unversioned build into a release.
    expect(await (await get("", SHA)).json()).toEqual({ status: "unavailable" });
  });
});
