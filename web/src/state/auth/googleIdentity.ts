/**
 * Google Identity Services (GIS) 로그인 — ID 토큰만 받아 온다.
 *
 * Ktor가 ID 토큰을 검증하므로 여기서는 서명을 다루지 않는다.
 * 실경로는 test에서 fake 주입으로 대체되며 결산에 갭으로 기록한다.
 */
const GIS_SRC = "https://accounts.google.com/gsi/client";

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
  }): void;
  prompt(onNotification?: (notification: GooglePromptNotification) => void): void;
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

let scriptPromise: Promise<void> | null = null;

/** 테스트 격리용 — 캐시된 스크립트 로드 promise를 버린다. */
export function resetGoogleIdentityCache(): void {
  scriptPromise = null;
}

function loadGis(): Promise<void> {
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
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      settle();
    };
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
    // One Tap을 닫거나 띄우지 못하면 콜백이 오지 않는다 — 여기서 정리해 버튼 상태로 돌린다.
    google.accounts.id.prompt((notification) => {
      if (
        notification?.isDismissedMoment?.() ||
        notification?.isSkippedMoment?.() ||
        notification?.isNotDisplayed?.()
      ) {
        finish(() => reject(new GoogleUnavailableError("Google 계정 확인을 취소했어요")));
      }
    });
  });
}
