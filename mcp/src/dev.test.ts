import { describe, test, expect } from "bun:test";
import {
  runCommand,
  safeRepoPath,
  devReadDoc,
  devListDocs,
  REPO_ROOT,
} from "./dev.ts";

describe("dev 도구", () => {
  test("runCommand → stdout/exit code 수집", async () => {
    const r = await runCommand("echo", ["hello-moss"]);
    expect(r.code).toBe(0);
    expect(r.timedOut).toBe(false);
    expect(r.stdout).toContain("hello-moss");
  });

  test("runCommand → 실패 명령은 0이 아닌 code", async () => {
    const r = await runCommand("sh", ["-c", "exit 3"]);
    expect(r.code).toBe(3);
  });

  test("runCommand → 타임아웃 시 timedOut", async () => {
    const r = await runCommand("sleep", ["5"], { timeoutMs: 80 });
    expect(r.timedOut).toBe(true);
  });

  test("safeRepoPath → 레포 안 경로 허용", () => {
    expect(safeRepoPath("PRD.md")).toBe(`${REPO_ROOT}/PRD.md`);
  });

  test("safeRepoPath → .. 탈출 거부", () => {
    expect(() => safeRepoPath("../../../etc/passwd")).toThrow("레포 밖");
    expect(() => safeRepoPath("/etc/passwd")).toThrow("레포 밖");
  });

  test("devReadDoc → 실제 레포 파일 읽기", async () => {
    const doc = await devReadDoc("package.json");
    expect(doc.bytes).toBeGreaterThan(0);
    expect(doc.content).toContain("\"moss\"");
  });

  test("devReadDoc → 레포 밖 경로 거부", async () => {
    await expect(devReadDoc("../secret")).rejects.toThrow("레포 밖");
  });

  test("devListDocs → root에 PRD.md 포함", async () => {
    const docs = await devListDocs();
    expect(docs.root).toContain("PRD.md");
    expect(Array.isArray(docs.specs)).toBe(true);
  });
});
