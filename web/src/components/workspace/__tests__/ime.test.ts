import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  IME_ENTER_GUARD_MS,
  IME_REPLACEMENT_ENTER_GUARD_MS,
  afterComposition,
  isCommitEnter,
  isComposingIn,
  isComposingKey,
  isImeEnter,
} from "../ime";

/* 한글 조합 판정(D6=A, T9·T10·T11).
 * jsdom 합성 이벤트만 쓴다 — 실제 macOS 한글 입력기 확인은 n6(실브라우저) 몫이다. */

let t = 10_000;
const clock = vi.spyOn(performance, "now").mockImplementation(() => t);

afterEach(() => {
  // 앞 테스트의 compositionend 시각이 다음 테스트로 새지 않게 시계를 멀리 보낸다.
  t += 10_000;
});

function composeEnd(el: Element = document.body) {
  el.dispatchEvent(new Event("compositionend", { bubbles: true }));
}

describe("isComposingKey", () => {
  it("isComposing 이거나 keyCode 229면 조합 중이다", () => {
    expect(isComposingKey({ key: "Enter", isComposing: true })).toBe(true);
    expect(isComposingKey({ key: "Enter", keyCode: 229 })).toBe(true);
    expect(isComposingKey({ key: "Enter", nativeEvent: { isComposing: true } })).toBe(true);
    expect(isComposingKey({ key: "Enter", nativeEvent: { keyCode: 229 } })).toBe(true);
  });

  it("평소 키는 조합 중이 아니다", () => {
    expect(isComposingKey({ key: "Enter", keyCode: 13, isComposing: false })).toBe(false);
    expect(isComposingKey({ key: "a" })).toBe(false);
  });
});

describe("isImeEnter · isCommitEnter", () => {
  it("조합 중 Enter는 무시한다", () => {
    const e = { key: "Enter", isComposing: true };
    expect(isImeEnter(e)).toBe(true);
    expect(isCommitEnter(e)).toBe(false);
  });

  it("keyCode 229 Enter는 무시한다", () => {
    const e = { key: "Enter", keyCode: 229, isComposing: false };
    expect(isImeEnter(e)).toBe(true);
    expect(isCommitEnter(e)).toBe(false);
  });

  it("compositionend 직후 Enter는 무시한다(Safari)", () => {
    composeEnd();
    t += IME_ENTER_GUARD_MS - 1;
    const e = { key: "Enter", keyCode: 13, isComposing: false };
    expect(isImeEnter(e)).toBe(true);
    expect(isCommitEnter(e)).toBe(false);
  });

  it("시간 창이 지나면 Enter는 통과한다", () => {
    composeEnd();
    t += IME_ENTER_GUARD_MS;
    const e = { key: "Enter", keyCode: 13, isComposing: false };
    expect(isImeEnter(e)).toBe(false);
    expect(isCommitEnter(e)).toBe(true);
  });

  it("평소 Enter는 통과한다", () => {
    const e = { key: "Enter", keyCode: 13, isComposing: false };
    expect(isImeEnter(e)).toBe(false);
    expect(isCommitEnter(e)).toBe(true);
  });

  it("Enter가 아닌 키는 둘 다 false", () => {
    composeEnd();
    expect(isImeEnter({ key: "a" })).toBe(false);
    expect(isCommitEnter({ key: "a" })).toBe(false);
  });
});

/* Safari + 한글 입력기(F8, D10=A). composition 이벤트는 한 번도 오지 않고, 확정 글자는
 * beforeinput(insertReplacementText)로 온다. 시각은 qa/safari-ime-event-probe.txt 의 '이직' + Enter. */
function beforeInput(inputType: string, data: string, el: Element = document.body) {
  el.dispatchEvent(new InputEvent("beforeinput", { inputType, data, bubbles: true }));
}

