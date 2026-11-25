// @vitest-environment node
/**
 * "이 기기에만" 약속(local-promise T16) — 서버로 나가는 길을 테스트로 묶는다.
 *
 * 웹 소스(테스트 제외)에서 fetch·WebSocket·EventSource·XMLHttpRequest·sendBeacon·
 * HocuspocusProvider를 참조하는 파일 목록이 아래 허용 목록과 같아야 한다.
 * 새 요청 코드를 넣으면 이 테스트가 깨지고, 이유를 적어 목록에 더해야 통과한다.
 *
 * 문자열 검색(`fetch(`)이 아니라 TS 구문 트리로 식별자 참조를 본다.
 *  - 주석·문자열 속 단어는 세지 않는다.
 *  - `deps.fetcher: typeof fetch`·`const f = fetch`처럼 호출 괄호가 없는 참조도 센다
 *    (state/ai/client.ts가 실제로 이 모양이라 `fetch(` 검색으로는 놓친다).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";

/** 리포지토리 루트 기준 경로로 적는다 — 스펙 구현 메모와 같은 표기. */
const SRC_ROOT = resolve(__dirname, "..", "..");
const REPO_PREFIX = "web/src/";

/** 이 이름의 식별자를 참조하면 "서버로 나가는 길"로 센다. */
const NETWORK_PRIMITIVES = new Set([
  "fetch",
  "WebSocket",
  "EventSource",
  "XMLHttpRequest",
  "sendBeacon",
  "HocuspocusProvider",
  "HocuspocusProviderWebsocket",
]);

/** `window.fetch`·`navigator.sendBeacon`처럼 전역을 한정한 접근만 참조로 본다. */
const GLOBAL_OBJECTS = new Set(["window", "globalThis", "self", "navigator"]);

/**
 * 허용 목록 — 파일 하나당 이유 하나. 목록이 실제 요청 지점과 정확히 같아야 한다
 * (목록에만 있고 소스에 없는 줄도 실패 — 목록이 진실을 넘어 자라지 않게).
 * 줄을 더할 때는 spec/glass-wall/local-promise 허용 목록에 이유를 적는다.
 */
const ALLOWED_FILES: Record<string, string> = {
  // 로그인한 순간과 세션 갱신. 로그인 화면이 없어도 사용자가 로그인을 고른 뒤에만 불린다.
  "web/src/state/auth/api.ts": "로그인한 순간과 세션 갱신",
  // 공유를 고른 벽과 그 멤버. 공유하지 않은 벽은 부르지 않는다.
  "web/src/state/share/api.ts": "공유를 고른 벽과 그 멤버",
  // 공유 벽에 붙인 첨부. 공유한 벽의 파일만 오간다.
  "web/src/state/share/files.ts": "공유 벽 첨부",
  // 공유 벽 동기화(Hocuspocus). 공유한 벽에만 provider를 붙인다.
  "web/src/state/collab/provider.ts": "공유 벽 동기화",
  // 링크 미리보기(/api/preview). 혼자 쓰는 벽에서는 사용자가 "미리보기 가져오기"를 누를 때만 — n6.
  "web/src/state/cardContent.ts": "링크 미리보기. 혼자 쓰는 벽에서는 누를 때만 (n6)",
  // 로그인한 뒤 계정 화면에서만. 로그인하지 않으면 ensureSession이 막는다.
  "web/src/state/connectedApps.ts": "로그인한 뒤 연결된 앱 목록과 해제",
  // 127.0.0.1 로컬 브리지와 그 미리보기. NEXT_PUBLIC_MOSS_BRIDGE=1 빌드에서만 켜진다 — 바깥이 아니다.
  "web/src/state/bridge/mossBridge.ts":
    "127.0.0.1 로컬 브리지와 그 미리보기. NEXT_PUBLIC_MOSS_BRIDGE=1일 때만",
};

/** 접두어로 허용하는 디렉터리 — 서버 쪽 코드라 브라우저에서 돌지 않는다. */
const ALLOWED_PREFIXES: Record<string, string> = {
  "web/src/server/": "서버 쪽 코드. 브라우저에서 돌지 않는다",
  "web/src/app/api/": "Next 라우트 핸들러. 서버에서만 돈다",
};

