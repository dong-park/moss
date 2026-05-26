/**
 * Audio 카드 키보드 UX — spec §6 P2-C
 * Space 재생/일시정지, ←→ 5초 탐색, M 음소거, Esc commit.
 *
 * jsdom은 HTMLAudioElement의 play/pause를 기본 구현하지 않으므로
 * prototype을 직접 패치한다. paused는 getter라 Object.defineProperty 사용.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderCard } from "./setupCard";

// OPFS blob fetch — attachmentRef → URL을 동기적으로 끝내기 위해 즉시 resolve.
vi.mock("@/state/db/opfs", async () => {
  const actual = await vi.importActual<typeof import("@/state/db/opfs")>(
    "@/state/db/opfs",
  );
  return {
    ...actual,
    getBlobUrl: vi.fn(async () => "blob:fake/audio"),
  };
});

// ── HTMLAudioElement 단순 mock (jsdom은 paused/play/pause를 노옵 처리) ──
let pausedFlag = true;
let playSpy: ReturnType<typeof vi.fn>;
let pauseSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  pausedFlag = true;
  playSpy = vi.fn(() => {
    pausedFlag = false;
    return Promise.resolve();
  });
  pauseSpy = vi.fn(() => {
    pausedFlag = true;
  });
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get() {
      return pausedFlag;
    },
  });
  HTMLMediaElement.prototype.play = playSpy as unknown as HTMLMediaElement["play"];
  HTMLMediaElement.prototype.pause = pauseSpy as unknown as HTMLMediaElement["pause"];
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** attachmentRef 있는 카드 — 녹음 완료 상태 시뮬레이션. */
function renderAudioWithAttachment() {
  return renderCard("audio", {
    content: "3s",
    card: { attachmentRef: "opfs:fake.webm" },
  });
}

/** audio element가 src를 받고 마운트되도록 microtask flush. */
async function flushAudioMount() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** 카드 컨테이너 div(키보드 핸들러가 붙은 root). data-testid 추가 없이 표면 인접 첫 div. */
function cardRoot(): HTMLElement {
  // waveform placeholder를 가진 카드가 보이면 그 조상 div가 핸들러 루트.
  // testing-library는 div를 직접 잡을 수 없으니 audio element의 조상을 찾는다.
  const audio = document.querySelector("audio");
  if (audio) {
    let el: HTMLElement | null = audio.parentElement;
    while (el && el.getAttribute("tabindex") !== "0") el = el.parentElement;
    if (el) return el;
  }
  // fallback — placeholder/recording 상태에서는 audio 없음. 첫 [tabindex="0"] div.
  const root = document.querySelector('[tabindex="0"]');
  if (!root) throw new Error("card root not found");
  return root as HTMLElement;
}

describe("AudioCardContent · 미디어 재생 UX", () => {
  it("render — cards/v2/audio.png 표면 + waveform placeholder", async () => {
    renderAudioWithAttachment();
    await flushAudioMount();

    const root = cardRoot();
    expect(root.getAttribute("style") ?? "").toContain("cards/v2/audio.png");
    expect(screen.getByTestId("audio-waveform")).toBeTruthy();
  });

  it("Space — paused 토글 (play 호출 후 다시 pause)", async () => {
    renderAudioWithAttachment();
    await flushAudioMount();

    const root = cardRoot();
    fireEvent.keyDown(root, { key: " ", code: "Space" });
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).not.toHaveBeenCalled();

    // play 후 paused=false 상태에서 다시 Space → pause 호출
    fireEvent.keyDown(root, { key: " ", code: "Space" });
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it("← / → — currentTime ±5초", async () => {
    renderAudioWithAttachment();
    await flushAudioMount();

    const audio = document.querySelector("audio") as HTMLAudioElement;
    audio.currentTime = 10;
    const root = cardRoot();

    fireEvent.keyDown(root, { key: "ArrowRight" });
    expect(audio.currentTime).toBe(15);

    fireEvent.keyDown(root, { key: "ArrowLeft" });
    expect(audio.currentTime).toBe(10);

    // 0 미만으로 떨어지지 않는다
    audio.currentTime = 2;
    fireEvent.keyDown(root, { key: "ArrowLeft" });
    expect(audio.currentTime).toBe(0);
  });

  it("M — muted 토글", async () => {
    renderAudioWithAttachment();
    await flushAudioMount();

    const audio = document.querySelector("audio") as HTMLAudioElement;
    const root = cardRoot();
    expect(audio.muted).toBe(false);

    fireEvent.keyDown(root, { key: "m" });
    expect(audio.muted).toBe(true);

    fireEvent.keyDown(root, { key: "M" });
    expect(audio.muted).toBe(false);
  });

  it("Esc — onCommitEdit 호출 (attachmentRef 없어도 동작)", () => {
    const { onCommit } = renderCard("audio", "");

    const root = document.querySelector('[tabindex="0"]') as HTMLElement;
    fireEvent.keyDown(root, { key: "Escape" });

    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
