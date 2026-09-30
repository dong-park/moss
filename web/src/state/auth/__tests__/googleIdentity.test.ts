import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  GoogleUnavailableError,
  requestGoogleIdToken,
  resetGoogleIdentityCache,
} from "../googleIdentity";

const GIS_SRC = "https://accounts.google.com/gsi/client";

function clearGis() {
  document
    .querySelectorAll(`script[src="${GIS_SRC}"]`)
    .forEach((node) => node.remove());
  delete (window as unknown as { google?: unknown }).google;
  resetGoogleIdentityCache();
}

function addLoadedScript() {
  const script = document.createElement("script");
  script.src = GIS_SRC;
  script.dataset.loaded = "1";
  document.head.appendChild(script);
}

function fakeGoogle(prompt: (cb?: (n: unknown) => void) => void, credential?: string) {
  (window as unknown as { google: unknown }).google = {
    accounts: {
      id: {
        initialize: ({ callback }: { callback: (r: { credential?: string }) => void }) => {
          if (credential) queueMicrotask(() => callback({ credential }));
        },
        prompt,
        renderButton: () => {},
      },
    },
  };
}

beforeEach(clearGis);
afterEach(clearGis);

describe("auth/googleIdentity", () => {
  test("스크립트 로드 실패 뒤 캐시가 남지 않아 다음 시도가 성공한다", async () => {
    const failed = requestGoogleIdToken("client");
    const script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    expect(script).not.toBeNull();
    script?.dispatchEvent(new Event("error"));
    await expect(failed).rejects.toBeInstanceOf(GoogleUnavailableError);

    // 두 번째 시도는 실패 promise를 재사용하지 않고 새로 로드한다.
    addLoadedScript();
    fakeGoogle(() => {}, "fresh-token");
    await expect(requestGoogleIdToken("client")).resolves.toBe("fresh-token");
  });

  test("One Tap을 닫으면 reject하고 다음 시도가 버튼 상태로 돌아올 수 있다", async () => {
    addLoadedScript();
    fakeGoogle((notification) =>
      notification?.({
        isDismissedMoment: () => true,
        isSkippedMoment: () => false,
        isNotDisplayed: () => false,
      }),
    );
    await expect(requestGoogleIdToken("client")).rejects.toBeInstanceOf(GoogleUnavailableError);
  });

  test("프롬프트가 응답하지 않으면 타임아웃으로 reject한다", async () => {
    addLoadedScript();
    fakeGoogle(() => {});
    await expect(
      requestGoogleIdToken("client", { timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(GoogleUnavailableError);
  });

  test("credential이 오면 토큰으로 resolve한다", async () => {
    addLoadedScript();
    fakeGoogle(() => {}, "id-token");
    await expect(requestGoogleIdToken("client")).resolves.toBe("id-token");
  });

  describe("Google 공식 버튼을 One Tap과 함께 띄운다", () => {
    function fakeCooldown() {
      let cb: ((r: { credential?: string }) => void) | undefined;
      const rendered: HTMLElement[] = [];
      (window as unknown as { google: unknown }).google = {
        accounts: {
          id: {
            initialize: ({ callback }: { callback: typeof cb }) => (cb = callback),
            prompt: (n?: (x: unknown) => void) =>
              n?.({ isNotDisplayed: () => true, isSkippedMoment: () => false, isDismissedMoment: () => false }),
            renderButton: (el: HTMLElement) => rendered.push(el),
          },
        },
      };
      return { press: (credential: string) => cb?.({ credential }), rendered };
    }
    const box = () => document.querySelector('[role="dialog"][aria-label="Google 로그인"]');

    test("버튼으로 받은 토큰으로 resolve하고 버튼을 치운다", async () => {
      addLoadedScript();
      const g = fakeCooldown();
      const token = requestGoogleIdToken("client");
      await Promise.resolve();
      await Promise.resolve();
      expect(g.rendered).toHaveLength(1);
      expect(box()).not.toBeNull();
      g.press("button-token");
      await expect(token).resolves.toBe("button-token");
      expect(box()).toBeNull();
    });

    test("닫기를 누르면 취소로 reject하고 버튼을 치운다", async () => {
      addLoadedScript();
      fakeCooldown();
      const token = requestGoogleIdToken("client");
      await Promise.resolve();
      await Promise.resolve();
      box()?.querySelector("button")?.click();
      await expect(token).rejects.toBeInstanceOf(GoogleUnavailableError);
      expect(box()).toBeNull();
    });
  });
});
