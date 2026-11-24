import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  attachGoogleSignIn,
  GoogleClientIdMissingError,
  GoogleUnavailableError,
  resetGoogleIdentityCache,
} from "../googleIdentity";

const GIS_SRC = "https://accounts.google.com/gsi/client?hl=ko";

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

beforeEach(clearGis);
afterEach(clearGis);

describe("auth/googleIdentity", () => {
  test("스크립트 로드 실패 뒤 캐시가 남지 않아 다음 시도가 성공한다", async () => {
    const el = document.createElement("div");
    const failed = attachGoogleSignIn(el, { clientId: "client", width: 300, onToken: () => {} });
    const script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    expect(script).not.toBeNull();
    script?.dispatchEvent(new Event("error"));
    await expect(failed).rejects.toBeInstanceOf(GoogleUnavailableError);

    // 두 번째 시도는 실패 promise를 재사용하지 않고 새로 로드한다.
    addLoadedScript();
    (window as unknown as { google: unknown }).google = {
      accounts: { id: { initialize: () => {}, renderButton: () => {} } },
    };
    await expect(
      attachGoogleSignIn(el, { clientId: "client", width: 300, onToken: () => {} }),
    ).resolves.toBeTypeOf("function");
  });
});

describe("auth/googleIdentity · 표준 버튼 흐름", () => {
  type Cb = (r: { credential?: string }) => void;
  function spyGoogle() {
    const calls = { initialize: [] as Record<string, unknown>[], renderButton: [] as [HTMLElement, Record<string, unknown>][], prompt: 0 };
    let cb: Cb | undefined;
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (cfg: Record<string, unknown>) => {
            calls.initialize.push(cfg);
            cb = cfg.callback as Cb;
          },
          prompt: () => {
            calls.prompt += 1;
          },
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => calls.renderButton.push([el, opts]),
        },
      },
    };
    return { calls, press: (credential: string) => cb?.({ credential }) };
  }

  test("initialize는 페이지에 1번이고 칸을 2번 붙여도 늘지 않는다", async () => {
    addLoadedScript();
    const g = spyGoogle();
    const a = document.createElement("div");
    const b = document.createElement("div");
    const detachA = await attachGoogleSignIn(a, { clientId: "cid", width: 300, onToken: () => {} });
    detachA();
    await attachGoogleSignIn(b, { clientId: "cid", width: 252, onToken: () => {} });
    expect(g.calls.initialize).toHaveLength(1);
    expect(g.calls.initialize[0]).toMatchObject({ client_id: "cid", ux_mode: "popup", auto_select: false });
  });

  test("renderButton 인자와 너비(300·252, 상한 400)를 그대로 넘긴다", async () => {
    addLoadedScript();
    const g = spyGoogle();
    const el = document.createElement("div");
    await attachGoogleSignIn(el, { clientId: "cid", width: 300, onToken: () => {} });
    await attachGoogleSignIn(el, { clientId: "cid", width: 252, onToken: () => {} });
    await attachGoogleSignIn(el, { clientId: "cid", width: 900, onToken: () => {} });
    const opts = g.calls.renderButton.map(([, o]) => o);
    expect(opts[0]).toEqual({
      type: "standard",
      theme: "filled_black",
      size: "large",
      shape: "rectangular",
      text: "continue_with",
      locale: "ko",
      width: 300,
    });
    expect(opts.map((o) => o.width)).toEqual([300, 252, 400]);
    expect(g.calls.renderButton[0][0]).toBe(el);
  });

  test("붙은 스크립트 src에 hl=ko가 있다", async () => {
    const pending = attachGoogleSignIn(document.createElement("div"), { clientId: "cid", width: 300, onToken: () => {} });
    const script = document.querySelector<HTMLScriptElement>("script[src*='accounts.google.com/gsi/client']");
    expect(script?.src).toContain("hl=ko");
    spyGoogle();
    script?.onload?.(new Event("load"));
    await pending;
  });

  test("prompt를 부르지 않고 위쪽 상자도 만들지 않는다", async () => {
    addLoadedScript();
    const g = spyGoogle();
    await attachGoogleSignIn(document.createElement("div"), { clientId: "cid", width: 300, onToken: () => {} });
    expect(g.calls.prompt).toBe(0);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  });

  test("콜백 토큰은 지금 붙은 칸의 수신 함수로 가고 칸을 뗀 뒤엔 버려진다", async () => {
    addLoadedScript();
    const g = spyGoogle();
    const first = vi.fn();
    const second = vi.fn();
    const detach1 = await attachGoogleSignIn(document.createElement("div"), { clientId: "cid", width: 300, onToken: first });
    detach1();
    await attachGoogleSignIn(document.createElement("div"), { clientId: "cid", width: 300, onToken: second });
    g.press("t1");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("t1");
    // 옛 칸의 떼기가 새 칸의 수신을 지우지 않는다.
    detach1();
    g.press("t2");
    expect(second).toHaveBeenCalledTimes(2);
    const detach2 = await attachGoogleSignIn(document.createElement("div"), { clientId: "cid", width: 300, onToken: second });
    detach2();
    g.press("t3");
    expect(second).toHaveBeenCalledTimes(2);
  });

  test("클라이언트 ID가 없으면 스크립트를 받지 않고 구분되는 오류로 끝난다", async () => {
    await expect(
      attachGoogleSignIn(document.createElement("div"), { clientId: "", width: 300, onToken: () => {} }),
    ).rejects.toBeInstanceOf(GoogleClientIdMissingError);
    expect(document.querySelector("script[src*='gsi/client']")).toBeNull();
  });
});
