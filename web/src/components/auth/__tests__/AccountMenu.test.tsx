import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as Y from "yjs";
import { I18nProvider } from "@/i18n/Provider";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { CollabSession } from "@/components/collab/CollabSession";
import { resetAuthStore, useAuth, type AuthSession } from "@/state/auth";
import { configureCollab, resetCollabStore, useCollab } from "@/state/collab";
import { resetShareStore, useShare } from "@/state/share";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";

const token = (() => {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp: 9_999_999_999 })}.sig`;
})();
const session: AuthSession = {
  accessToken: token,
  refreshToken: token,
  user: { id: "u1", name: "동환", avatar: null },
};

function signIn() {
  useAuth.setState({ session, user: session.user, status: "authenticated", hydrated: true, hydrating: false });
}

function mount() {
  return render(
    <I18nProvider locale="ko">
      <AccountMenu />
      <CollabSession />
    </I18nProvider>,
  );
}

function openMenu() {
  fireEvent.keyDown(screen.getByRole("button", { name: "계정" }), { key: "Enter" });
}

beforeEach(() => {
  resetAuthStore();
  resetCollabStore();
  resetShareStore();
});

afterEach(() => {
  resetAuthStore();
  resetCollabStore();
  resetShareStore();
  useWorkspace.setState({ currentBoardId: SYSTEM_BOARD_ID });
});

describe("AccountMenu", () => {
  it("로그인 전에는 계정 아이콘이 없다", () => {
    mount();
    expect(screen.queryByRole("button", { name: "계정" })).toBeNull();
  });

  it("아이콘을 열면 이름과 로그아웃 2줄이 보인다", async () => {
    signIn();
    mount();
    openMenu();
    expect(await screen.findByText("동환")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "로그아웃" })).toBeTruthy();
  });

  it("로그아웃 한 번에 anonymous가 되고 공유 연결이 끊기며 보드는 남는다", async () => {
    const destroy = vi.fn();
    configureCollab({
      providerFactory: { create: () => ({ awareness: null, connect: vi.fn(), disconnect: vi.fn(), destroy }) },
      fetchBoardToken: async () => ({ boardToken: "bt", expiresInSeconds: 3600 }),
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => 1_700_000_000_000,
    });
    signIn();
    useWorkspace.setState({ currentBoardId: "b1" });
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: null } } });
    const boardsBefore = useWorkspace.getState().boards.length;

    mount();
    await waitFor(() => expect(useCollab.getState().boardId).toBe("b1"));

    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "로그아웃" }));

    await waitFor(() => expect(useAuth.getState().status).toBe("anonymous"));
    await waitFor(() => expect(destroy).toHaveBeenCalled());
    expect(useCollab.getState().boardId).toBeNull();
    expect(useWorkspace.getState().boards.length).toBe(boardsBefore);
    expect(screen.queryByRole("button", { name: "계정" })).toBeNull();
  });
});
