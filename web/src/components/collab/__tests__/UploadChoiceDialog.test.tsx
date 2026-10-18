import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { useAuth, type AuthSession } from "@/state/auth";
import { configureAuth, resetAuthDeps } from "@/state/auth/store";
import { getDB, resetDB, type Board } from "@/state/db/schema";
import { configureMembership, resetMembershipDeps } from "@/state/membership";
import { configureShare, resetShareStore, type ShareApi } from "@/state/share";
import { useStorage } from "@/state/storage";
import { UploadChoiceDialog } from "../UploadChoiceDialog";

const NOW = 1_700_000_000_000;

function makeToken(exp: number): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp })}.sig`;
}

const session: AuthSession = {
  accessToken: makeToken(NOW / 1000 + 600),
  refreshToken: makeToken(NOW / 1000 + 600),
  user: { id: "me", name: "동환", avatar: null },
};

function makeBoard(id: string, name: string): Board {
  return { id, name, isSystem: false, createdAt: NOW, updatedAt: NOW, lastOpenedAt: NOW };
}

let share: ReturnType<typeof vi.fn>;
let originalStorage: PropertyDescriptor | undefined;

beforeEach(async () => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
      getDirectory: vi.fn(async () => ({ removeEntry: vi.fn(async () => {}) })),
    },
    configurable: true,
    writable: true,
  });
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  resetShareStore();
  resetMembershipDeps();
  configureAuth({ now: () => NOW });
  share = vi.fn(async (id: string) => ({ id, name: id, role: "owner" as const, ownerName: "동환" }));
  const api = {
    share,
    myBoards: vi.fn(async () => []),
  } as unknown as ShareApi;
  configureShare({ api, onBoardShared: vi.fn() });
  configureMembership({ api, uploadDoc: vi.fn(async () => {}), notify: vi.fn() });
  useAuth.setState({ session, user: session.user, status: "authenticated", hydrated: true, hydrating: false });
  await useStorage.getState().init();
  await useStorage.getState().updateSettings({ ownerUserId: "me" });
  await getDB().boards.bulkPut([makeBoard("a", "기획"), makeBoard("b", "일기")]);
});

afterEach(async () => {
  useAuth.setState({ session: null, user: null, status: "anonymous" });
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  resetShareStore();
  resetMembershipDeps();
  resetAuthDeps();
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

function mount() {
  return render(
    <I18nProvider locale="ko">
      <UploadChoiceDialog />
    </I18nProvider>,
  );
}

describe("D1 · 서버에 올릴 보드 고르기", () => {
  it("아무것도 고르지 않은 채로 열리고, 고른 보드만 올린다", async () => {
    mount();
    const dialog = await screen.findByRole("dialog", { name: "서버에 올릴 보드를 골라 주세요" });
    expect(dialog).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => !b.checked)).toBe(true);
    expect((screen.getByRole("button", { name: "올리기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(share).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("기획"));
    fireEvent.click(screen.getByRole("button", { name: "올리기" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(share.mock.calls.map((c) => c[0])).toEqual(["a"]);
  });

  it("올리지 않고 계속하면 아무것도 올리지 않고 닫힌다", async () => {
    mount();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "올리지 않고 계속" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(share).not.toHaveBeenCalled();
  });

  it("다른 계정의 보드가 남은 기기에서는 열리지 않는다", async () => {
    await useStorage.getState().updateSettings({ ownerUserId: "someone-else" });
    mount();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(share).not.toHaveBeenCalled();
  });
});
