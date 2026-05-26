// FEAT-privacy ESLint 가드 셀프체크.
// 임시 위반 파일을 만들어 `eslint`로 검사 → 룰이 에러를 내는지 확인 → 정리.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(here, "..");

const dir = mkdtempSync(join(tmpdir(), "moss-eslint-"));
const file = join(repoRoot, "src", "__eslint_privacy_probe__.ts");
const code = `
async function bad() {
  await fetch("/api/ai/embed", { method: "POST" });
}
export { bad };
`;
writeFileSync(file, code);

let stdout = "";
let exitCode = 0;
try {
  execFileSync(
    join(repoRoot, "node_modules/.bin/eslint"),
    [file, "--no-warn-ignored", "-f", "json"],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (e) {
  exitCode = e.status ?? 1;
  stdout = e.stdout?.toString() ?? "";
}

rmSync(file);
rmSync(dir, { recursive: true, force: true });

const reports = stdout ? JSON.parse(stdout) : [];
const messages = reports[0]?.messages ?? [];
const hit = messages.find(
  (m) =>
    m.ruleId === "no-restricted-syntax" &&
    typeof m.message === "string" &&
    m.message.includes("FEAT-privacy"),
);

if (exitCode === 0) {
  console.error("FAIL: lint passed but should have errored on fetch('/api/ai/...')");
  process.exit(1);
}
if (!hit) {
  console.error("FAIL: no FEAT-privacy violation reported");
  console.error(JSON.stringify(messages, null, 2));
  process.exit(1);
}
console.log("OK: FEAT-privacy lint rule fires on fetch('/api/ai/...')");
