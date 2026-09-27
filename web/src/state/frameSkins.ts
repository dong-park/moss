/**
 * FEAT-frame-skins §6 — 스킨 레지스트리. React 없음.
 *
 * 스킨은 판 뒤에 그리는 배경 그림 하나와 최소·최대 폭 규칙만 가진다.
 * 계산 로직(스킨 전환·칸 추가/삭제)은 store가 맡는다.
 *
 * 자유 판의 최대 폭은 "지금 폭"에 따라 달라진다(AC-10): 세로 칸 판(1920)을 자유로
 * 바꾸면 1920을 유지하고 더 넓히지 못하며, 1200 아래로 줄이면 그때부터 1200이 상한이다.
 * 그래서 maxWidth는 currentWidth를 받는다.
 */
import {
  FRAME_COLUMNS_MAX_WIDTH,
  FRAME_COLUMN_WIDTH,
  normalizeFrameColumns,
  type FrameContentJson,
  type FrameSkinId,
} from "./frameContent";
import { CARD_MAX_WIDTH, FRAME_MIN_WIDTH } from "./workspace";

export interface FrameSkinDef {
  id: FrameSkinId;
  /** 이 스킨에서 판이 가질 수 있는 최소 폭. */
  minWidth(cfg: FrameContentJson): number;
  /** 이 스킨에서 판의 최대 폭. currentWidth는 자유 판의 AC-10 상한 계산에 쓴다. */
  maxWidth(cfg: FrameContentJson, currentWidth?: number): number;
}

/** 정규화 규칙을 거친 칸 수 — 깨진 목록은 기본 3으로 센다. */
export function frameColumnCount(cfg: FrameContentJson): number {
  return normalizeFrameColumns(cfg.columns).length;
}

export const FRAME_SKINS: Record<FrameSkinId, FrameSkinDef> = {
  free: {
    id: "free",
    minWidth: () => FRAME_MIN_WIDTH,
    maxWidth: (_cfg, currentWidth = 0) => Math.max(CARD_MAX_WIDTH, currentWidth),
  },
  columns: {
    id: "columns",
    minWidth: (cfg) => frameColumnCount(cfg) * FRAME_COLUMN_WIDTH,
    maxWidth: () => FRAME_COLUMNS_MAX_WIDTH,
  },
};

/** 설정 → 스킨 정의. 모르는 스킨은 자유 판. */
export function frameSkinFor(cfg: FrameContentJson): FrameSkinDef {
  return cfg.skin === "columns" ? FRAME_SKINS.columns : FRAME_SKINS.free;
}

/** 스킨 규칙으로 폭을 자른다. currentWidth는 자유 판 상한 계산용 현재 폭. */
export function clampFrameWidth(
  cfg: FrameContentJson,
  currentWidth: number,
  nextWidth: number,
): number {
  const skin = frameSkinFor(cfg);
  return Math.max(skin.minWidth(cfg), Math.min(nextWidth, skin.maxWidth(cfg, currentWidth)));
}