/**
 * remove-ai 대기 — AI 경로는 remove-ai 티켓이 지운다. 그때까지만 통과시킨다.
 * remove-ai가 끝나면 이 줄을 지운다. 줄이 남아 있는데 가리킬 파일이 없으면 아래
 * "대기 줄이 낡지 않았다" 테스트가 실패해 줄을 지우게 만든다.
 * 줄을 먼저 지우면(AI 파일이 남은 채로) 아래 "허용 목록 밖" 테스트가 실패한다.
 *
 * `web/src/server/ai/`는 ALLOWED_PREFIXES의 server/**에도 걸리지만 대기 줄이 먼저 잡는다 —
 * 그래야 remove-ai 뒤 server/ai가 되살아날 때 막힌다.
 */
const PENDING_REMOVE_AI: Record<string, string> = {
  "web/src/state/ai/": "remove-ai 대기 — 서버 AI 호출 클라이언트",
  "web/src/server/ai/": "remove-ai 대기 — AI 라우트 구현",
};

// ───────────────────────── 스캔 ─────────────────────────

function isTestFile(path: string): boolean {
  const parts = path.split(sep);
  if (parts.includes("__tests__") || parts.includes("__mocks__")) return true;
  return /\.(test|spec)\.(ts|tsx)$/.test(path);
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !isTestFile(full)) {
      out.push(full);
    }
  }
  return out;
}

/** 식별자가 "이름을 선언/지정하는 자리"이거나 타입 자리인가 — 요청 참조가 아니다. */
function isNonReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // `x.fetch` — 전역 한정자(window 등)가 아니면 다른 객체의 메서드 이름이다.
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    const obj = parent.expression;
    return !(ts.isIdentifier(obj) && GLOBAL_OBJECTS.has(obj.text));
  }
  // 선언·키 자리: `{ fetch: ... }`, `fetch() {}`, `interface { fetch: ... }`, `function fetch`, `const fetch`
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) &&
    (parent as { name?: ts.Node }).name === node
  ) {
    return true;
  }
  // 타입 자리: `let s: WebSocket | null` — 값 참조가 아니다. (`typeof fetch`는 TypeQuery라 따로 센다)
  if (ts.isTypeReferenceNode(parent) || ts.isExpressionWithTypeArguments(parent)) return true;
  // 단축 프로퍼티 `{ fetch }`는 값 참조라 센다(위 PropertyAssignment와 구분된다).
  return false;
}

