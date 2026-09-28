import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ApiConfigError,
  apiBaseUrl,
  InviteExpiredError,
  InviteFullError,
  realAuthApi,
} from "../api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("auth/api", () => {
  test("production에서 API URL이 없으면 throw, dev에서는 localhost 폴백", () => {
    vi.stubEnv("NEXT_PUBLIC_MOSS_API_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => apiBaseUrl()).toThrow(/MOSS_API_URL/);

    vi.stubEnv("NODE_ENV", "development");
    expect(apiBaseUrl()).toBe("http://localhost:8080");
  });

  test("previewInvite는 410을 InviteExpiredError로 매핑한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(410, { error: "gone" })));
    await expect(realAuthApi.previewInvite("tok")).rejects.toBeInstanceOf(InviteExpiredError);
  });

  test("acceptInvite는 409를 InviteFullError로 매핑한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(409, { error: "conflict" })));
    await expect(realAuthApi.acceptInvite("tok", "access")).rejects.toBeInstanceOf(
      InviteFullError,
    );
  });

  test("base URL 설정 오류는 초대 오류로 감싸지 않고 그대로 전파한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_MOSS_API_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(realAuthApi.previewInvite("tok")).rejects.toBeInstanceOf(ApiConfigError);
  });
});
