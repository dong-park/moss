import { afterEach, describe, expect, test, vi } from "vitest";
import { useAuth, SessionExpiredError } from "@/state/auth/store";
import { aiAuthHeaders } from "./authHeaders";
import { callAISummarize, configureAIClient } from "./client";

const original = useAuth.getState().ensureSession;

function stubSession(accessToken: string) {
  useAuth.setState({ ensureSession: vi.fn(async () => ({ accessToken }) as never) });
}

afterEach(() => {
  useAuth.setState({ ensureSession: original });
});

describe("aiAuthHeaders", () => {
  test("ensureSession이 준 갱신된 토큰을 Bearer로 단다", async () => {
    stubSession("refreshed-token");
    expect((await aiAuthHeaders()).Authorization).toBe("Bearer refreshed-token");
  });

  test("세션이 없으면 토큰 없이 JSON 헤더만 준다", async () => {
    useAuth.setState({
      ensureSession: vi.fn(async () => {
        throw new SessionExpiredError();
      }),
    });
    const h = await aiAuthHeaders();
    expect(h.Authorization).toBeUndefined();
    expect(h["Content-Type"]).toBe("application/json");
  });

  test("AI 클라이언트 호출이 갱신된 토큰을 보낸다", async () => {
    stubSession("fresh-for-client");
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ text: "t", tokensUsed: 0, mocked: true }), { status: 200 }),
    );
    configureAIClient({ fetcher });
    await callAISummarize(["a"], "flow");
    const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fresh-for-client");
  });
});
