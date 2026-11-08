import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { LoginOnboarding } from "@/components/auth/LoginOnboarding";
import { configureAuth, resetAuthStore, useAuth } from "@/state/auth/store";
import { deleteAuthDatabase } from "@/state/auth/tokenStore";
import type { AuthApi } from "@/state/auth/api";
import { AuthRequestError } from "@/state/auth/api";
import type { AuthSession } from "@/state/auth/types";
import {
  fakeIdToken,
  gisScripts,
  goOnline,
  hangingFetch,
  installFakeGoogle,
  resetFakeGoogle,
  stubClientWidth,
  type FakeGoogle,
} from "./fakeGoogle";

const fresh: AuthSession = {
  accessToken: "a.b.c",
  refreshToken: "a.b.c",
  user: { id: "u1", name: "동환", avatar: null },
};

function fakeApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    googleLogin: vi.fn(async () => fresh),
    signup: vi.fn(async () => fresh),
    login: vi.fn(async () => fresh),
    requestPasswordReset: vi.fn(async () => {}),
    confirmPasswordReset: vi.fn(async () => undefined),
    refresh: vi.fn(async () => fresh),
    logout: vi.fn(async () => undefined),
    previewInvite: vi.fn(),
    acceptInvite: vi.fn(),
    ...overrides,
  };
}

let google: FakeGoogle;

beforeEach(async () => {
  google = installFakeGoogle();
  vi.stubEnv("NEXT_PUBLIC_MOSS_TERMS_VERSION", "v1");
  await deleteAuthDatabase();
  resetAuthStore();
});

afterEach(() => {
  resetFakeGoogle();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetAuthStore();
});

function mount() {
  return render(
    <I18nProvider locale="ko">
      <LoginOnboarding />
    </I18nProvider>,
  );
}

describe("AC-4 · 로그인 온보딩", () => {
  test("소개와 Google 칸이 보인다", async () => {
    configureAuth({ api: fakeApi() });
    mount();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("생각을 붙이면,\n연결이 보여요");
    expect(screen.getByTestId("google-slot")).toBeTruthy();
    await waitFor(() => expect(google.renderButton).toHaveBeenCalledTimes(1));
  });
});

