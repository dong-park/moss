import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthStore } from "@/state/auth";
import { activateBoardDoc, destroyBoardDocs } from "@/state/ydoc/activeDoc";
import type { CollabProviderConfig, CollabProviderFactory } from "../provider";
import { configureCollab, resetCollabStore, uploadBoardDoc } from "../store";

const NOW = 1_700_000_000_000;

function makeFactory() {
  const created: Array<{ config: CollabProviderConfig; connect: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
  const factory: CollabProviderFactory = {
    create(config) {
      const connect = vi.fn();
      const destroy = vi.fn();
      created.push({ config, connect, destroy });
      return { awareness: null, connect, disconnect: vi.fn(), destroy };
    },
  };
  return { factory, created };
}

function configure(factory: CollabProviderFactory, fetchBoardToken = vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 }))) {
  configureCollab({
    providerFactory: factory,
    fetchBoardToken,
    syncUrl: () => "ws://sync.test",
    now: () => NOW,
  });
  return { fetchBoardToken };
}

beforeEach(() => {
  resetAuthStore();
  resetCollabStore();
});

afterEach(async () => {
  resetAuthStore();
  resetCollabStore();
  await destroyBoardDocs();
});

describe("uploadBoardDoc", () => {
  it("보드 토큰을 받아 일회 provider를 붙이고 synced 뒤 끊는다", async () => {
    const { factory, created } = makeFactory();
    const { fetchBoardToken } = configure(factory);

    const pending = uploadBoardDoc("child", "access-1");
    await vi.waitFor(() => expect(created).toHaveLength(1));

    expect(fetchBoardToken).toHaveBeenCalledWith("child", "access-1");
    expect(created[0].config.name).toBe("child");
    expect(created[0].connect).toHaveBeenCalledTimes(1);

    created[0].config.onSynced?.();
    await pending;

    expect(created[0].destroy).toHaveBeenCalledTimes(1);
  });

  it("인증 실패·close로도 멈추고 provider를 정리한다", async () => {
    const { factory, created } = makeFactory();
    configure(factory);

    const pending = uploadBoardDoc("child", "access-1");
    await vi.waitFor(() => expect(created).toHaveLength(1));

    created[0].config.onClose(1000);
    await pending;

    expect(created[0].destroy).toHaveBeenCalledTimes(1);
  });

  it("현재 보고 있는 보드는 활성 연결을 건드리지 않는다", async () => {
    const { factory, created } = makeFactory();
    configure(factory);
    await activateBoardDoc("active");

    await uploadBoardDoc("active", "access-1");

    expect(created).toHaveLength(0);
  });
});
