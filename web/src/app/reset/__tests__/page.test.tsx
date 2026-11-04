import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { I18nProvider } from "@/i18n/Provider";
import ResetPage from "@/app/reset/page";
import { AuthRequestError, realAuthApi } from "@/state/auth/api";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("token=raw-token") }));

beforeEach(() => {
  vi.spyOn(realAuthApi, "confirmPasswordReset").mockReset();
});

function mount() {
  return render(
    <I18nProvider locale="ko">
      <ResetPage />
    </I18nProvider>,
  );
}

describe("비밀번호 재설정 페이지", () => {
  test("새 비밀번호를 토큰과 함께 보내고 완료 문구를 보여 준다", async () => {
    vi.spyOn(realAuthApi, "confirmPasswordReset").mockResolvedValue(undefined);
    mount();
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "newpassword1" } });
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));
    expect(await screen.findByText("비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요")).toBeTruthy();
    expect(realAuthApi.confirmPasswordReset).toHaveBeenCalledWith("raw-token", "newpassword1");
  });

  test("짧은 비밀번호는 보내기 전에 막는다", async () => {
    const spy = vi.spyOn(realAuthApi, "confirmPasswordReset");
    mount();
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));
    expect(await screen.findByText("비밀번호는 8자 이상이에요")).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  test("서버가 거절하면 그 문구를 보여 준다", async () => {
    vi.spyOn(realAuthApi, "confirmPasswordReset").mockRejectedValue(
      new AuthRequestError("재설정 링크가 유효하지 않아요", 410, "gone"),
    );
    mount();
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "newpassword1" } });
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("재설정 링크가 유효하지 않아요"));
  });
});
