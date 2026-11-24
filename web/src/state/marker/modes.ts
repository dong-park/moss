/* ─────────────────────────────────────────────────────────────
 * wall-marker 리뷰 W8 — 서로 배타인 입력 상태를 한 곳에서 정한다.
 *
 * 다음 넷은 동시에 켜질 수 없다:
 *   - 손에 든 도구(heldTool: 마카·천)
 *   - 글상자 배치 모드(textPlacementArmed, 단축키 T)
 *   - 글 편집(editingId)
 *   - 고른 벽 획 묶음(selectedWallStrokeIds)
 *
 * 규칙(어느 쪽에 "들어가든" 같은 표를 쓴다):
 *   held     ⟹ ¬armed ∧ editing=null ∧ selWall=[]
 *   armed    ⟹ held=null ∧ editing=null ∧ selWall=[]
 *   editing  ⟹ held=null ∧ ¬armed
 *   selWall  ⟹ held=null ∧ ¬armed
 *
 * 스토어의 모든 진입 액션은 `enterMode`가 돌려주는 patch를 `set`에 그대로 넘긴다. 진입을
 * 새로 만들 때도 직접 `set({ heldTool … })`을 쓰지 않고 여기에 항목을 더한다.
 * ───────────────────────────────────────────────────────────── */

import type { HeldTool } from "./heldTool";
import type { MarkerColor } from "./tokens";

export interface ExclusiveModes {
  heldTool: HeldTool;
  textPlacementArmed: boolean;
  editingId: string | null;
  selectedWallStrokeIds: string[];
}

export type ModeEntry =
  | { enter: "marker"; color: MarkerColor }
  | { enter: "cloth" }
  | { enter: "textPlacement" }
  /** 글 편집에 들어간다. 든 도구·배치 모드는 내려놓는다. */
  | { enter: "edit"; id: string }
  /**
   * 벽 획을 고른다. 마카·천을 들었거나 배치 모드인 동안은 고를 수 없다 — 그때의 호출은
   * 도구를 내려놓지 않고 묶음을 비운다(고르기가 손의 도구를 빼앗지 않는다).
   */
  | { enter: "wallSelection"; ids: string[] };

/** 진입에 따른 상태 patch. `current`는 지금의 배타 상태다. */
export function enterMode(
  entry: ModeEntry,
  current: Pick<ExclusiveModes, "heldTool" | "textPlacementArmed">,
): Partial<ExclusiveModes> {
  switch (entry.enter) {
    case "marker":
      return {
        heldTool: { kind: "marker", color: entry.color },
        textPlacementArmed: false,
        editingId: null,
        selectedWallStrokeIds: [],
      };
    case "cloth":
      return {
        heldTool: { kind: "cloth" },
        textPlacementArmed: false,
        editingId: null,
        selectedWallStrokeIds: [],
      };
    case "textPlacement":
      return {
        textPlacementArmed: true,
        heldTool: null,
        editingId: null,
        selectedWallStrokeIds: [],
      };
    case "edit":
      return { editingId: entry.id, heldTool: null, textPlacementArmed: false };
    case "wallSelection":
      if (current.heldTool !== null || current.textPlacementArmed || entry.ids.length === 0) {
        return { selectedWallStrokeIds: [] };
      }
      return { selectedWallStrokeIds: entry.ids };
  }
}
