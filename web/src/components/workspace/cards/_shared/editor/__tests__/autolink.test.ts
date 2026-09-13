import { describe, expect, it } from "vitest";

import {
  autolink,
  isStandaloneUrl,
  normalizeHref,
  trimTrailingPunctuation,
} from "../autolink";

/* FEAT-memo-autolink (W10) — URL 감지/정규화 단위 테스트.
 * 라이브 에디터 트랜잭션(입력 규칙·붙여넣기)은 브라우저 의존이라, 그 핵심인
 * 순수 URL 감지 로직(보수적 패턴·구두점 트림·href 정규화)을 검증한다. */

describe("isStandaloneUrl — 단독 URL 판별(AC-2·AC-5)", () => {
  it("http/https/www 단독 URL을 인식", () => {
    expect(isStandaloneUrl("https://example.com")).toBe(true);
    expect(isStandaloneUrl("http://example.com/path?q=1#frag")).toBe(true);
    expect(isStandaloneUrl("www.example.com")).toBe(true);
    expect(isStandaloneUrl("  https://example.com  ")).toBe(true); // 앞뒤 공백 무시
  });

  it("후행 구두점이 붙어도 트림 후 단독 URL로 인정", () => {
    expect(isStandaloneUrl("https://example.com.")).toBe(true);
    expect(isStandaloneUrl("https://example.com)")).toBe(true);
  });

  it("URL이 아니거나 잡텍스트가 섞이면 거짓(AC-5)", () => {
    expect(isStandaloneUrl("just text")).toBe(false);
    expect(isStandaloneUrl("see https://example.com")).toBe(false);
    expect(isStandaloneUrl("https://example.com extra")).toBe(false);
    expect(isStandaloneUrl("ftp://example.com")).toBe(false);
    expect(isStandaloneUrl("example.com")).toBe(false); // 스킴 없음
    expect(isStandaloneUrl("")).toBe(false);
  });

  it("다중 라인 페이스트는 단독 URL 아님 → 기본 처리에 양보", () => {
    expect(isStandaloneUrl("https://a.com\nhttps://b.com")).toBe(false);
  });
});

describe("trimTrailingPunctuation — 후행 구두점/괄호 트림", () => {
  it("문장 부호를 떼어낸다", () => {
    expect(trimTrailingPunctuation("https://x.com.")).toBe("https://x.com");
    expect(trimTrailingPunctuation("https://x.com!!")).toBe("https://x.com");
    expect(trimTrailingPunctuation("https://x.com,")).toBe("https://x.com");
  });

  it("짝이 안 맞는 닫는 괄호만 제거, 균형 잡힌 괄호는 보존", () => {
    expect(trimTrailingPunctuation("https://x.com)")).toBe("https://x.com");
    expect(trimTrailingPunctuation("https://en.wikipedia.org/wiki/A_(B)")).toBe(
      "https://en.wikipedia.org/wiki/A_(B)",
    );
  });

  it("트림할 게 없으면 원형 유지", () => {
    expect(trimTrailingPunctuation("https://x.com/path")).toBe(
      "https://x.com/path",
    );
  });
});

describe("normalizeHref — href 정규화", () => {
  it("www.는 https://를 보충", () => {
    expect(normalizeHref("www.example.com")).toBe("https://www.example.com");
  });

  it("http/https는 그대로", () => {
    expect(normalizeHref("http://x.com")).toBe("http://x.com");
    expect(normalizeHref("https://x.com")).toBe("https://x.com");
  });

  it("2단계 리뷰 P1-5: 허용 스킴(http/https/mailto)이 아니면 null", () => {
    // PROTOCOL 정규식(http(s)://|www.)이 애초에 javascript: 등을 매칭하지
    // 않아 라이브 입력 경로로는 도달하지 않지만, 함수 자체는 방어선으로
    // state/blocks.ts의 normalizeLinkUrl 기준을 그대로 재사용해야 한다.
    expect(normalizeHref("javascript:alert(1)")).toBeNull();
  });
});

describe("ReDoS 안전성 — 병적 입력에서도 선형 시간", () => {
  it("긴 비매칭 입력을 즉시 거절", () => {
    const pathological = `https://${"a".repeat(50000)} not a url`;
    const start = performance.now();
    expect(isStandaloneUrl(pathological)).toBe(false);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe("autolink 플러그인 묶음", () => {
  it("등록 가능한 3개 플러그인(속성·입력규칙·붙여넣기) 배열", () => {
    expect(Array.isArray(autolink)).toBe(true);
    expect(autolink).toHaveLength(3);
    expect(autolink.every((p) => p != null)).toBe(true);
  });
});
