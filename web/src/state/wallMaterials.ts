/**
 * glass-surface n1 — 벽·메모판 재질 레지스트리. React 없음.
 *
 * 재질은 벽 바탕과 메모판 바탕이 똑같이 고르는 세 값이다(D6=C: 벽과 메모판은 따로 고르되
 * 값은 같다). 이름은 여기 한 곳에만 모은다 — 화면(WallSurface·WallMaterialSwatch)과 고르는
 * 자리(재질 카드·판 우클릭 메뉴)가 모두 이 표를 읽는다. 재질을 더하면 이 표만 고친다.
 *
 * 화면 그림(그라데이션·점·광택)은 n3 몫이다. 여기는 이름·문구 키·대비 판정용 바탕색만 둔다.
 */

export const WALL_MATERIAL_IDS = ["glass", "whiteboard", "cork"] as const;
export type WallMaterialId = (typeof WALL_MATERIAL_IDS)[number];

export interface WallMaterialDef {
  id: WallMaterialId;
  /** ko.json 키 — 재질 이름. */
  labelKey: string;
  /** ko.json 키 — 재질 카드·메뉴의 보조 문구. */
  hintKey: string;
  /**
   * 마카 대비를 잴 때 쓰는 대표 바탕색(#rrggbb). 마카 획이 얹힐 수 있는 면의 밝은 쪽·
   * 어두운 쪽을 담는다. 유리는 흰 막이 얹히면 올라가므로 n3이 실제 렌더 색으로 다시 잰다.
   */
  backdrops: readonly string[];
  /**
   * 마카 4색 대비 3:1을 지켜야 하는 재질인가. 코르크는 시안색 #c79a62를 그대로 쓰므로
   * 빼 둔다 — 코르크 위 빨강·초록 마카가 옅은 것은 받아들인 제약이다(D7).
   */
  contrastChecked: boolean;
}

export const WALL_MATERIALS: Readonly<Record<WallMaterialId, WallMaterialDef>> = {
  glass: {
    id: "glass",
    labelKey: "wall.material.glass.label",
    hintKey: "wall.material.glass.hint",
    backdrops: ["#e6e1d8", "#d8d2c6"],
    contrastChecked: true,
  },
  whiteboard: {
    id: "whiteboard",
    labelKey: "wall.material.whiteboard.label",
    hintKey: "wall.material.whiteboard.hint",
    backdrops: ["#fbfbf8", "#f4f4f1", "#eeeeea"],
    contrastChecked: true,
  },
  cork: {
    id: "cork",
    labelKey: "wall.material.cork.label",
    hintKey: "wall.material.cork.hint",
    backdrops: ["#c79a62"],
    contrastChecked: false,
  },
};

/** 재질을 고르지 않은 벽이 열리는 값. */
export const DEFAULT_WALL_MATERIAL: WallMaterialId = "glass";
/** 재질을 고르지 않은 메모판이 그려지는 값 — 시안 01의 메모판 모습. */
export const DEFAULT_FRAME_MATERIAL: WallMaterialId = "cork";

export function isWallMaterialId(value: unknown): value is WallMaterialId {
  return typeof value === "string" && (WALL_MATERIAL_IDS as readonly string[]).includes(value);
}

/** 저장값 → 벽 재질. 없거나 모르는 값(숫자·null 포함)은 유리. 오류로 멈추지 않는다. */
export function wallMaterialFor(raw: unknown): WallMaterialDef {
  return WALL_MATERIALS[isWallMaterialId(raw) ? raw : DEFAULT_WALL_MATERIAL];
}

/** 저장값 → 메모판 재질. 없거나 모르는 값은 코르크. */
export function frameMaterialFor(raw: unknown): WallMaterialDef {
  return WALL_MATERIALS[isWallMaterialId(raw) ? raw : DEFAULT_FRAME_MATERIAL];
}
