"use client";

import { useCallback, useEffect, useRef } from "react";
import type { FocusEvent } from "react";

/* ─────────────────────────────────────────────────────────────
 * 한글 조합(IME) 판정 — 벽의 모든 입력 칸이 이 파일만 본다.
 *
 * 문제: 한글은 글자를 조합하는 동안 Enter가 "확정"이다. 이 Enter를 저장으로
 * 받으면 마지막 글자가 두 번 들어가거나 잘린다. 조합 중인지 보는 법이 브라우저마다
 * 달라서(isComposing / keyCode 229 / Safari의 조합 끝 직후 Enter, composition 이벤트가
 * 없는 입력기의 확정 글자 직후 Enter) 입력마다
 * 흩어 두면 새 입력에서 다시 빠진다 → 판정은 여기 한 곳이다.
 *
 * 규칙: 컴포넌트에서 Enter를 저장·이동 키로 받을 땐 날 `e.key === "Enter"`를
 * 쓰지 않고 [[isCommitEnter]]를 쓴다. `ime.test.ts`가 날 비교를 찾아 실패시킨다.
 * ───────────────────────────────────────────────────────────── */

/**
 * 조합이 끝난 뒤 이 시간 안에 온 Enter는 조합 확정용이다.
 * Safari는 compositionend 뒤에 keydown Enter(isComposing=false)를 한 번 더 보낸다.
 * 그 둘은 같은 입력 처리 안에서 오고, 사람이 Enter를 연달아 치는 간격은 이보다 길다.
 */
export const IME_ENTER_GUARD_MS = 100;

/**
 * 조합 성격의 입력(beforeinput)이 온 직후 이 시간 안에 온 Enter는 조합 확정용이다.
 * 한글 입력기를 쓰는 Safari는 composition 이벤트를 아예 보내지 않고, 글자를
 * `beforeinput(insertReplacementText)`로 갈아 끼운다. 조합 중에 Enter를 치면 확정 글자가
 * 같은 이벤트로 오고 약 5ms 뒤에 `keydown Enter`(isComposing=false, keyCode 13)가 온다 —
 * 실측은 spec/glass-wall/korean-search-ime/qa/safari-ime-event-probe.txt. 사람이 연달아 치는
 * 키 간격은 이보다 훨씬 길어서, 확정 글자 직후의 이 Enter만 가려낸다.
 */
export const IME_REPLACEMENT_ENTER_GUARD_MS = 50;

/** 이 inputType 의 beforeinput 은 조합이 글자를 바꿔 넣는 중이다. */
const IME_INPUT_TYPES = new Set(["insertReplacementText", "insertCompositionText"]);

/** 조합 끝 이벤트가 끝내 오지 않을 때 blur 저장을 기다리는 상한. */
export const IME_BLUR_WAIT_MAX_MS = 300;

/** React 합성 이벤트와 DOM KeyboardEvent 둘 다 받는다. */
export interface ImeKeyLike {
  key: string;
  keyCode?: number;
  isComposing?: boolean;
  /** 이벤트가 만들어진 시각(`Event.timeStamp`). 있으면 이것으로 앞선 IME 이벤트와 잰다. */
  timeStamp?: number;
  nativeEvent?: { keyCode?: number; isComposing?: boolean; timeStamp?: number };
}

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/**
 * IME 이벤트가 온 시점. 가드는 두 척도를 함께 본다 — 어느 한쪽이라도 가드 안이면 조합 확정 Enter 다.
 *
 * - 이벤트가 만들어진 시각(`stamp`, `Event.timeStamp`)끼리: 무거운 벽에서 beforeinput 과 keydown 사이에
 *   React 렌더가 끼면 두 핸들러가 도는 시각은 가드(50ms)보다 벌어지지만, 브라우저가 입력을 받은
 *   순간은 몇 ms 차이다. 렌더 지연은 stamp 가 잡는다.
 * - 핸들러가 도는 시각(`at`)끼리: 메인 스레드가 막힌 동안 Enter 가 큐에 쌓이면, compositionend·
 *   beforeinput 의 stamp 는 렌더러가 그 이벤트를 만든 시각(늦음)이고 keydown 은 도착 시각(이름)이라
 *   막힌 시간만큼 stamp 차가 벌어진다(Chrome ≥130ms 에서 가드를 넘는다 — qa/t9-timestamp-measure.md).
 *   그런데 쌓인 이벤트는 한 묶음으로 이어 돌아 핸들러 시각 차는 작다. 큐 지연은 핸들러 시각이 잡는다.
 *
 * 사람이 따로 친 두 번째 Enter 는 두 척도가 모두 가드를 넘는다. `Event.timeStamp`는 문서 시간 원점
 * 기준(`performance.now()`와 같은 기준)이고 모든 이벤트가 같은 기준을 쓴다. 그래서 이벤트 stamp
 * 끼리만 비교하고 `performance.now()`와는 섞지 않는다. stamp 를 못 얻으면(합성 객체 등) 핸들러
 * 시각만 쓴다.
 */
interface ImeMark {
  stamp: number | null;
  at: number;
}

const NEVER: ImeMark = { stamp: null, at: Number.NEGATIVE_INFINITY };

let lastCompositionEnd: ImeMark = NEVER;
let lastImeInput: ImeMark = NEVER;
let composingTarget: EventTarget | null = null;