describe("composition 이벤트 없는 입력기의 Enter (Safari 프로브 재생)", () => {
  const ENTER = { key: "Enter", keyCode: 13, isComposing: false };

  it("확정 글자(insertReplacementText) 5ms 뒤의 Enter는 조합 확정이라 저장하지 않는다", () => {
    // 4301~4483ms: 글자 하나씩 들어온다. keydown 은 모두 keyCode 229 다.
    beforeInput("insertText", "ㅇ");
    t += 30;
    beforeInput("insertReplacementText", "이");
    t += 52;
    beforeInput("insertReplacementText", "잊");
    t += 48;
    beforeInput("insertReplacementText", "이");
    beforeInput("insertText", "지");
    t += 40;
    beforeInput("insertReplacementText", "직");
    // 1.75초 쉬었다가 Enter — 이 Enter 직전에 확정 글자가 다시 온다(6237ms), 5ms 뒤 keydown(6247ms).
    t += 1750;
    beforeInput("insertReplacementText", "직");
    t += 10;

    expect(isImeEnter(ENTER)).toBe(true);
    expect(isCommitEnter(ENTER)).toBe(false);
  });

  it("그다음 사람이 다시 친 Enter는 저장으로 통과한다", () => {
    beforeInput("insertReplacementText", "직");
    t += 10;
    expect(isCommitEnter(ENTER)).toBe(false); // 첫 Enter — 확정
    t += 600; // 확정 뒤 사람이 다시 친다
    expect(isImeEnter(ENTER)).toBe(false);
    expect(isCommitEnter(ENTER)).toBe(true);
  });

  it("글자가 들어온 지 한참 뒤에 확정 글자 없이 온 Enter는 저장이다", () => {
    beforeInput("insertReplacementText", "직");
    t += IME_REPLACEMENT_ENTER_GUARD_MS;

    expect(isImeEnter(ENTER)).toBe(false);
    expect(isCommitEnter(ENTER)).toBe(true);
  });

  /* jsdom 은 이벤트 생성 시각(timeStamp)을 Date.now()로 매긴다 — 그것을 고정해 생성 시각을 정한다.
   * 앞 테스트의 compositionend 시각과 멀리 떨어뜨려 이 테스트의 beforeinput 만 가드에 걸리게 한다. */
  let stampBase = 5_000_000_000_000;
  function beforeInputStampedAt(stamp: number): number {
    const spy = vi.spyOn(Date, "now").mockReturnValue(stamp);
    try {
      const event = new InputEvent("beforeinput", {
        inputType: "insertReplacementText",
        data: "직",
        bubbles: true,
      });
      document.body.dispatchEvent(event);
      return event.timeStamp;
    } finally {
      spy.mockRestore();
    }
  }

  it("beforeinput과 keydown 사이에 핸들러가 오래 늦어도 이벤트 생성 시각 차가 작으면 막는다", () => {
    // 무거운 벽: beforeinput → input(React 렌더 200ms) → keydown. 핸들러가 도는 시각은 200ms 벌어지지만
    // 두 이벤트가 만들어진 시각은 5ms 차이다 — 같은 입력 처리이므로 확정 Enter다.
    stampBase += 1_000_000;
    const stamp = beforeInputStampedAt(stampBase);
    t += 200; // 렌더가 오래 걸려 keydown 핸들러가 늦게 돈다
    const lateKeydown = { ...ENTER, timeStamp: stamp + 5 };

    expect(isImeEnter(lateKeydown)).toBe(true);
    expect(isCommitEnter(lateKeydown)).toBe(false);
  });

  it("생성 시각 차와 핸들러 시각 차가 둘 다 가드를 넘으면 저장이다", () => {
    stampBase += 1_000_000;
    const stamp = beforeInputStampedAt(stampBase);
    const slow = IME_REPLACEMENT_ENTER_GUARD_MS + 10;
    t += slow; // 핸들러도 가드보다 한참 뒤에 돈다 — 사람이 따로 친 Enter 다
    const slowHuman = { ...ENTER, timeStamp: stamp + slow };

    expect(isCommitEnter(slowHuman)).toBe(true);
  });

  it("React 합성 이벤트는 nativeEvent.timeStamp로 비교한다", () => {
    stampBase += 1_000_000;
    const stamp = beforeInputStampedAt(stampBase);
    t += 200;
    const synthetic = { ...ENTER, nativeEvent: { timeStamp: stamp + 4 } };

    expect(isImeEnter(synthetic)).toBe(true);
  });

  it("조합과 상관없는 입력(insertText 등) 직후의 Enter는 막지 않는다", () => {
    beforeInput("insertText", "a");
    t += 5;
    expect(isCommitEnter(ENTER)).toBe(true);
    beforeInput("insertLineBreak", "");
    t += 5;
    expect(isCommitEnter(ENTER)).toBe(true);
  });

  it("Enter가 아닌 키는 영향이 없다", () => {
    beforeInput("insertReplacementText", "직");
    expect(isImeEnter({ key: "a", keyCode: 65 })).toBe(false);
  });
});

