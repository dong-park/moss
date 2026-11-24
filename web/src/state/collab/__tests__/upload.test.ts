import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthStore } from "@/state/auth";
import {
  activateBoardDoc,
  destroyBoardDocs,
  getActiveBoardDoc,
  isActiveBoard,
} from "@/state/ydoc/activeDoc";
import type { CollabProviderConfig, CollabProviderFactory } from "../provider";
import {
  configureCollab,
  resetCollabStore,
  CONFIRMED_UPLOAD_IDLE_TIMEOUT_MS,
  CONFIRMED_UPLOAD_MAX_MS,
  UPLOAD_SYNC_TIMEOUT_MS,
  uploadBoardDoc,
  uploadBoardDocConfirmed,
} from "../store";

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

    created[0].config.onClose(4403);
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

describe("uploadBoardDocConfirmed", () => {
  it("서버가 받았다고 답해야 끝난다 — synced만으로는 끝나지 않는다", async () => {
    const { factory, created } = makeFactory();
    configure(factory);

    let settled = false;
    const pending = uploadBoardDocConfirmed("child", "access-1").then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(created).toHaveLength(1));

    // step2를 받은 것뿐 — 내 변경을 서버가 받았다는 뜻이 아니다.
    created[0].config.onSynced?.();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(created[0].destroy).not.toHaveBeenCalled();

    created[0].config.onAcknowledged?.();
    await pending;

    expect(settled).toBe(true);
    expect(created[0].destroy).toHaveBeenCalledTimes(1);
  });

  it("지금 보고 있는 활성 보드도 일회 연결로 올리고 활성 문서는 닫지 않는다", async () => {
    const { factory, created } = makeFactory();
    configure(factory);
    await activateBoardDoc("active");

    const pending = uploadBoardDocConfirmed("active", "access-1");
    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0].config.name).toBe("active");
    created[0].config.onAcknowledged?.();
    await pending;

    expect(isActiveBoard("active")).toBe(true);
    expect(getActiveBoardDoc()).not.toBeNull();
  });

  it("서버가 끊으면(해제·한도·정원) 확인하지 못한 것으로 던지고 provider를 정리한다", async () => {
    for (const code of [4403, 4413, 4429]) {
      const { factory, created } = makeFactory();
      configure(factory);

      const pending = uploadBoardDocConfirmed("child", "access-1");
      const result = expect(pending).rejects.toMatchObject({
        name: "UploadNotConfirmedError",
        reason: "closed",
      });
      await vi.waitFor(() => expect(created).toHaveLength(1));
      created[0].config.onClose(code);
      await result;

      expect(created[0].destroy).toHaveBeenCalledTimes(1);
    }
  });

  it("일시 끊김(1006)은 실패가 아니다 — provider가 다시 붙기를 기다려 서버 확인을 받는다 (G4)", async () => {
    const { factory, created } = makeFactory();
    configure(factory);
    let settled = false;

    const pending = uploadBoardDocConfirmed("child", "access-1").then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(created).toHaveLength(1));

    created[0].config.onClose(1006);
    created[0].config.onStatus("disconnected");
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    expect(created[0].destroy).not.toHaveBeenCalled();

    // 재연결 뒤 서버가 받았다고 답한다.
    created[0].config.onStatus("connected");
    created[0].config.onAcknowledged?.();
    await pending;

    expect(settled).toBe(true);
    expect(created[0].destroy).toHaveBeenCalledTimes(1);
  });

  it("일시 끊김만 이어지다 대기 상한을 넘기면 거절이 아니라 시간 초과다 (G4)", async () => {
    const { factory, created } = makeFactory();
    configure(factory);
    await activateBoardDoc("flaky");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = uploadBoardDocConfirmed("flaky", "access-1");
      const result = expect(pending).rejects.toMatchObject({
        reason: "timeout",
        message: expect.stringContaining("응답이 늦어"),
      });
      for (let i = 0; i < 20 && created.length === 0; i++) await Promise.resolve();
      expect(created).toHaveLength(1);

      created[0].config.onClose(1006);
      await vi.advanceTimersByTimeAsync(CONFIRMED_UPLOAD_IDLE_TIMEOUT_MS);
      await result;
    } finally {
      vi.useRealTimers();
    }
  });

  it("인증 실패도 확인하지 못한 것이다", async () => {
    const { factory, created } = makeFactory();
    configure(factory);

    const pending = uploadBoardDocConfirmed("child", "access-1");
    const result = expect(pending).rejects.toMatchObject({ reason: "auth" });
    await vi.waitFor(() => expect(created).toHaveLength(1));
    created[0].config.onAuthenticationFailed("denied");
    await result;
  });

  it("시간이 넘으면 확인하지 못한 것으로 던진다 — 응답이 늦은 것이라 문구가 거절과 다르다", async () => {
    const { factory, created } = makeFactory();
    configure(factory);
    await activateBoardDoc("slow"); // 문서 로드는 실제 타이머 위에서 끝낸다.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = uploadBoardDocConfirmed("slow", "access-1");
      const result = expect(pending).rejects.toMatchObject({
        reason: "timeout",
        message: expect.stringContaining("응답이 늦어"),
      });
      // 토큰 mock과 문서 로드 마이크로태스크가 끝나 provider가 붙을 때까지 흘린다.
      for (let i = 0; i < 20 && created.length === 0; i++) await Promise.resolve();
      expect(created).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(CONFIRMED_UPLOAD_IDLE_TIMEOUT_MS);
      await result;

      expect(created[0].destroy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("파일함 업로드 상한(10초)에는 끊지 않는다 — 느린 회선의 큰 벽이 영영 실패하지 않게 (F5)", async () => {
    const { factory, created } = makeFactory();
    configure(factory);
    await activateBoardDoc("big");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let settled = false;
      const pending = uploadBoardDocConfirmed("big", "access-1").then(() => {
        settled = true;
      });
      for (let i = 0; i < 20 && created.length === 0; i++) await Promise.resolve();
      expect(created).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(UPLOAD_SYNC_TIMEOUT_MS * 3);
      expect(settled).toBe(false);
      expect(created[0].destroy).not.toHaveBeenCalled();

      created[0].config.onAcknowledged?.();
      await pending;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("진행(연결·sync)이 있으면 대기 시간이 다시 시작되고, 절대 상한은 넘지 않는다 (F5)", async () => {
    const { factory, created } = makeFactory();
    configure(factory);
    await activateBoardDoc("progress");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = uploadBoardDocConfirmed("progress", "access-1");
      const result = expect(pending).rejects.toMatchObject({ reason: "timeout" });
      for (let i = 0; i < 20 && created.length === 0; i++) await Promise.resolve();
      expect(created).toHaveLength(1);

      // 대기 시간이 거의 찼을 때 연결되면 거기서부터 다시 잰다.
      await vi.advanceTimersByTimeAsync(CONFIRMED_UPLOAD_IDLE_TIMEOUT_MS - 1_000);
      created[0].config.onStatus("connected");
      await vi.advanceTimersByTimeAsync(CONFIRMED_UPLOAD_IDLE_TIMEOUT_MS - 1_000);
      expect(created[0].destroy).not.toHaveBeenCalled();
      created[0].config.onSynced?.();
      await vi.advanceTimersByTimeAsync(CONFIRMED_UPLOAD_IDLE_TIMEOUT_MS - 1_000);
      expect(created[0].destroy).not.toHaveBeenCalled();

      // 진행이 계속돼도 절대 상한에서는 끊는다.
      await vi.advanceTimersByTimeAsync(CONFIRMED_UPLOAD_MAX_MS);
      await result;
      expect(created[0].destroy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("거절(연결 끊김·인증 실패)은 시간 초과와 다른 문구다", async () => {
    const { factory, created } = makeFactory();
    configure(factory);
    const pending = uploadBoardDocConfirmed("child", "access-1");
    const result = expect(pending).rejects.toMatchObject({
      reason: "closed",
      message: expect.stringContaining("받지 않았어요"),
    });
    await vi.waitFor(() => expect(created).toHaveLength(1));
    created[0].config.onClose(4403);
    await result;
  });

  it("기존 업로드는 끝나는 이유를 알리지 않는다 — 실패해도 던지지 않는다", async () => {
    const { factory, created } = makeFactory();
    configure(factory);

    const pending = uploadBoardDoc("child", "access-1");
    await vi.waitFor(() => expect(created).toHaveLength(1));
    created[0].config.onClose(4403);

    await expect(pending).resolves.toBeUndefined();
  });
});
