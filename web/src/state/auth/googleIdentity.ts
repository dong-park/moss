/**
 * Google Identity Services (GIS) 로그인 — ID 토큰만 받아 온다.
 *
 * Ktor가 ID 토큰을 검증하므로 여기서는 서명을 다루지 않는다.
 * 실경로는 test에서 fake 주입으로 대체되며 결산에 갭으로 기록한다.
 */
const GIS_SRC = "https://accounts.google.com/gsi/client?hl=ko";

interface GoogleCredentialResponse {
  credential?: string;
}

interface GooglePromptNotification {
  isNotDisplayed?(): boolean;
  isSkippedMoment?(): boolean;
  isDismissedMoment?(): boolean;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
  }): void;
  prompt(onNotification?: (notification: GooglePromptNotification) => void): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}

interface GoogleNamespace {
  accounts: { id: GoogleAccountsId };
}

export class GoogleUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleUnavailableError";
  }
}

/** 웹 클라이언트 ID가 없다. 스크립트를 받지 않고 이 오류로 끝난다. */
export class GoogleClientIdMissingError extends GoogleUnavailableError {
  constructor() {
    super("Google 클라이언트 ID가 없어요");
    this.name = "GoogleClientIdMissingError";
  }
}

let scriptPromise: Promise<void> | null = null;
let initialized = false;
/** 지금 그려진 칸 하나의 수신 함수. 칸이 없으면 null이고 그때 온 토큰은 버린다. */
let receiver: ((idToken: string) => void) | null = null;

/** 테스트 격리용 — 캐시된 스크립트 로드 promise와 설정 상태를 버린다. */
export function resetGoogleIdentityCache(): void {
  scriptPromise = null;
  initialized = false;
  receiver = null;
}

/** GIS 스크립트를 받는다. 실패하면 캐시하지 않아 다음 호출이 다시 받는다. */
export function loadGis(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new GoogleUnavailableError("브라우저가 아니에요"));
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing?.dataset.loaded === "1") {
      resolve();
      return;
    }
    const script = existing ?? document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => {
      // 실패한 promise를 영구 캐시하지 않는다 — 다음 시도가 스크립트를 다시 받는다.
      scriptPromise = null;
      script.remove();
      reject(new GoogleUnavailableError("Google 로그인을 불러오지 못했어요"));
    };
    if (!existing) document.head.appendChild(script);
  });
  return scriptPromise;
}

/** 브라우저 GIS를 띄우고 사용자가 고른 계정의 ID 토큰을 돌려준다. */
export async function requestGoogleIdToken(
  clientId: string | undefined = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  options: { timeoutMs?: number } = {},
): Promise<string> {
  if (!clientId) throw new GoogleUnavailableError("Google 클라이언트 ID가 없어요");
  await loadGis();
  const google = (window as unknown as { google?: GoogleNamespace }).google;
  if (!google?.accounts?.id) throw new GoogleUnavailableError("Google 로그인을 불러오지 못했어요");

  const timeoutMs = options.timeoutMs ?? 60_000;
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallback: HTMLElement | undefined;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fallback?.remove();
      settle();
    };
    const cancel = () =>
      finish(() => reject(new GoogleUnavailableError("Google 계정 확인을 취소했어요")));
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        finish(() => {
          if (response.credential) resolve(response.credential);
          else reject(new GoogleUnavailableError("Google 계정을 확인하지 못했어요"));
        });
      },
    });
    if (timeoutMs > 0) {
      timer = setTimeout(
        () => finish(() => reject(new GoogleUnavailableError("Google 로그인이 시간을 넘겼어요"))),
        timeoutMs,
      );
    }
    // One Tap 옆에 Google 공식 버튼을 처음부터 같이 띄운다. One Tap은 한 번 닫으면 쿨다운이 걸리고,
    // "못 띄웠다" 알림(isNotDisplayed·isSkippedMoment)은 FedCM 전환 뒤 오지 않는다 — 버튼은 둘 다 없다.
    // 어느 쪽을 눌러도 같은 callback으로 온다. One Tap을 직접 닫는 건 취소로 본다.
    fallback = showFallbackButton(google.accounts.id, cancel);
    google.accounts.id.prompt((notification) => {
      if (notification?.isDismissedMoment?.()) cancel();
    });
  });
}

/** 화면 위쪽 가운데에 Google 공식 로그인 버튼과 닫기를 띄운다. */
function showFallbackButton(id: GoogleAccountsId, onClose: () => void): HTMLElement {
  const box = document.createElement("div");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Google 로그인");
  box.style.cssText =
    "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
    "display:flex;align-items:center;gap:8px;padding:12px;border-radius:14px;" +
    "background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.18)";
  const slot = document.createElement("div");
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "닫기";
  close.style.cssText = "font-size:13px;color:#6e6e73;padding:4px 8px";
  close.addEventListener("click", onClose);
  box.append(slot, close);
  document.body.appendChild(box);
  id.renderButton(slot, { type: "standard", theme: "outline", size: "large", text: "continue_with" });
  return box;
}

const MAX_BUTTON_WIDTH = 400;

/**
 * Google 공식 버튼을 `el` 안에 그린다. 반환값은 칸을 떼는 함수다.
 * `initialize`는 페이지에 1번만 하고, 토큰은 지금 붙어 있는 칸 하나의 `onToken`으로 보낸다.
 * `prompt()`(One Tap)와 위쪽 상자는 쓰지 않는다.
 */
export async function attachGoogleButton(
  el: HTMLElement,
  options: {
    width: number;
    onToken: (idToken: string) => void;
    clientId?: string;
  },
): Promise<() => void> {
  const clientId = options.clientId ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new GoogleClientIdMissingError();
  await loadGis();
  const id = (window as unknown as { google?: GoogleNamespace }).google?.accounts?.id;
  if (!id) throw new GoogleUnavailableError("Google 로그인을 불러오지 못했어요");

  if (!initialized) {
    id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) receiver?.(response.credential);
      },
      ux_mode: "popup",
      auto_select: false,
    });
    initialized = true;
  }
  const onToken = options.onToken;
  receiver = onToken;
  id.renderButton(el, {
    type: "standard",
    theme: "filled_black",
    size: "large",
    shape: "rectangular",
    text: "continue_with",
    locale: "ko",
    width: Math.min(MAX_BUTTON_WIDTH, Math.round(options.width)),
  });
  return () => {
    if (receiver === onToken) receiver = null;
  };
}
