/**
 * FEAT-card-entry-mode — 10종 카드 자동 포커스 selector 테스트.
 *
 * spec §6 표 (FEAT-markdown-memo-pen에서 text→Milkdown, checklist/highlight/code 통합 후 제외):
 *   image      [data-card-dropzone]
 *   file       [data-card-dropzone]
 *   audio      button[data-card-record]
 *   handwriting [data-card-canvas]    ※ spec은 canvas[…] 표기지만 실제 element는 svg를 감싸는 wrapper div
 *   mindmap    [data-card-node="root"] input
 *   link       input[data-card-url]
 *
 * AC-2: 각 카드 mount 후 document.activeElement가 selector와 일치.
 * AC-5: editing=false에서는 자동 포커스 발동 안 함.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderCard } from "./setupCard";

// audio 카드의 자동 녹음(useEffect)이 jsdom에서 mediaDevices/MediaRecorder 부재로 즉시 unsupported 분기 → button 사라짐을 방지.
// getUserMedia를 영원히 pending Promise로, MediaRecorder를 최소 stub으로 제공해 startRecording이 await getUserMedia에서 멈추게 한다.
let savedMediaDevices: PropertyDescriptor | undefined;
let savedMediaRecorder: PropertyDescriptor | undefined;
beforeEach(() => {
  savedMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: () => new Promise(() => {}), // never resolves
    },
  });
  savedMediaRecorder = Object.getOwnPropertyDescriptor(
    globalThis,
    "MediaRecorder",
  );
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    writable: true,
    value: function MediaRecorderStub() {
      return {
        start: () => {},
        stop: () => {},
        state: "inactive",
        ondataavailable: null,
        onstop: null,
      };
    },
  });
});
afterEach(() => {
  if (savedMediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", savedMediaDevices);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).mediaDevices;
  }
  if (savedMediaRecorder) {
    Object.defineProperty(globalThis, "MediaRecorder", savedMediaRecorder);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).MediaRecorder;
  }
});

type Case = {
  kind: Parameters<typeof renderCard>[0];
  selector: string;
  /** 비편집 placeholder가 다른 element를 활성화할 수 있으므로 mount 직후 activeElement만 검증. */
};

// FEAT-markdown-memo-pen: text는 Milkdown(ProseMirror) 포커스로 전환(jsdom 비검증),
// checklist/highlight/code는 마크다운 메모로 통합 삭제 → 자동 포커스 케이스에서 제외.
const CASES: Case[] = [
  { kind: "image", selector: "[data-card-dropzone]" },
  { kind: "file", selector: "[data-card-dropzone]" },
  { kind: "audio", selector: "button[data-card-record]" },
  { kind: "handwriting", selector: "[data-card-canvas]" },
  { kind: "mindmap", selector: '[data-card-node="root"] input' },
  { kind: "link", selector: "input[data-card-url]" },
];

describe("CardContent · auto-focus (FEAT-card-entry-mode)", () => {
  for (const { kind, selector } of CASES) {
    it(`${kind} — editing=true → ${selector}가 document.activeElement`, () => {
      const { container } = renderCard(kind, { content: "", editing: true });
      const el = container.querySelector(selector);
      expect(el).not.toBeNull();
      expect(document.activeElement).toBe(el);
    });

    it(`${kind} — editing=false → ${selector}에 포커스 박히지 않음`, () => {
      const { container } = renderCard(kind, { content: "", editing: false });
      const el = container.querySelector(selector);
      // 비편집에서는 element가 아예 없을 수도 있음(예: input은 편집 모드만 렌더).
      // 핵심은 자동 포커스 발동 안 함 — body가 활성 또는 다른 곳.
      if (el) {
        expect(document.activeElement).not.toBe(el);
      } else {
        // selector가 비편집에서 부재 — AC-5 만족 (자동 포커스 트리거 없음).
        expect(el).toBeNull();
      }
    });
  }
});
