import type { NextConfig } from "next";
import path from "node:path";

/** 모든 문서 응답에 붙는 보안 헤더. 다른 출처가 이 앱을 프레임으로 끼우지 못한다. */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
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
