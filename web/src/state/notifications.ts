"use client";

import { create } from "zustand";

export type ToastTone = "calm" | "warn";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
  /** ms. 0이면 자동 dismiss 없음. 기본 3000. */
  duration?: number;
  /**
   * 토스트 우측의 CTA. 클릭 시 onClick 실행 후 토스트는 자동 dismiss.
   * 사용 예: FEAT-home AC-3의 "이 메모는 무소속이에요" + "새 보드" 버튼.
   */
  action?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
}

interface ToastsState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id"> & { id?: string }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;
const nextId = () => `t-${Date.now().toString(36)}-${counter++}`;

export const useToasts = create<ToastsState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = toast.id ?? nextId();
    const duration = toast.duration ?? 3000;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id, duration }] }));
    if (duration > 0 && typeof window !== "undefined") {
      window.setTimeout(() => get().dismiss(id), duration);
    }
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));
