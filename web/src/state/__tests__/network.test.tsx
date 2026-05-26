import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
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
});
