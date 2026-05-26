import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useQuotaWatcher } from "@/state/quota-watcher";
import { useStorage } from "@/state/storage";
import { useToasts } from "@/state/notifications";
import { resetDB } from "@/state/db/schema";

let originalStorage: PropertyDescriptor | undefined;
let estimateImpl: () => Promise<{ usage: number; quota: number }>;

function Probe() {
  useQuotaWatcher();
  return null;
}

function renderWithI18n() {
  return render(
    <I18nProvider locale="ko">
      <Probe />
    </I18nProvider>,
  );
}

beforeEach(() => {
  estimateImpl = async () => ({ usage: 100, quota: 1000 });
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(() => estimateImpl()),
      getDirectory: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
});

afterEach(async () => {
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useToasts.setState({ toasts: [] });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

describe("useQuotaWatcher thresholds", () => {
  it("pushes a calm toast once when reaching 80%", async () => {
    estimateImpl = async () => ({ usage: 820, quota: 1000 });
    await act(async () => {
      await useStorage.getState().init();
    });

    await act(async () => {
      renderWithI18n();
    });

    expect(useToasts.getState().toasts).toHaveLength(1);
    expect(useToasts.getState().toasts[0].tone).toBe("calm");
    expect(useStorage.getState().settings?.storageQuotaShown.at80).toBe(true);

    // 2번째로 refreshQuota를 더 호출해도 추가 토스트 안 뜸
    useToasts.setState({ toasts: [] });
    await act(async () => {
      await useStorage.getState().refreshQuota();
    });
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("pushes a warn toast at 95%", async () => {
    estimateImpl = async () => ({ usage: 960, quota: 1000 });
    await act(async () => {
      await useStorage.getState().init();
    });
    await act(async () => {
      renderWithI18n();
    });

    const toasts = useToasts.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].tone).toBe("warn");
    expect(toasts[0].duration).toBe(0);
    expect(useStorage.getState().settings?.storageQuotaShown.at95).toBe(true);
  });

  it("does not re-fire across sessions", async () => {
    estimateImpl = async () => ({ usage: 820, quota: 1000 });
    await act(async () => {
      await useStorage.getState().init();
    });
    await act(async () => {
      renderWithI18n();
    });
    expect(useStorage.getState().settings?.storageQuotaShown.at80).toBe(true);

    // 새 세션 시뮬레이션
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useToasts.setState({ toasts: [] });
    await act(async () => {
      await useStorage.getState().init();
    });
    await act(async () => {
      renderWithI18n();
    });
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
