import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { LoginOnboarding } from "@/components/auth/LoginOnboarding";
import { configureAuth, resetAuthStore, useAuth } from "@/state/auth/store";
import { deleteAuthDatabase } from "@/state/auth/tokenStore";
import type { AuthApi } from "@/state/auth/api";
import { AuthRequestError } from "@/state/auth/api";
import type { AuthSession } from "@/state/auth/types";

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
    refresh: vi.fn(async () => fresh),
    previewInvite: vi.fn(),
    acceptInvite: vi.fn(),
    ...overrides,
  };
}

beforeEach(async () => {
  await deleteAuthDatabase();
  resetAuthStore();
});

afterEach(() => {
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
  test("소개·기능 3개·Google 버튼이 보인다", () => {
    configureAuth({ api: fakeApi(), googleIdToken: vi.fn() });
    mount();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("생각을 붙이면,\n연결이 보여요");
    expect(screen.getByRole("button", { name: "Google 계정으로 로그인" })).toBeTruthy();
  });

  test("로그인하면 authenticated가 된다 — 이동은 게이트·주소가 맡는다 (P1)", async () => {
    configureAuth({
      api: fakeApi(),
      googleIdToken: vi.fn(async () => "id-token"),
    });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "Google 계정으로 로그인" }));
    await waitFor(() => expect(useAuth.getState().status).toBe("authenticated"));
  });

  test("로그인에 실패하면 온보딩을 남긴다", async () => {
    configureAuth({
      api: fakeApi(),
      googleIdToken: vi.fn(async () => {
        throw new Error("popup 닫힘");
      }),
    });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "Google 계정으로 로그인" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Google 계정으로 로그인" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(useAuth.getState().status).not.toBe("authenticated");
  });
});

describe("AC-1·2·6 · 메일 폼", () => {
  test("메일로 계속 → 로그인 폼, Google 버튼은 남는다 (D11)", () => {
    configureAuth({ api: fakeApi(), googleIdToken: vi.fn() });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));

    expect(screen.getByLabelText("메일")).toBeTruthy();
    expect(screen.getByLabelText("비밀번호")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Google 계정으로 로그인" })).toBeTruthy();
    expect(screen.queryByLabelText("이름")).toBeNull();
  });

  test("처음이에요? 가입하기 → 가입 폼에 이름 칸이 생긴다", () => {
    configureAuth({ api: fakeApi(), googleIdToken: vi.fn() });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "처음이에요? 가입하기" }));

    expect(screen.getByLabelText("이름")).toBeTruthy();
    expect(screen.getByRole("button", { name: "가입하기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이미 계정이 있어요" })).toBeTruthy();
  });

  test("AC-6 · 가입 · 짧은 비밀번호는 보내기 전에 막고 api를 부르지 않는다", async () => {
    const api = fakeApi();
    configureAuth({ api, googleIdToken: vi.fn() });
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
    configureAuth({ api, googleIdToken: vi.fn() });
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
    configureAuth({ api, googleIdToken: vi.fn() });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "처음이에요? 가입하기" }));
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: " A@x.com " } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: " 동환 " } });
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    await waitFor(() => expect(useAuth.getState().status).toBe("authenticated"));
    expect(api.signup).toHaveBeenCalledWith("A@x.com", "secret123", "동환");
  });

  test("AC-5 · 중복 가입이면 서버 문구를 보여준다", async () => {
    const api = fakeApi({
      signup: vi.fn(async () => {
        throw new AuthRequestError("이미 가입된 메일이에요", 409);
      }),
    });
    configureAuth({ api, googleIdToken: vi.fn() });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "처음이에요? 가입하기" }));
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: "a@x.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "동환" } });
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByText("이미 가입된 메일이에요")).toBeTruthy();
    expect(useAuth.getState().status).not.toBe("authenticated");
  });

  test("6절 · 오프라인이면 버튼을 막고 안내를 띄운다", async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      configureAuth({ api: fakeApi(), googleIdToken: vi.fn() });
      mount();

      fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));

      expect(await screen.findByText("연결되면 다시 시도해 주세요")).toBeTruthy();
      expect(
        (screen.getByRole("button", { name: "로그인" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(
        (screen.getByRole("button", { name: "Google 계정으로 로그인" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    } finally {
      // jsdom의 onLine은 프로토타입에 있어 original이 undefined다 — 남긴 own 속성을 지운다.
      if (original) Object.defineProperty(navigator, "onLine", original);
      else delete (navigator as unknown as { onLine?: boolean }).onLine;
    }
  });

  test("AC-6 · 가입 · 이모지 4개 비밀번호는 코드포인트 4자라 보내기 전에 막는다", async () => {
    const api = fakeApi();
    configureAuth({ api, googleIdToken: vi.fn() });
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
    configureAuth({ api, googleIdToken: vi.fn() });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "처음이에요? 가입하기" }));
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: "a@x.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "secret123" } });
    const emojiName = "😀".repeat(21);
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: emojiName } });
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    await waitFor(() => expect(api.signup).toHaveBeenCalledWith("a@x.com", "secret123", emojiName));
  });

  test("AC-6 · 메일 형식 오류는 앱 안내를 띄우고 api를 부르지 않는다", async () => {
    const api = fakeApi();
    configureAuth({ api, googleIdToken: vi.fn() });
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
    configureAuth({ api, googleIdToken: vi.fn() });
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
