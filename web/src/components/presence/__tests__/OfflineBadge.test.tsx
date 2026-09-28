import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { OfflineBadge } from "../OfflineBadge";
import { resetCollabStore, useCollab } from "@/state/collab";

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
  });
}

beforeEach(() => {
  resetCollabStore();
  setOnline(true);
});

afterEach(() => {
  resetCollabStore();
});

describe("OfflineBadge (AC-10)", () => {
  it("공유 세션 중 오프라인이면 표시한다", () => {
    setOnline(false);
    useCollab.setState({ boardId: "b1" });
    render(
      <I18nProvider locale="ko">
        <OfflineBadge />
      </I18nProvider>,
    );
    expect(screen.getByTestId("offline-badge")).toBeTruthy();
  });

  it("온라인이면 숨긴다", () => {
    useCollab.setState({ boardId: "b1" });
    render(
      <I18nProvider locale="ko">
        <OfflineBadge />
      </I18nProvider>,
    );
    expect(screen.queryByTestId("offline-badge")).toBeNull();
  });

  it("공유 세션이 없으면 오프라인이어도 숨긴다", () => {
    setOnline(false);
    render(
      <I18nProvider locale="ko">
        <OfflineBadge />
      </I18nProvider>,
    );
    expect(screen.queryByTestId("offline-badge")).toBeNull();
  });

  it("offline 이벤트를 받으면 나타난다", () => {
    useCollab.setState({ boardId: "b1" });
    render(
      <I18nProvider locale="ko">
        <OfflineBadge />
      </I18nProvider>,
    );
    expect(screen.queryByTestId("offline-badge")).toBeNull();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByTestId("offline-badge")).toBeTruthy();
  });
});