function stampOf(e: { timeStamp?: number } | null | undefined): number | null {
  const v = e?.timeStamp;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function markOf(e: Event): ImeMark {
  return { stamp: stampOf(e), at: now() };
}

/** 이 키 이벤트가 `mark` 이후 `guardMs` 안에 왔나 — 만들어진 시각 차나 핸들러 시각 차 어느 쪽이든. */
function withinGuard(mark: ImeMark, keyStamp: number | null, at: number, guardMs: number): boolean {
  // 같은 입력 처리에서 나온 이벤트는 만들어진 순서가 뒤바뀔 수 있어(합성 compositionend 등) 절댓값으로 본다.
  if (keyStamp !== null && mark.stamp !== null && Math.abs(keyStamp - mark.stamp) < guardMs) {
    return true;
  }
  return at - mark.at < guardMs;
}

// 문서 하나에 한 번. 입력마다 onCompositionEnd를 달지 않아도 모든 칸이 같은 시각을 본다.
// capture로 달아 입력 쪽 stopPropagation에 막히지 않는다.
if (typeof document !== "undefined") {
  document.addEventListener(
    "compositionstart",
    (e) => {
      composingTarget = e.target;
    },
    true,
  );
  document.addEventListener(
    "compositionend",
    (e) => {
      if (composingTarget === e.target) composingTarget = null;
      lastCompositionEnd = markOf(e);
    },
    true,
  );
  // composition 이벤트를 보내지 않는 입력기(Safari + 한글)는 글자 확정이 이 이벤트로만 보인다.
  document.addEventListener(
    "beforeinput",
    (e) => {
      if (IME_INPUT_TYPES.has((e as InputEvent).inputType)) lastImeInput = markOf(e);
    },
    true,
  );
}

/** 이 키 이벤트가 조합 중에 왔다 — isComposing 이거나 keyCode 229(조합 처리 중 키). */
export function isComposingKey(e: ImeKeyLike): boolean {
  return (
    e.isComposing === true ||
    e.nativeEvent?.isComposing === true ||
    e.keyCode === 229 ||
    e.nativeEvent?.keyCode === 229
  );
}

/**
 * 조합을 확정하려고 친 Enter인가 — 조합 중이거나, 방금 조합이 끝난 직후의 Enter,
 * 또는 composition 이벤트 없이 확정 글자가 막 들어온 직후의 Enter(Safari).
 * true면 저장·이동을 하지 않고 글자 확정에 맡긴다.
 */
export function isImeEnter(e: ImeKeyLike): boolean {
  if (e.key !== "Enter") return false;
  if (isComposingKey(e)) return true;
  const at = now();
  const keyStamp = stampOf(e) ?? stampOf(e.nativeEvent);
  return (
    withinGuard(lastCompositionEnd, keyStamp, at, IME_ENTER_GUARD_MS) ||
    withinGuard(lastImeInput, keyStamp, at, IME_REPLACEMENT_ENTER_GUARD_MS)
  );
}

/** 저장·이동으로 받아도 되는 Enter — 조합 확정용이 아닌 진짜 Enter. */
export function isCommitEnter(e: ImeKeyLike): boolean {
  return e.key === "Enter" && !isImeEnter(e);
}

/** 이 칸이 지금 한글을 조합하는 중인가. */
export function isComposingIn(el: EventTarget | null): boolean {
  return el !== null && composingTarget === el;
}

/**
 * 조합 중이면 compositionend 뒤로 미뤄서 `run`을 부른다. 조합 중이 아니면 바로 부른다.
 * input 이벤트와 compositionend의 순서가 브라우저마다 달라, 끝난 뒤 한 틱 더 기다려
 * 확정된 글자가 상태에 반영된 다음 읽는다.
 */
export function afterComposition(el: HTMLElement, run: () => void): void {
  if (!isComposingIn(el)) {
    run();
    return;
  }
  let settled = false;
  const fallback = setTimeout(() => finish(), IME_BLUR_WAIT_MAX_MS);
  function finish() {
    if (settled) return;
    settled = true;
    el.removeEventListener("compositionend", finish);
    clearTimeout(fallback);
    if (composingTarget === el) composingTarget = null;
    setTimeout(run, 0);
  }
  el.addEventListener("compositionend", finish);
}

/**
 * blur로 저장하는 입력 칸용 onBlur. 조합 중에 blur가 오면 조합이 끝난 뒤 확정 값으로
 * 저장해, 마지막 글자가 잘리거나 겹치지 않게 한다.
 *
 * 미룬 호출은 그 사이 다시 그려진 최신 `handler`를 쓴다(상태에서 값을 읽는 칸도 안전).
 * 미룬 뒤에는 React가 `currentTarget`을 비우므로 대신 그 입력 칸을 넣어 준다.
 */
export function useImeSafeBlur<E extends HTMLInputElement | HTMLTextAreaElement>(
  handler: (e: FocusEvent<E>) => void,
): (e: FocusEvent<E>) => void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  return useCallback((e: FocusEvent<E>) => {
    const el = e.currentTarget;
    if (!isComposingIn(el)) {
      latest.current(e);
      return;
    }
    afterComposition(el, () => {
      latest.current(
        Object.create(e, { currentTarget: { value: el } }) as FocusEvent<E>,
      );
    });
  }, []);
}
