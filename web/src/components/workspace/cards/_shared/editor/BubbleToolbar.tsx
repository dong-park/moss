/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-incard-format (W3) — 인카드 버블 툴바 항목.
 *
 * 카드 안 편집 중 텍스트를 선택하면 P0의 bubbleSlot이 선택 좌표를 추적하고
 * BubbleMenuHost가 선택 위에 floating 툴바를 그린다(P0가 이미 마운트). W3는 그
 * 툴바에 채울 항목(memoBubbleItems)만 제공한다 — 렌더·위치·포커스 보존
 * (onMouseDown preventDefault)은 전부 호스트가 담당([[_squad-memo-production]] §인터페이스).
 *
 * 항목은 공유 커맨드 맵 FORMAT_COMMANDS에서 가져온다 → 모달 툴바와 같은 서식
 * 의미·라벨·i18n 키를 쓴다(스펙 §2·AC-5). extensions.ts의 bubbleMenuItems 배열에
 * `...memoBubbleItems`로 등록되면(머지 1줄) 선택 시 노출된다.
 *
 * 순서(스펙 §2): B / I / S · H1 / H2 · • / 1. / ☑ · ❝ / code.
 * ───────────────────────────────────────────────────────────── */

import type { BubbleMenuItem } from "./extensions";
import { FORMAT_COMMANDS } from "./formatCommands";

// 스펙 §2에 명시된 버블 노출 순서(모달 툴바의 codeBlock/hr·구분선은 제외).
const BUBBLE_ORDER = [
  "bold",
  "italic",
  "strike",
  "h1",
  "h2",
  "bullet",
  "ordered",
  "checklist",
  "quote",
  "code",
] as const;

export const memoBubbleItems: BubbleMenuItem[] = BUBBLE_ORDER.map((id) => {
  const cmd = FORMAT_COMMANDS[id];
  return {
    id,
    label: cmd.label,
    aria: cmd.aria,
    isActive: cmd.isActive,
    run: cmd.run,
  };
});
