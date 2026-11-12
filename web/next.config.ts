import type { NextConfig } from "next";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

// Docker writes this build input once. next start also reads config, so an
// environment override must never change the image's deploymentId.
const identityPath = path.join(__dirname, ".build-sha");
const buildSha = existsSync(identityPath) ? readFileSync(identityPath, "utf8") : process.env.BUILD_SHA ?? "";
if (buildSha !== "" && (buildSha.length !== 40 || !/^[0-9a-fA-F]{40}$/.test(buildSha))) {
  throw new Error("BUILD_SHA must be a 40-character hexadecimal commit SHA");
}

/** 모든 문서 응답에 붙는 보안 헤더. 다른 출처가 이 앱을 프레임으로 끼우지 못한다. */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // env is deliberately compiled into the route; runtime BUILD_SHA cannot relabel a build.
  env: { BUILD_SHA: buildSha },
  deploymentId: buildSha || undefined,
  transpilePackages: ["@moss/doc-model"],
  // bun은 @moss/doc-model을 web 밖(../shared)을 가리키는 파일 심링크로 설치하고,
  // Turbopack은 그 심링크를 읽지 못한다. 루트를 저장소 최상위로 올리고 소스를 직접 가리킨다.
  turbopack: {
    root: path.join(__dirname, ".."),
    resolveAlias: { "@moss/doc-model": "../shared/doc-model/src/index.ts" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
