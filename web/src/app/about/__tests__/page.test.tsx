import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AboutPage, { metadata } from "../page";

const html = renderToStaticMarkup(<AboutPage />);

describe("/about", () => {
  it("h1이 moss다", () => {
    expect(html).toMatch(/<h1[^>]*>moss<\/h1>/);
  });
  it("개인정보·약관·서비스·연락처 링크를 둔다", () => {
    expect(html).toContain('href="/legal/privacy"');
    expect(html).toContain('href="/legal/terms"');
    expect(html).toContain('href="/"');
    expect(html).toContain("rakddh@gmail.com");
  });
  it("Google 데이터 사용 목적과 영어 요약을 쓴다", () => {
    expect(html).toContain("Google 계정 식별자, 이름, 프로필 이미지");
    expect(html).toContain("English summary");
  });
  it("로그인 대화상자가 없다", () => {
    expect(html).not.toContain('role="dialog"');
  });
  it("metadata 제목과 설명이 있다", () => {
    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBeTruthy();
  });
});