/* H4 — 메인 스레드가 막힌 동안 Enter 가 큐에 쌓이면 compositionend·beforeinput 의 timeStamp 는
 * 렌더러가 만든 시각(늦음)이고 keydown 은 도착 시각(이름)이라 막힌 시간만큼 stamp 차가 벌어진다.
 * 이때 두 핸들러는 한 묶음으로 돌아 핸들러 시각 차는 작다. 숫자는
 * spec/glass-wall/korean-search-ime/qa/t9-timestamp-measure.md 표 2 다. */
describe("메인 스레드가 막혔을 때 조합 확정 Enter (H4 — 측정 재생)", () => {
  const ENTER = { key: "Enter", keyCode: 13, isComposing: false };
  let base = 7_000_000_000_000;

  /** `stamp` 에 만들어진 것처럼 이벤트를 띄운다. */
  function dispatchStamped(make: () => Event, stamp: number): void {
    const spy = vi.spyOn(Date, "now").mockReturnValue(stamp);
    try {
      document.body.dispatchEvent(make());
    } finally {
      spy.mockRestore();
    }
  }

  // BUSY ms → compositionend.ts 와 Enter.ts 의 차이(표 2). 130ms 부터 stamp 차가 가드(100ms)를 넘는다.
  const MEASURED = [
    [30, 31.5],
    [60, 62.9],
    [120, 97.8],
    [150, 120.6],
    [400, 371.9],
  ] as const;

  for (const [busy, stampGap] of MEASURED) {
    it(`조합 끝 뒤 ${busy}ms 막힌 Enter(stamp 차 ${stampGap}ms)는 핸들러가 한 묶음으로 돌아 막는다`, () => {
      base += 1_000_000;
      dispatchStamped(() => new Event("compositionend", { bubbles: true }), base);
      t += 1; // 큐에 쌓였던 두 이벤트가 이어서 돈다
      // keydown 은 도착 시각이라 compositionend 보다 stampGap 만큼 이르다.
      const queued = { ...ENTER, timeStamp: base - stampGap };

      expect(isImeEnter(queued)).toBe(true);
      expect(isCommitEnter(queued)).toBe(false);
    });
  }

  it("Safari 경로(beforeinput, 가드 50ms)도 80ms 막혔다면 핸들러 시각 차로 막는다", () => {
    base += 1_000_000;
    dispatchStamped(
      () =>
        new InputEvent("beforeinput", {
          inputType: "insertReplacementText",
          data: "직",
          bubbles: true,
        }),
      base,
    );
    t += 1;
    const queued = { ...ENTER, timeStamp: base - 80 };

    expect(isImeEnter(queued)).toBe(true);
  });

  for (const gap of [300, 600]) {
    it(`조합이 끝난 ${gap}ms 뒤 사람이 다시 누른 Enter 는 통과한다`, () => {
      base += 1_000_000;
      dispatchStamped(() => new Event("compositionend", { bubbles: true }), base);
      t += gap;
      const second = { ...ENTER, timeStamp: base + gap };

      expect(isImeEnter(second)).toBe(false);
      expect(isCommitEnter(second)).toBe(true);
    });
  }

  it("확정 글자(beforeinput) 300ms 뒤 사람이 다시 누른 Enter 도 통과한다", () => {
    base += 1_000_000;
    dispatchStamped(
      () =>
        new InputEvent("beforeinput", {
          inputType: "insertReplacementText",
          data: "직",
          bubbles: true,
        }),
      base,
    );
    t += 300;

    expect(isCommitEnter({ ...ENTER, timeStamp: base + 300 })).toBe(true);
  });
});

describe("Chrome 순서는 그대로다 — composition 이벤트가 오는 입력기", () => {
  it("조합 중 Enter 는 isComposing 으로 막히고, 조합이 끝난 뒤 한참 지난 Enter 는 통과한다", () => {
    document.body.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    beforeInput("insertCompositionText", "직");
    expect(isCommitEnter({ key: "Enter", keyCode: 229, isComposing: true })).toBe(false);

    composeEnd();
    t += IME_ENTER_GUARD_MS; // 조합 끝 가드는 끝났다
    // 조합 입력(insertCompositionText)은 그보다 앞이라 더는 막지 않는다.
    expect(isCommitEnter({ key: "Enter", keyCode: 13, isComposing: false })).toBe(true);
  });

  it("Chrome 은 조합 끝 직후 Enter 가 오지 않는다 — 한 번에 확정 후 다음 Enter 가 저장", () => {
    beforeInput("insertCompositionText", "직");
    composeEnd();
    t += 200;
    expect(isCommitEnter({ key: "Enter", keyCode: 13, isComposing: false })).toBe(true);
  });
});

