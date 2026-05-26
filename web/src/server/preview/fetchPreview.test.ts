import { describe, expect, it, vi } from "vitest";
import {
  PreviewError,
  extractMeta,
  fetchPreview,
  validatePreviewUrl,
} from "@/server/preview/fetchPreview";

describe("validatePreviewUrl", () => {
  it("정상 http/https URL은 통과", () => {
    expect(validatePreviewUrl("https://example.com/").hostname).toBe(
      "example.com",
    );
    expect(validatePreviewUrl("http://example.com/").hostname).toBe(
      "example.com",
    );
  });

  it("file/ftp/javascript 스킴 차단", () => {
    for (const u of [
      "file:///etc/passwd",
      "ftp://example.com/",
      "javascript:alert(1)",
    ]) {
      expect(() => validatePreviewUrl(u)).toThrow(PreviewError);
    }
  });

  it("localhost 호스트 차단", () => {
    expect(() => validatePreviewUrl("http://localhost/")).toThrow(/차단/);
    expect(() => validatePreviewUrl("http://127.0.0.1/")).toThrow(/차단/);
    expect(() => validatePreviewUrl("https://0.0.0.0/")).toThrow(/차단/);
  });

  it("private RFC1918 IPv4 차단", () => {
    expect(() => validatePreviewUrl("http://10.0.0.1/")).toThrow(/private/);
    expect(() => validatePreviewUrl("http://192.168.1.1/")).toThrow(/private/);
    expect(() => validatePreviewUrl("http://172.16.0.1/")).toThrow(/private/);
    expect(() => validatePreviewUrl("http://172.20.0.1/")).toThrow(/private/);
    expect(() => validatePreviewUrl("http://172.31.0.1/")).toThrow(/private/);
  });

  it("172.32+, 173.* 같이 RFC1918 밖은 통과", () => {
    expect(validatePreviewUrl("http://172.32.0.1/").hostname).toBe("172.32.0.1");
    expect(validatePreviewUrl("http://173.0.0.1/").hostname).toBe("173.0.0.1");
  });

  it("link-local 169.254.* 차단", () => {
    expect(() => validatePreviewUrl("http://169.254.1.1/")).toThrow(/private/);
  });

  it("IPv4-mapped IPv6 loopback 차단 (`::ffff:127.0.0.1`)", () => {
    expect(() => validatePreviewUrl("http://[::ffff:127.0.0.1]/")).toThrow(
      /private IPv4-embedded|차단/,
    );
  });

  it("IPv4-mapped IPv6 private (`::ffff:10.0.0.1`) 차단", () => {
    expect(() =>
      validatePreviewUrl("http://[::ffff:10.0.0.1]/"),
    ).toThrow(/private IPv4-embedded/);
  });

  it("IPv4-compatible IPv6 loopback 차단 (`::127.0.0.1` → URL 정규화 `::7f00:1`)", () => {
    expect(() => validatePreviewUrl("http://[::127.0.0.1]/")).toThrow(
      /private IPv4-embedded|차단/,
    );
  });

  it("IPv4-compatible IPv6 private 10.* 차단 (`::10.0.0.1` → `::a00:1`)", () => {
    expect(() => validatePreviewUrl("http://[::10.0.0.1]/")).toThrow(
      /private IPv4-embedded/,
    );
  });

  it(".local/.lan/.internal 접미사 차단", () => {
    expect(() => validatePreviewUrl("http://server.local/")).toThrow(/차단/);
    expect(() => validatePreviewUrl("http://intranet.lan/")).toThrow(/차단/);
    expect(() => validatePreviewUrl("http://aws.internal/")).toThrow(/차단/);
  });

  it("잘못된 URL 형식 거부", () => {
    expect(() => validatePreviewUrl("not a url")).toThrow(/URL/);
  });
});

