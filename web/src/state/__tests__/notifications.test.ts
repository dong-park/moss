import { afterEach, describe, expect, it, vi } from "vitest";
import { useToasts } from "@/state/notifications";

afterEach(() => {
  useToasts.setState({ toasts: [] });
  vi.useRealTimers();
});

describe("useToasts", () => {
  it("pushes and dismisses", () => {
    const id = useToasts.getState().push({ tone: "calm", title: "hi" });
    expect(useToasts.getState().toasts).toHaveLength(1);
    useToasts.getState().dismiss(id);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("auto-dismisses after duration", () => {
    vi.useFakeTimers();
    useToasts.getState().push({ tone: "calm", title: "bye", duration: 1000 });
    expect(useToasts.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(useToasts.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("duration:0 stays until manual dismiss", () => {
    vi.useFakeTimers();
    const id = useToasts.getState().push({
      tone: "warn",
      title: "stay",
      duration: 0,
    });
    vi.advanceTimersByTime(60_000);
    expect(useToasts.getState().toasts).toHaveLength(1);
    useToasts.getState().dismiss(id);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
