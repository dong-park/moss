import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { ConnectedAppsDialog } from "@/components/auth/ConnectedAppsDialog";
import { resetAuthStore, useAuth, type AuthSession } from "@/state/auth";

const token = (() => {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp: 9_999_999_999 })}.sig`;
})();
const session: AuthSession = { accessToken: token, refreshToken: token, user: { id: "u1", name: "동환", avatar: null } };

const app = { id: "g1", clientId: "c1", clientName: "Claude", createdAt: 1_700_000_000_000, lastUsedAt: null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  resetAuthStore();
  useAuth.setState({ session, user: session.user, status: "authenticated", hydrated: true, hydrating: false });
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetAuthStore();
});

describe("ConnectedAppsDialog", () => {
  it("목록을 보이고 해제하면 DELETE를 보낸 뒤 줄이 사라진다", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? new Response(null, { status: 204 }) : json([app]),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <I18nProvider locale="ko">
        <ConnectedAppsDialog onClose={() => {}} />
      </I18nProvider>,
    );
    expect(await screen.findByText("Claude")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Claude 연결 해제" }));
    await waitFor(() => expect(screen.queryByText("Claude")).toBeNull());
    const del = fetchMock.mock.calls.find((c) => c[1]?.method === "DELETE")!;
    expect(String(del[0])).toContain("/oauth/grants/g1");
    expect((del[1]!.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
    expect(screen.getByText("연결된 앱이 없어요.")).toBeTruthy();
  });

  it("해제가 실패하면 줄을 남기고 오류를 보인다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "DELETE" ? json({ message: "x" }, 500) : json([app]),
      ),
    );
    render(
      <I18nProvider locale="ko">
        <ConnectedAppsDialog onClose={() => {}} />
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Claude 연결 해제" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Claude")).toBeTruthy();
  });
});
