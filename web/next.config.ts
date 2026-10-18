import type { NextConfig } from "next";
import path from "node:path";

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