describe("extractMeta", () => {
  const base = new URL("https://example.com/post");

  it("og:title 우선, fallback <title>", () => {
    const html = `
      <html><head>
        <title>Title Fallback</title>
        <meta property="og:title" content="OG Title">
      </head></html>
    `;
    expect(extractMeta(html, base).title).toBe("OG Title");
  });

  it("og:title 없으면 <title> 사용", () => {
    const html = `<html><head><title>Only Title</title></head></html>`;
    expect(extractMeta(html, base).title).toBe("Only Title");
  });

  it("og:description / name=description", () => {
    const html = `
      <meta property="og:description" content="oops summary">
      <meta name="description" content="fallback desc">
    `;
    expect(extractMeta(html, base).summary).toBe("oops summary");

    const html2 = `<meta name="description" content="only fallback">`;
    expect(extractMeta(html2, base).summary).toBe("only fallback");
  });

  it("og:image — 상대 경로는 base에 대해 절대화", () => {
    const html = `<meta property="og:image" content="/og.png">`;
    expect(extractMeta(html, base).thumbUrl).toBe("https://example.com/og.png");

    const html2 = `<meta property="og:image" content="https://cdn.example/i.jpg">`;
    expect(extractMeta(html2, base).thumbUrl).toBe(
      "https://cdn.example/i.jpg",
    );
  });

  it("HTML entity 디코딩", () => {
    const html = `<meta property="og:title" content="Tom &amp; Jerry">`;
    expect(extractMeta(html, base).title).toBe("Tom & Jerry");
  });

  it("content/property 순서가 반대여도 매치", () => {
    const html = `<meta content="Reversed" property="og:title">`;
    expect(extractMeta(html, base).title).toBe("Reversed");
  });

  it("OG 메타가 전혀 없으면 빈 객체", () => {
    expect(extractMeta("<html></html>", base)).toEqual({});
  });
});

describe("fetchPreview", () => {
  it("정상 응답 → 메타 추출", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        `<html><head>
          <title>fallback</title>
          <meta property="og:title" content="Hello">
          <meta property="og:description" content="World">
          <meta property="og:image" content="/og.png">
        </head></html>`,
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      ),
    );
    const r = await fetchPreview("https://example.com/post", { fetchImpl });
    expect(r).toEqual({
      url: "https://example.com/post",
      title: "Hello",
      summary: "World",
      thumbUrl: "https://example.com/og.png",
    });
  });

  it("HTML이 아닌 응답 → url만", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("binary", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );
    const r = await fetchPreview("https://example.com/", { fetchImpl });
    expect(r).toEqual({ url: "https://example.com/" });
  });

  it("비-200 응답 → url만", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const r = await fetchPreview("https://example.com/", { fetchImpl });
    expect(r).toEqual({ url: "https://example.com/" });
  });

  it("AbortError → PreviewError timeout", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }) as Promise<Response>;
    });
    await expect(
      fetchPreview("https://example.com/", { fetchImpl, timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("응답이 너무 큰 경우(content-length) → too_large", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("body", {
        status: 200,
        headers: {
          "content-type": "text/html",
          "content-length": String(10_000_000),
        },
      }),
    );
    await expect(
      fetchPreview("https://example.com/", { fetchImpl, maxBytes: 1000 }),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("private IP 입력 → blocked_host (fetch 호출 자체 없음)", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchPreview("http://10.0.0.1/", { fetchImpl }),
    ).rejects.toMatchObject({ code: "blocked_host" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("redirect chain 매 hop 호스트 재검증 — private IP로 redirect 시 blocked", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const u = typeof input === "string" ? input : input.toString();
      if (u === "https://safe.example.com/") {
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        });
      }
      throw new Error("should not fetch private IP");
    });
    await expect(
      fetchPreview("https://safe.example.com/", { fetchImpl }),
    ).rejects.toMatchObject({ code: "blocked_host" });
  });

  it("redirect chain 정상 — 같은 외부 도메인으로 1회 redirect 후 응답 사용", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const u = typeof input === "string" ? input : input.toString();
      if (u === "https://a.example.com/") {
        return new Response(null, {
          status: 301,
          headers: { location: "https://b.example.com/x" },
        });
      }
      return new Response(
        `<html><head><meta property="og:title" content="Final"></head></html>`,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    });
    const r = await fetchPreview("https://a.example.com/", { fetchImpl });
    expect(r.title).toBe("Final");
    expect(r.url).toBe("https://b.example.com/x");
  });

  it("redirect 횟수 cap 초과 시 too_many_redirects", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n += 1;
      return new Response(null, {
        status: 302,
        headers: { location: `https://hop${n}.example.com/` },
      });
    });
    await expect(
      fetchPreview("https://start.example.com/", {
        fetchImpl,
        maxRedirects: 2,
      }),
    ).rejects.toMatchObject({ code: "too_many_redirects" });
  });

  it("스트림 누적 byte 한도 초과 → too_large (gzip bomb 방어)", async () => {
    // ReadableStream으로 매 chunk마다 디컴프레션된 byte를 보낸 척
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // 각 chunk 200KB, 5번 보내면 1MB 초과
        const chunk = encoder.encode("x".repeat(200_000));
        for (let i = 0; i < 5; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const fetchImpl = vi.fn(async () =>
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/html" },
        // content-length 헤더는 작게 위장 (gzip bomb 시뮬레이션)
      }),
    );
    await expect(
      fetchPreview("https://example.com/", { fetchImpl, maxBytes: 500_000 }),
    ).rejects.toMatchObject({ code: "too_large" });
  });
});
