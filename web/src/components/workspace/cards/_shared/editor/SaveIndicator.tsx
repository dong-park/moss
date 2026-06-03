"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-autosave-guard (W1) — 저장 상태 마이크로 인디케이터.
 *
 * 카드 우하단 8px 텍스트로 "저장 중…/저장됨/저장 실패"를 비방해적으로 보여준다
 * (spec §7 — 편집 가림 금지). role=status + aria-live=polite라 스크린리더가
 * 저장 결과를 흐름을 끊지 않고 읽어준다.
 *
 * 페이드(spec §3 AC-3): saveState가 "saved" 노출 1.5s 뒤 "idle"로 내린다.
 * idle 전이 시 opacity만 0으로 트랜지션하고 직전 라벨 텍스트는 유지해, 글자가
 * 뚝 끊기지 않고 부드럽게 사라지게 한다(저장 실패는 페이드 없이 계속 보임).
 * ───────────────────────────────────────────────────────────── */

import { useState } from "react";
import { useSaveState, type SaveState } from "./saveState";

const LABEL: Record<Exclude<SaveState, "idle">, string> = {
  saving: "저장 중…",
  saved: "저장됨",
  error: "저장 실패",
};

export function SaveIndicator({ cardId }: { cardId: string }) {
  const state = useSaveState(cardId);
  // idle로 내려가는 동안에도 직전 라벨을 유지해 텍스트가 opacity만 0으로 페이드되게
  // 한다(글자가 뚝 끊기지 않음). React 공식 "렌더 중 이전 상태 보정" 패턴 — idle 전이
  // 에선 label을 갱신하지 않아 마지막 라벨이 그대로 남는다.
  const [label, setLabel] = useState("");
  const [prevState, setPrevState] = useState<SaveState>(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state !== "idle") setLabel(LABEL[state]);
  }

  const visible = state !== "idle";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="저장 상태"
      data-state={state}
      style={{
        position: "absolute",
        right: 4,
        bottom: 3,
        fontSize: 8,
        lineHeight: 1,
        pointerEvents: "none",
        userSelect: "none",
        color: state === "error" ? "#c0392b" : "#8a8a8a",
        opacity: visible ? 0.85 : 0,
        transition: "opacity 400ms ease",
      }}
    >
      {label}
    </div>
  );
}
