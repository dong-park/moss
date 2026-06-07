/* ─────────────────────────────────────────────────────────────
 * moss-mcp T7 — 개발/프로젝트 관리 도구. 레포에서 직접 명령 실행 + 문서 읽기.
 * 브라우저·브리지 불필요.
 *
 *   dev_test [pattern]  → web에서 vitest run
 *   dev_lint            → web에서 eslint
 *   dev_typecheck       → web에서 tsc --noEmit
 *   dev_build           → web 프로덕션 빌드 (느림)
 *   dev_read_doc {path} → 레포 내 텍스트 문서 읽기(경로 가드)
 *   dev_list_docs       → 주요 문서/스펙 목록
 * ───────────────────────────────────────────────────────────── */

import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, sep, join } from "node:path";

/** mcp/src → mcp → 레포 루트. */
export const REPO_ROOT = resolve(import.meta.dir, "..", "..");
export const WEB_DIR = join(REPO_ROOT, "web");

export interface CommandResult {
  command: string;
  code: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

const MAX_OUTPUT = 200_000; // 도구 응답 폭주 방지 — 양끝을 남기고 가운데를 자른다.

function clamp(s: string): string {
  if (s.length <= MAX_OUTPUT) return s;
  const head = s.slice(0, MAX_OUTPUT / 2);
  const tail = s.slice(-MAX_OUTPUT / 2);
  return `${head}\n…[${s.length - MAX_OUTPUT}자 생략]…\n${tail}`;
}

/** cwd에서 명령을 실행하고 stdout/stderr/exit code를 수집한다. 타임아웃 시 kill. */
export function runCommand(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<CommandResult> {
  const cwd = opts.cwd ?? REPO_ROOT;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const display = `${cmd} ${args.join(" ")}`.trim();
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({
        command: display,
        code: null,
        timedOut,
        stdout: clamp(stdout),
        stderr: clamp(stderr + `\n[spawn 실패: ${err.message}]`),
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({
        command: display,
        code,
        timedOut,
        stdout: clamp(stdout),
        stderr: clamp(stderr),
      });
    });
  });
}

export function devTest(pattern?: string): Promise<CommandResult> {
  const args = ["vitest", "run", ...(pattern ? [pattern] : [])];
  return runCommand("npx", args, { cwd: WEB_DIR, timeoutMs: 240_000 });
}

export function devLint(): Promise<CommandResult> {
  return runCommand("npx", ["eslint", "."], { cwd: WEB_DIR, timeoutMs: 180_000 });
}

export function devTypecheck(): Promise<CommandResult> {
  return runCommand("npx", ["tsc", "--noEmit"], { cwd: WEB_DIR, timeoutMs: 180_000 });
}

export function devBuild(): Promise<CommandResult> {
  return runCommand("npx", ["next", "build"], { cwd: WEB_DIR, timeoutMs: 480_000 });
}

/** 레포 루트를 벗어나지 못하게 경로를 정규화·검증한다(.. 탈출 방지). */
export function safeRepoPath(p: string): string {
  const abs = resolve(REPO_ROOT, p);
  if (abs !== REPO_ROOT && !abs.startsWith(REPO_ROOT + sep)) {
    throw new Error(`레포 밖 경로는 읽을 수 없습니다: ${p}`);
  }
  return abs;
}

const MAX_DOC = 400_000;

/** 레포 내 텍스트 문서를 읽는다(PRD.md, docs/*, web/* 등). 경로 가드 적용. */
export async function devReadDoc(path: string): Promise<{ path: string; bytes: number; content: string }> {
  const abs = safeRepoPath(path);
  const info = await stat(abs);
  if (info.isDirectory()) throw new Error(`디렉터리입니다(파일 경로를 주세요): ${path}`);
  const raw = await readFile(abs, "utf8");
  const content = raw.length > MAX_DOC ? raw.slice(0, MAX_DOC) + `\n…[${raw.length - MAX_DOC}자 생략]` : raw;
  return { path, bytes: info.size, content };
}

/** 주요 문서/스펙 목록을 반환한다. */
export async function devListDocs(): Promise<{ root: string[]; docs: string[]; specs: string[] }> {
  const safeList = async (dir: string): Promise<string[]> => {
    try {
      const entries = await readdir(join(REPO_ROOT, dir), { withFileTypes: true });
      return entries
        .filter((e) => e.isFile())
        .map((e) => (dir ? `${dir}/${e.name}` : e.name))
        .filter((n) => /\.(md|json|txt)$/.test(n));
    } catch {
      return [];
    }
  };
  return {
    root: await safeList(""),
    docs: await safeList("docs"),
    specs: await safeList("docs/specs"),
  };
}