describe("AC-1·2·6 · 메일 폼", () => {
  test("메일로 계속 → 로그인 폼, Google 버튼은 남는다 (D11)", () => {
    configureAuth({ api: fakeApi() });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));

    expect(screen.getByLabelText("메일")).toBeTruthy();
    expect(screen.getByLabelText("비밀번호")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(screen.getByTestId("google-slot")).toBeTruthy();
    expect(screen.queryByLabelText("이름")).toBeNull();
  });

  test("처음이에요? 가입하기 → 가입 폼에 이름 칸이 생긴다", () => {
    configureAuth({ api: fakeApi() });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "처음이에요? 가입하기" }));

    expect(screen.getByLabelText("이름")).toBeTruthy();
    expect(screen.getByRole("button", { name: "가입하기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이미 계정이 있어요" })).toBeTruthy();
  });

  test("AC-6 · 가입 · 짧은 비밀번호는 보내기 전에 막고 api를 부르지 않는다", async () => {
    const api = fakeApi();
    configureAuth({ api });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "처음이에요? 가입하기" }));
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "동환" } });
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: "a@x.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByText("비밀번호는 8자 이상이에요")).toBeTruthy();
    expect(api.signup).not.toHaveBeenCalled();
  });

  test("로그인은 가입 최소 길이를 보지 않고 빈 비밀번호만 막는다", async () => {
    const api = fakeApi();
    configureAuth({ api });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: "a@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(await screen.findByText("비밀번호를 입력해 주세요")).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(api.login).toHaveBeenCalled());
  });

  test("AC-1 · 가입은 trim한 값을 넘기고 로그인 상태가 된다", async () => {
    const api = fakeApi();
    configureAuth({ api });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "처음이에요? 가입하기" }));
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: " A@x.com " } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: " 동환 " } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    await waitFor(() => expect(useAuth.getState().status).toBe("authenticated"));
    expect(api.signup).toHaveBeenCalledWith("A@x.com", "secret123", "동환", "v1");
  });

  test("동의 체크 없이 가입하면 api를 부르지 않고 거절 문구를 보여 준다", async () => {
    const api = fakeApi();
    configureAuth({ api });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "처음이에요? 가입하기" }));
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: "a@x.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "동환" } });
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByText("약관에 동의해야 가입할 수 있어요")).toBeTruthy();
    expect(api.signup).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "이용약관" }).getAttribute("href")).toBe("/legal/terms");
  });

  test("AC-5 · 중복 가입이면 서버 문구를 보여준다", async () => {
    const api = fakeApi({
      signup: vi.fn(async () => {
        throw new AuthRequestError("이미 가입된 메일이에요", 409);
      }),
    });
    configureAuth({ api });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "처음이에요? 가입하기" }));
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: "a@x.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "동환" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByText("이미 가입된 메일이에요")).toBeTruthy();
    expect(useAuth.getState().status).not.toBe("authenticated");
  });

  test("6절 · 오프라인이면 버튼을 막고 안내를 띄운다", async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      configureAuth({ api: fakeApi() });
      mount();

      fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));

      expect(await screen.findByText("연결되면 다시 시도해 주세요")).toBeTruthy();
      expect(
        (screen.getByRole("button", { name: "로그인" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(screen.getByTestId("google-slot-cover")).toBeTruthy();
    } finally {
      // jsdom의 onLine은 프로토타입에 있어 original이 undefined다 — 남긴 own 속성을 지운다.
      if (original) Object.defineProperty(navigator, "onLine", original);
      else delete (navigator as unknown as { onLine?: boolean }).onLine;
    }
  });

  test("AC-6 · 가입 · 이모지 4개 비밀번호는 코드포인트 4자라 보내기 전에 막는다", async () => {
    const api = fakeApi();
    configureAuth({ api });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "처음이에요? 가입하기" }));
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "동환" } });
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: "a@x.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "😀😀😀😀" } });
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByText("비밀번호는 8자 이상이에요")).toBeTruthy();
    expect(api.signup).not.toHaveBeenCalled();
  });

  test("AC-6 · 이모지 21자 이름은 UTF-16 길이가 아니라 코드포인트로 봐 통과한다", async () => {
    const api = fakeApi();
    configureAuth({ api });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "처음이에요? 가입하기" }));
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: "a@x.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "secret123" } });
    const emojiName = "😀".repeat(21);
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: emojiName } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    await waitFor(() => expect(api.signup).toHaveBeenCalledWith("a@x.com", "secret123", emojiName, "v1"));
  });

  test("AC-6 · 메일 형식 오류는 앱 안내를 띄우고 api를 부르지 않는다", async () => {
    const api = fakeApi();
    configureAuth({ api });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByText("메일 주소를 확인해 주세요")).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();
  });

  test("제출하면 앞선 오류 안내를 지운다", async () => {
    const api = fakeApi();
    configureAuth({ api });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(await screen.findByText("메일 주소를 확인해 주세요")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("메일"), { target: { value: "a@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith("a@x.com", "secret123"));
    expect(screen.queryByText("메일 주소를 확인해 주세요")).toBeNull();
  });
});

async function ready(): Promise<void> {
  await waitFor(() => expect(google.renderButton).toHaveBeenCalled());
}

function openMailLogin(): void {
  fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
}

function submitMail(): void {
  fireEvent.change(screen.getByLabelText("메일"), { target: { value: "a@x.com" } });
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "secret123" } });
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
}

const TOKEN = fakeIdToken("new@x.com");

