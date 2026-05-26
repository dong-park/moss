import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/preview/route";

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function makeReq(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("GET /api/preview — origin guard", () => {
  it("Sec-Fetch-Site: same-origin → 통과", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(`<html><head><title>OK</title></head></html>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ) as typeof fetch;
    const req = makeReq(
      "http://localhost:3000/api/preview?url=https://example.com/",
      { "sec-fetch-site": "same-origin" },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title?: string };
    expect(body.title).toBe("OK");
  });

  it("Sec-Fetch-Site: cross-site → 403", async () => {
    const req = makeReq(
      "http://localhost:3000/api/preview?url=https://example.com/",
      { "sec-fetch-site": "cross-site" },
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("헤더 전무 → 403 (외부 직접 호출 차단)", async () => {
    const req = makeReq(
      "http://localhost:3000/api/preview?url=https://example.com/",
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("Origin 헤더가 host와 일치 → 통과 (fallback)", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(`<html></html>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ) as typeof fetch;
    const req = makeReq(
      "http://localhost:3000/api/preview?url=https://example.com/",
      { origin: "http://localhost:3000" },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("Origin 헤더가 host와 불일치 → 403", async () => {
    const req = makeReq(
      "http://localhost:3000/api/preview?url=https://example.com/",
      { origin: "https://evil.com" },
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("url 파라미터 누락 → 400 (origin은 통과 가정)", async () => {
    const req = makeReq("http://localhost:3000/api/preview", {
      "sec-fetch-site": "same-origin",
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("url_required");
  });

  it("차단된 호스트 → 400 with error code", async () => {
    const req = makeReq(
      "http://localhost:3000/api/preview?url=" + encodeURIComponent("http://10.0.0.1/"),
      { "sec-fetch-site": "same-origin" },
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("blocked_host");
  });
});
