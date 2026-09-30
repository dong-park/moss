import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { AuthBootstrap } from "@/components/auth/AuthBootstrap";
import { AuthSessionOverlay } from "@/components/auth/SessionExpiredCard";
import { resetAuthStore, useAuth } from "@/state/auth/store";
import { deleteAuthDatabase } from "@/state/auth/tokenStore";

/**
 * AC-1 — 로그인한 적 없는 기기에서는 Ktor·Hocuspocus로 요청이 0건이어야 한다.
 * 여기서는 프로덕션 부트스트랩 컴포넌트를 그대로 마운트해 fetch 자체가
 * 한 번도 불리지 않는지 본다.
 */
beforeEach(async () => {
  await deleteAuthDatabase();
  resetAuthStore();
});

afterEach(() => {
  resetAuthStore();
  vi.unstubAllGlobals();
});

describe("AC-1 · 로그인 없는 경로 무네트워크", () => {
  test("세션이 없으면 hydrate가 fetch 0건, 로그인 카드도 안 뜬다", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <I18nProvider locale="ko">
        <AuthBootstrap />
        <AuthSessionOverlay />
      </I18nProvider>,
    );

    await waitFor(() => expect(useAuth.getState().hydrated).toBe(true));
    expect(useAuth.getState().status).toBe("anonymous");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("다시 로그인해 주세요")).toBeNull();
  });
});
