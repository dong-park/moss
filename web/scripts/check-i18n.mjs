#!/usr/bin/env node
/**
 * i18n 빌드 검증 — `t("key.path")` 호출과 messages/ko.json 키를 대조.
 *
 * 결과:
 * - 누락(사용은 하지만 정의 없음) → 표시 + exit 1
 * - 미사용(정의는 있지만 호출 없음) → 경고 + exit 0
 *
 * 한계: 동적 키 `t(variable)`는 정적으로 추적 불가 — 검출에서 제외.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MESSAGES_PATH = path.join(ROOT, "src/i18n/messages/ko.json");
const SRC_DIR = path.join(ROOT, "src");

const messages = JSON.parse(fs.readFileSync(MESSAGES_PATH, "utf8"));

/** @param {unknown} node @param {string} prefix @returns {Set<string>} */
function flatKeys(node, prefix = "") {
  const out = new Set();
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") out.add(key);
      else for (const sub of flatKeys(v, key)) out.add(sub);
    }
  }
  return out;
}

const defined = flatKeys(messages);

const used = new Set();
const T_RE = /\bt\(\s*["']([\w.]+)["']/g;

/** @param {string} dir */
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(p);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      // i18n 내부 모듈 자체는 t() 정의/타입이라 제외
      if (p.includes(`${path.sep}i18n${path.sep}`)) continue;
      const code = fs.readFileSync(p, "utf8");
      let m;
      while ((m = T_RE.exec(code))) used.add(m[1]);
    }
  }
}
walk(SRC_DIR);

const missing = [...used].filter((k) => !defined.has(k)).sort();
const unused = [...defined].filter((k) => !used.has(k)).sort();

if (missing.length) {
  console.error(`[i18n] missing ${missing.length} key(s):`);
  for (const k of missing) console.error("  - " + k);
}
if (unused.length) {
  console.warn(`[i18n] unused ${unused.length} key(s):`);
  for (const k of unused) console.warn("  - " + k);
}
if (!missing.length && !unused.length) {
  console.log(`[i18n] OK — ${used.size} keys matched`);
}

process.exit(missing.length ? 1 : 0);
