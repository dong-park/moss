import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useOnlineStatus } from "@/state/network";

function Probe() {
  const online = useOnlineStatus();
  return <output data-testid="online">{String(online)}</output>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOnlineStatus", () => {
  it("reflects navigator.onLine on mount", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("online").textContent).toBe("false");
  });

  it("updates on online/offline events", () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("online").textContent).toBe("true");
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(getByTestId("online").textContent).toBe("false");
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(getByTestId("online").textContent).toBe("true");
  });

  it("첫 렌더는 navigator.onLine과 무관하게 true — SSR과 hydration이 같다", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    expect(renderToString(<Probe />)).toContain("true");
  });
});