describe("Google 칸 · 표준 버튼 흐름 (T-3)", () => {
  test("T1 · 카드 안에 Google 버튼이 그려지고 prompt와 위쪽 상자는 없다", async () => {
    configureAuth({ api: fakeApi() });
    mount();
    await ready();
    expect(google.prompt).not.toHaveBeenCalled();
    expect(google.renderButton.mock.calls[0][0]).toBe(screen.getByTestId("google-slot").firstElementChild);
    // 카드 자체의 dialog 하나뿐이다.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  test("T2 · 칸을 잰 너비를 renderButton에 넘긴다(300·252)", async () => {
    for (const width of [300, 252]) {
      google.renderButton.mockClear();
      const restore = stubClientWidth(width);
      configureAuth({ api: fakeApi() });
      const view = mount();
      await ready();
      expect(google.renderButton.mock.calls[0][1]).toMatchObject({ width, theme: "filled_black", locale: "ko" });
      view.unmount();
      restore();
    }
    // 칸을 지웠다 다시 그려도 initialize는 1번이다.
    expect(google.initialize).toHaveBeenCalledTimes(1);
  });

  test("T3 · 기존 계정은 계정을 1번 고르면 동의 없이 로그인되고 약관 체크가 없다", async () => {
    const api = fakeApi();
    configureAuth({ api });
    mount();
    await ready();

    google.press(TOKEN);
    await waitFor(() => expect(useAuth.getState().status).toBe("authenticated"));
    expect(api.googleLogin).toHaveBeenCalledTimes(1);
    expect(api.googleLogin).toHaveBeenCalledWith(TOKEN);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  test("T12 · 버튼 클릭만 있고 토큰이 안 오면 칸은 가려지지 않고 오류가 없다", async () => {
    configureAuth({ api: fakeApi() });
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("google-slot").firstElementChild as Element);
    expect(screen.queryByTestId("google-slot-cover")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("T13 · 온라인에서 스크립트를 못 받으면 문구·다시 시도·메일 길이 남는다", async () => {
    resetFakeGoogle();
    installFakeGoogle({ loaded: false });
    configureAuth({ api: fakeApi() });
    mount();
    await waitFor(() => expect(gisScripts()).toHaveLength(1));
    act(() => {
      gisScripts()[0].dispatchEvent(new Event("error"));
    });
    expect(await screen.findByText("Google 로그인을 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "메일로 계속" })).toBeTruthy();

    // 다시 시도는 스크립트를 새로 받는다.
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(gisScripts()).toHaveLength(1));
    expect(screen.queryByText("Google 로그인을 불러오지 못했어요")).toBeNull();
  });

  test("T14 · 오프라인으로 열면 오프라인 안내 하나와 가려진 칸만 보이고 스크립트는 받지 않는다", async () => {
    resetFakeGoogle();
    installFakeGoogle({ loaded: false });
    goOnline(false);
    configureAuth({ api: fakeApi() });
    mount();
    expect(await screen.findAllByText("연결되면 다시 시도해 주세요")).toHaveLength(1);
    expect(screen.getByTestId("google-slot-cover")).toBeTruthy();
    expect(screen.queryByText("Google 로그인을 불러오지 못했어요")).toBeNull();
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(screen.getByRole("button", { name: "메일로 계속" })).toBeTruthy();
    expect(gisScripts()).toHaveLength(0);
  });

  test("T20 · 오프라인으로 열었다가 연결이 돌아오면 스크립트를 1번 받고 버튼이 뜬다", async () => {
    resetFakeGoogle();
    const g = installFakeGoogle({ loaded: false });
    goOnline(false);
    configureAuth({ api: fakeApi() });
    mount();
    await screen.findByTestId("google-slot-cover");

    goOnline(true);
    await waitFor(() => expect(gisScripts()).toHaveLength(1));
    act(() => {
      gisScripts()[0].onload?.(new Event("load"));
    });
    await waitFor(() => expect(g.renderButton).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("google-slot-cover")).toBeNull();
    expect(screen.queryByText("연결되면 다시 시도해 주세요")).toBeNull();
  });

  test("T18 · 클라이언트 ID가 없으면 문구를 보이고 스크립트는 붙지 않는다", async () => {
    resetFakeGoogle();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    configureAuth({ api: fakeApi() });
    mount();
    expect(screen.getByText("Google 클라이언트 ID가 없어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "메일로 계속" })).toBeTruthy();
    expect(gisScripts()).toHaveLength(0);
  });

  test("T19 · 서버가 15초 동안 답하지 않으면 문구를 보이고 버튼을 되돌린다", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await ready();
    vi.useFakeTimers();
    google.press(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("google-slot-cover")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByText("잠시 뒤 다시 시도해 주세요")).toBeTruthy();
    expect(screen.queryByTestId("google-slot-cover")).toBeNull();
  });

  test("T21 · Google 요청 중에는 칸이 가려지고 토큰을 1번 더 받아도 메일을 제출해도 요청은 1번이다", async () => {
    const googleLogin = vi.fn(() => new Promise<AuthSession>(() => {}));
    const api = fakeApi({ googleLogin });
    configureAuth({ api });
    mount();
    await ready();
    openMailLogin();

    google.press(TOKEN);
    expect(screen.getByTestId("google-slot-cover")).toBeTruthy();
    google.press(fakeIdToken("other@x.com"));
    submitMail();
    expect((screen.getByRole("button", { name: "로그인" }) as HTMLButtonElement).disabled).toBe(true);
    expect(googleLogin).toHaveBeenCalledTimes(1);
    expect(api.login).not.toHaveBeenCalled();
  });

  test("T22 · Google 칸이 사라진 뒤 온 토큰은 버린다", async () => {
    const api = fakeApi();
    configureAuth({ api });
    const view = mount();
    await ready();
    view.unmount();
    google.press(TOKEN);
    expect(api.googleLogin).not.toHaveBeenCalled();
  });

  test("T25 · 메일 요청 중에는 칸이 가려지고 온 토큰은 버린다", async () => {
    const login = vi.fn(() => new Promise<AuthSession>(() => {}));
    const api = fakeApi({ login });
    configureAuth({ api });
    mount();
    await ready();
    openMailLogin();
    submitMail();
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId("google-slot-cover")).toBeTruthy();
    google.press(TOKEN);
    expect(api.googleLogin).not.toHaveBeenCalled();
  });

  test("오프라인 덮개가 씌워진 동안 온 토큰은 버린다", async () => {
    const api = fakeApi();
    configureAuth({ api });
    mount();
    await ready();
    goOnline(false);
    expect(screen.getByTestId("google-slot-cover")).toBeTruthy();
    google.press(TOKEN);
    expect(api.googleLogin).not.toHaveBeenCalled();
  });

  test("T23 첫 길 · 확인 중 연결이 끊긴 뒤 서버 오류로 버튼 단계에 오면 칸이 가려진다", async () => {
    let fail: (e: unknown) => void = () => {};
    const googleLogin = vi.fn(() => new Promise<AuthSession>((_res, rej) => (fail = rej)));
    configureAuth({ api: fakeApi({ googleLogin }) });
    mount();
    await ready();
    google.press(TOKEN);
    goOnline(false);
    await act(async () => fail(new AuthRequestError("", 500)));
    expect(screen.getByTestId("google-slot-cover")).toBeTruthy();
    expect(screen.getAllByText("연결되면 다시 시도해 주세요")).toHaveLength(1);
  });
});

const consentError = () => new AuthRequestError("약관에 동의해야 가입할 수 있어요", 400, "consent_required");

/** 첫 요청은 consent_required로 거절하고 이어지는 요청은 `next`로 답하는 서버 가짜. */
function signupApi(next: () => Promise<AuthSession>) {
  const googleLogin = vi.fn().mockRejectedValueOnce(consentError()).mockImplementation(next);
  return { googleLogin, api: fakeApi({ googleLogin }) };
}

/** 처음 쓰는 계정으로 가입 마무리 단계까지 간다. */
async function reachFinish(): Promise<void> {
  mount();
  await ready();
  google.press(TOKEN);
  await screen.findByRole("button", { name: "동의하고 시작하기" });
}

describe("처음 온 계정의 가입 마무리 (T-4)", () => {
  test("T4 · 고르면 메일 주소·약관 체크·동의 버튼·다른 계정으로가 보이고 메일 길은 숨는다", async () => {
    configureAuth({ api: signupApi(async () => fresh).api });
    await reachFinish();
    expect(screen.getByText("new@x.com")).toBeTruthy();
    expect(screen.getByRole("checkbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다른 계정으로" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "메일로 계속" })).toBeNull();
    expect(screen.queryByLabelText("메일")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("google-slot")).toBeNull();
  });

  test("T5 · 동의하고 시작하기 1번으로 같은 토큰을 동의와 함께 다시 보내 가입이 끝난다", async () => {
    const { googleLogin, api } = signupApi(async () => fresh);
    configureAuth({ api });
    await reachFinish();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 시작하기" }));

    await waitFor(() => expect(useAuth.getState().status).toBe("authenticated"));
    expect(googleLogin).toHaveBeenNthCalledWith(1, TOKEN);
    expect(googleLogin).toHaveBeenNthCalledWith(2, TOKEN, "v1");
    expect(googleLogin).toHaveBeenCalledTimes(2);
    // Google 창은 처음 1번만 열렸다.
    expect(google.initialize).toHaveBeenCalledTimes(1);
    expect(google.renderButton).toHaveBeenCalledTimes(1);
  });

  test("T6 · 체크 없이 누르면 동의 안내만 뜨고 요청은 늘지 않는다", async () => {
    const { googleLogin, api } = signupApi(async () => fresh);
    configureAuth({ api });
    await reachFinish();
    fireEvent.click(screen.getByRole("button", { name: "동의하고 시작하기" }));
    expect(screen.getByText("약관에 동의해야 가입할 수 있어요")).toBeTruthy();
    expect(googleLogin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "동의하고 시작하기" })).toBeTruthy();
  });

  test("T7 · 다른 계정으로를 누르면 처음 단계로 돌아가 다른 토큰으로 진행한다", async () => {
    const { googleLogin, api } = signupApi(async () => fresh);
    configureAuth({ api });
    await reachFinish();
    fireEvent.click(screen.getByRole("button", { name: "다른 계정으로" }));
    expect(screen.getByTestId("google-slot")).toBeTruthy();
    expect(screen.getByRole("button", { name: "메일로 계속" })).toBeTruthy();
    expect(screen.queryByTestId("google-slot-cover")).toBeNull();

    await waitFor(() => expect(google.renderButton).toHaveBeenCalledTimes(2));
    const other = fakeIdToken("old@x.com");
    google.press(other);
    await waitFor(() => expect(useAuth.getState().status).toBe("authenticated"));
    expect(googleLogin).toHaveBeenNthCalledWith(2, other);
  });

  test("T8 · 웹 약관 버전이 비면 닫힘 문구 하나만 뜨고 요청은 1번에서 멈춘다", async () => {
    vi.stubEnv("NEXT_PUBLIC_MOSS_TERMS_VERSION", "");
    const { googleLogin, api } = signupApi(async () => fresh);
    configureAuth({ api });
    mount();
    await ready();
    google.press(TOKEN);
    expect(await screen.findByText("지금은 새 계정을 받을 수 없어요")).toBeTruthy();
    expect(screen.queryByText(/새로고침한 뒤/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "동의하고 시작하기" })).toBeNull();
    expect(screen.getByRole("button", { name: "다른 계정으로" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "메일로 계속" })).toBeNull();
    expect(googleLogin).toHaveBeenCalledTimes(1);
  });

  test("T8 · 서버가 가입 닫힘(503)을 줘도 같은 닫힘 화면이다", async () => {
    const googleLogin = vi.fn().mockRejectedValue(new AuthRequestError("지금은 새 계정을 받을 수 없어요", 503, "signup_closed"));
    configureAuth({ api: fakeApi({ googleLogin }) });
    mount();
    await ready();
    google.press(TOKEN);
    expect(await screen.findByText("지금은 새 계정을 받을 수 없어요")).toBeTruthy();
    expect(googleLogin).toHaveBeenCalledTimes(1);
  });

  test("T9 · 동의했는데 버전이 다르면 약관 어긋남 문구 하나만 남고 자동 재요청은 없다", async () => {
    const { googleLogin, api } = signupApi(async () => {
      throw consentError();
    });
    configureAuth({ api });
    await reachFinish();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 시작하기" }));

    expect(await screen.findByText("약관이 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요")).toBeTruthy();
    expect(screen.queryByText("지금은 새 계정을 받을 수 없어요")).toBeNull();
    expect(screen.queryByRole("button", { name: "동의하고 시작하기" })).toBeNull();
    expect(screen.getByRole("button", { name: "다른 계정으로" })).toBeTruthy();
    expect(googleLogin).toHaveBeenCalledTimes(2);
  });

  test("T10 · 가입 보내는 중 401이면 처음 단계로 돌아가 다시 고르게 한다", async () => {
    const { api } = signupApi(async () => {
      throw new AuthRequestError("구글 로그인을 확인할 수 없어요", 401, "unauthorized");
    });
    configureAuth({ api });
    await reachFinish();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 시작하기" }));

    expect(await screen.findByText("Google 확인 시간이 지났어요. 다시 골라 주세요")).toBeTruthy();
    expect(screen.getByTestId("google-slot")).toBeTruthy();
    expect(screen.queryByTestId("google-slot-cover")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  test("T11 · 가입 보내는 중 15초 동안 답이 없으면 가입 마무리에 남고 Google 창 없이 다시 보낸다", async () => {
    const hanging = hangingFetch();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "consent_required", message: "약관에 동의해야 가입할 수 있어요" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockImplementation(hanging);
    vi.stubGlobal("fetch", fetchMock);
    await reachFinish();
    fireEvent.click(screen.getByRole("checkbox"));
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "동의하고 시작하기" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByText("잠시 뒤 다시 시도해 주세요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "동의하고 시작하기" })).toBeTruthy();
    expect(screen.getByText("new@x.com")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "동의하고 시작하기" }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = fetchMock.mock.calls.slice(1).map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies[0]).toEqual({ idToken: TOKEN, termsAccepted: true, termsVersion: "v1" });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(google.renderButton).toHaveBeenCalledTimes(1);
  });

  test("T24 · 가입 마무리에서 오프라인이 되면 동의 버튼만 막히고 돌아오면 같은 토큰으로 1번 보낸다", async () => {
    const { googleLogin, api } = signupApi(async () => fresh);
    configureAuth({ api });
    await reachFinish();
    fireEvent.click(screen.getByRole("checkbox"));

    goOnline(false);
    const start = screen.getByRole("button", { name: "동의하고 시작하기" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.click(start);
    expect(screen.getAllByText("연결되면 다시 시도해 주세요")).toHaveLength(1);
    expect(screen.getByText("new@x.com")).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(googleLogin).toHaveBeenCalledTimes(1);

    goOnline(true);
    fireEvent.click(screen.getByRole("button", { name: "동의하고 시작하기" }));
    await waitFor(() => expect(useAuth.getState().status).toBe("authenticated"));
    expect(googleLogin).toHaveBeenNthCalledWith(2, TOKEN, "v1");
    expect(google.renderButton).toHaveBeenCalledTimes(1);
  });

  test("T26 · 동의하고 시작하기를 두 번 눌러도 요청은 1번이고 다른 계정으로도 막힌다", async () => {
    const { googleLogin, api } = signupApi(() => new Promise<AuthSession>(() => {}));
    configureAuth({ api });
    await reachFinish();
    fireEvent.click(screen.getByRole("checkbox"));
    const start = screen.getByRole("button", { name: "동의하고 시작하기" });
    fireEvent.click(start);
    fireEvent.click(start);

    expect((start as HTMLButtonElement).disabled).toBe(true);
    const other = screen.getByRole("button", { name: "다른 계정으로" }) as HTMLButtonElement;
    expect(other.disabled).toBe(true);
    fireEvent.click(other);
    expect(screen.getByRole("checkbox")).toBeTruthy();
    expect(googleLogin).toHaveBeenCalledTimes(2); // 확인 중 1번 + 가입 보내기 1번
  });

  describe("T23 나머지 세 길 · 오프라인에서 다른 계정으로를 누르면 칸이 가려진다", () => {
    test("가입 마무리", async () => {
      configureAuth({ api: signupApi(async () => fresh).api });
      await reachFinish();
      goOnline(false);
      fireEvent.click(screen.getByRole("button", { name: "다른 계정으로" }));
      expect(screen.getByTestId("google-slot-cover")).toBeTruthy();
      expect(screen.getAllByText("연결되면 다시 시도해 주세요")).toHaveLength(1);
    });

    test("가입 닫힘", async () => {
      vi.stubEnv("NEXT_PUBLIC_MOSS_TERMS_VERSION", "");
      configureAuth({ api: signupApi(async () => fresh).api });
      mount();
      await ready();
      google.press(TOKEN);
      await screen.findByText("지금은 새 계정을 받을 수 없어요");
      goOnline(false);
      fireEvent.click(screen.getByRole("button", { name: "다른 계정으로" }));
      expect(screen.getByTestId("google-slot-cover")).toBeTruthy();
    });

    test("약관 어긋남", async () => {
      configureAuth({
        api: signupApi(async () => {
          throw consentError();
        }).api,
      });
      await reachFinish();
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: "동의하고 시작하기" }));
      await screen.findByText(/약관이 바뀌었어요/);
      goOnline(false);
      fireEvent.click(screen.getByRole("button", { name: "다른 계정으로" }));
      expect(screen.getByTestId("google-slot-cover")).toBeTruthy();
    });
  });
});