/** 소스 한 파일에서 네트워크 프리미티브를 참조한 이름과 줄 번호. */
function findNetworkRefs(source: string, fileName: string): { name: string; line: number }[] {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const found: { name: string; line: number }[] = [];

  const visit = (node: ts.Node) => {
    // `import { HocuspocusProvider } from "@hocuspocus/provider"` — 가져오는 것만으로도 참조다.
    // (import 지정자의 이름은 식별자 방문으로 잡히지만, 별칭 `as X`로 가려진 경우를 위해 모듈 이름도 본다.)
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "@hocuspocus/provider"
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      found.push({ name: "@hocuspocus/provider", line: line + 1 });
    }
    if (ts.isIdentifier(node) && NETWORK_PRIMITIVES.has(node.text) && !isNonReference(node)) {
      // import 지정자 자체(`import { fetch as f }`)는 위 모듈 검사와 별개로 둔다 — 이름이 같으면 센다.
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      found.push({ name: node.text, line: line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

type FileRefs = Map<string, { name: string; line: number }[]>;

function scanWebSource(): FileRefs {
  const result: FileRefs = new Map();
  for (const file of listSourceFiles(SRC_ROOT)) {
    const refs = findNetworkRefs(readFileSync(file, "utf8"), file);
    if (refs.length === 0) continue;
    const repoPath = REPO_PREFIX + relative(SRC_ROOT, file).split(sep).join("/");
    result.set(repoPath, refs);
  }
  return result;
}

type Verdict = "allowed" | "prefix" | "pending" | "unlisted";

function classify(
  repoPath: string,
  deps = { allowedFiles: ALLOWED_FILES, allowedPrefixes: ALLOWED_PREFIXES, pending: PENDING_REMOVE_AI },
): Verdict {
  // 대기 줄을 먼저 본다 — server/ai가 server/** 허용에 먼저 걸려 영구 허용되지 않게.
  if (Object.keys(deps.pending).some((p) => repoPath.startsWith(p))) return "pending";
  if (repoPath in deps.allowedFiles) return "allowed";
  if (Object.keys(deps.allowedPrefixes).some((p) => repoPath.startsWith(p))) return "prefix";
  return "unlisted";
}

// ───────────────────────── 테스트 ─────────────────────────

describe("서버로 나가는 길 허용 목록 (local-promise T16)", () => {
  const refs = scanWebSource();

  it("실제 소스를 읽고 있다 — 허용 파일마다 요청 참조가 한 번 이상 보인다", () => {
    // 스캔이 비어 있으면 아래 대조가 전부 헛통과한다. 목록의 각 파일이 잡혀야 한다.
    expect(refs.size).toBeGreaterThan(0);
    for (const file of Object.keys(ALLOWED_FILES)) {
      expect(refs.has(file), `${file} 에서 요청 참조를 찾지 못했다`).toBe(true);
    }
  });

  it("허용 목록 밖 파일에는 요청 코드가 없다", () => {
    const unlisted = [...refs.entries()]
      .filter(([file]) => classify(file) === "unlisted")
      .map(([file, hits]) => {
        const where = hits.map((h) => `${h.name}@${h.line}`).join(", ");
        return `${file} (${where})`;
      });
    expect(
      unlisted,
      [
        "허용 목록 밖에서 서버로 나가는 코드가 생겼다.",
        ...unlisted.map((u) => `  - ${u}`),
        "spec/glass-wall/local-promise 허용 목록에 이유를 적고 더하세요.",
        "(공유한 벽이나 로그인한 순간에만 불리지 않는다면 이 파일을 넣지 말고 길을 고치세요.)",
      ].join("\n"),
    ).toEqual([]);
  });

  it("허용 목록의 모든 파일이 실제로 요청 지점이다 — 목록이 진실을 넘어 자라지 않는다", () => {
    const stale = Object.keys(ALLOWED_FILES).filter((file) => !refs.has(file));
    expect(
      stale,
      `요청 코드가 없어진 파일이 목록에 남아 있다. 줄을 지우세요:\n${stale.map((s) => `  - ${s}`).join("\n")}`,
    ).toEqual([]);
  });

  it("remove-ai 대기 줄이 낡지 않았다 — AI 파일이 사라지면 줄도 지운다", () => {
    const stale = Object.keys(PENDING_REMOVE_AI).filter(
      (prefix) => ![...refs.keys()].some((file) => file.startsWith(prefix)),
    );
    expect(
      stale,
      `remove-ai가 끝났다. PENDING_REMOVE_AI에서 줄을 지우세요:\n${stale.map((s) => `  - ${s}`).join("\n")}`,
    ).toEqual([]);
  });

  it("대기 줄을 지우면 AI 파일이 허용 목록 밖으로 잡힌다", () => {
    const aiFiles = [...refs.keys()].filter((f) => f.startsWith("web/src/state/ai/"));
    expect(aiFiles.length).toBeGreaterThan(0);
    for (const file of aiFiles) {
      expect(classify(file)).toBe("pending");
      expect(
        classify(file, { allowedFiles: ALLOWED_FILES, allowedPrefixes: ALLOWED_PREFIXES, pending: {} }),
      ).toBe("unlisted");
    }
  });

  it("호출 괄호 없는 참조·한정된 전역 접근도 센다", () => {
    const sample = [
      "const f = fetch;",
      "const g: typeof fetch = window.fetch;",
      "const h = globalThis.fetch('/x');",
      "const s = new WebSocket('ws://x');",
      "navigator.sendBeacon('/b');",
      "const e = new EventSource('/e');",
    ].join("\n");
    const names = findNetworkRefs(sample, "sample.ts").map((r) => r.name);
    expect(names.filter((n) => n === "fetch").length).toBe(4);
    expect(names).toContain("WebSocket");
    expect(names).toContain("sendBeacon");
    expect(names).toContain("EventSource");
  });

  it("주석·문자열·타입 자리·남의 객체의 같은 이름 메서드는 세지 않는다", () => {
    const sample = [
      "// fetch('/api') 설명 주석",
      "/* new WebSocket(url) */",
      "const msg = \"fetch( 는 여기서 문자열\";",
      "let s: WebSocket | null = null;",
      "const r = cache.fetch(key);",
      "const o = { fetch: 1 };",
    ].join("\n");
    expect(findNetworkRefs(sample, "sample.ts")).toEqual([]);
  });
});
