import { act } from "@testing-library/react";
import { vi } from "vitest";
import { resetGoogleIdentityCache } from "@/state/auth/googleIdentity";

/** 가짜 `window.google`. 실제 Google 창은 단위 테스트로 못 띄우므로 받은 인자와 콜백만 본다. */
export const GIS_SRC_PART = "accounts.google.com/gsi/client";

type Callback = (response: { credential?: string }) => void;

export interface FakeGoogle {
  initialize: ReturnType<typeof vi.fn>;
  renderButton: ReturnType<typeof vi.fn>;
  prompt: ReturnType<typeof vi.fn>;
  /** 사용자가 계정을 골라 Google이 콜백을 부른 것처럼 한다. */
  press(token: string): void;
}

export function gisScripts(): HTMLScriptElement[] {
  return [...document.querySelectorAll<HTMLScriptElement>(`script[src*="${GIS_SRC_PART}"]`)];
}

/** `loaded=false`면 스크립트가 아직 안 붙은 상태로 둔다(오프라인·로드 실패 재현). */
export function installFakeGoogle({ loaded = true }: { loaded?: boolean } = {}): FakeGoogle {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "test-client");
  let callback: Callback | undefined;
  const fake: FakeGoogle = {
    initialize: vi.fn((cfg: { callback: Callback }) => {
      callback = cfg.callback;
    }),
    renderButton: vi.fn(),
    prompt: vi.fn(),
    press: (token) => act(() => callback?.({ credential: token })),
  };
  (window as unknown as { google: unknown }).google = {
    accounts: { id: { initialize: fake.initialize, renderButton: fake.renderButton, prompt: fake.prompt } },
  };
  if (loaded) addLoadedScript();
  return fake;
}

export function addLoadedScript(): void {
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client?hl=ko";
  script.dataset.loaded = "1";
  document.head.appendChild(script);
}

export function resetFakeGoogle(): void {
  gisScripts().forEach((node) => node.remove());
  delete (window as unknown as { google?: unknown }).google;
  resetGoogleIdentityCache();
  vi.unstubAllEnvs();
  setOnline(true);
}

/** 서버 가짜가 보는 Google ID 토큰. 메일 주소만 payload에 든다. */
export function fakeIdToken(email: string): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "none" })}.${b64({ email })}.sig`;
}

/** 칸을 재면 jsdom은 0을 준다 — 놓인 칸의 너비를 꾸민다. */
export function stubClientWidth(width: number): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width });
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, "clientWidth", original);
    else delete (HTMLElement.prototype as unknown as { clientWidth?: number }).clientWidth;
  };
}

export function setOnline(online: boolean): void {
  if (online) delete (navigator as unknown as { onLine?: boolean }).onLine;
  else Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
}

/** 연결 상태를 바꾸고 이벤트를 보낸다. */
export function goOnline(online: boolean): void {
  setOnline(online);
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
}

/** 끝나지 않는 fetch. 넘긴 signal이 abort되면 AbortError로 끝난다. */
export function hangingFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  );
}