describe("afterComposition", () => {
  it("조합 중이 아니면 바로 부른다", () => {
    const input = document.createElement("input");
    document.body.append(input);
    const run = vi.fn();
    afterComposition(input, run);
    expect(run).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it("조합 중이면 compositionend 뒤 한 틱에 부른다", async () => {
    vi.useFakeTimers();
    try {
      const input = document.createElement("input");
      document.body.append(input);
      input.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      expect(isComposingIn(input)).toBe(true);

      const run = vi.fn();
      afterComposition(input, run);
      expect(run).not.toHaveBeenCalled();

      input.dispatchEvent(new Event("compositionend", { bubbles: true }));
      expect(isComposingIn(input)).toBe(false);
      expect(run).not.toHaveBeenCalled();
      vi.advanceTimersByTime(0);
      expect(run).toHaveBeenCalledTimes(1);
      input.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("compositionend가 끝내 안 오면 상한 뒤에 부른다", () => {
    vi.useFakeTimers();
    try {
      const input = document.createElement("input");
      document.body.append(input);
      input.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      const run = vi.fn();
      afterComposition(input, run);
      vi.advanceTimersByTime(1000);
      expect(run).toHaveBeenCalledTimes(1);
      input.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ── 날 Enter 비교 검사 ─────────────────────────────────────────────
 * components 아래 어디서든 "Enter" 글자 비교를 직접 쓰면 실패한다.
 * Enter를 저장·이동 키로 받으려면 ime.ts의 isCommitEnter를 쓴다.
 * 허용 목록은 이유를 적는다. 줄이 늘어나면 이 목록이 아니라 그 줄을 고친다. */

// vitest는 web/에서 돈다(vitest.config.ts와 같은 기준).
const COMPONENTS_DIR = resolve(process.cwd(), "src/components");

/** 상대 경로(components 기준) → 허용 이유. */
const RAW_ENTER_ALLOWED: Record<string, string> = {
  "workspace/ime.ts": "공용 판정 함수 자신이다.",
  "workspace/cards/_shared/editor/wikilink.ts":
    "ProseMirror handleKeyDown(Milkdown 본문 편집기)이다. ProseMirror가 조합 중 keydown을 자기 쪽에서 먼저 거르고 " +
    "나서 이 핸들러를 부른다. 본문 편집기의 한글 Enter 재현 여부는 n6이 실브라우저로 본다.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function rawEnterLines(source: string): number[] {
  const hits: number[] = [];
  source.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    const code = line.replace(/\s\/\/.*$/, "");
    if (/["'`]Enter["'`]/.test(code)) hits.push(i + 1);
  });
  return hits;
}

describe("날 Enter 비교 검사", () => {
  it("components 아래에 공용 판정 없이 \"Enter\"를 비교하는 줄이 없다", () => {
    const offenders: string[] = [];
    for (const file of walk(COMPONENTS_DIR)) {
      const rel = relative(COMPONENTS_DIR, file);
      if (rel in RAW_ENTER_ALLOWED) continue;
      const lines = rawEnterLines(readFileSync(file, "utf8"));
      if (lines.length) offenders.push(`${rel}:${lines.join(",")}`);
    }
    expect(
      offenders,
      "Enter를 저장·이동 키로 받으면 workspace/ime.ts의 isCommitEnter를 쓴다",
    ).toEqual([]);
  });

  it("허용 목록의 파일이 모두 실제로 있고 이유가 적혀 있다", () => {
    for (const [rel, reason] of Object.entries(RAW_ENTER_ALLOWED)) {
      expect(() => statSync(join(COMPONENTS_DIR, rel)), rel).not.toThrow();
      expect(reason.length, rel).toBeGreaterThan(10);
    }
  });

  it("검사 자체가 날 비교를 잡는다", () => {
    expect(rawEnterLines('if (e.key === "Enter") {')).toEqual([1]);
    expect(rawEnterLines("case 'Enter':")).toEqual([1]);
    expect(rawEnterLines('// "Enter"는 여기서 안 센다')).toEqual([]);
    expect(rawEnterLines("if (isCommitEnter(e)) {")).toEqual([]);
  });
});

// 시계 목은 파일 전체에서 쓴다.
void clock;
