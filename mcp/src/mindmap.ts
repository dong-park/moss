/* ─────────────────────────────────────────────────────────────
 * 생각 지도 배치 — 중심 하나에서 갈래를 좌우로 펼치는 마인드맵 좌표 계산.
 * 순수 함수다. map_create 도구가 이 결과로 카드와 연결선을 만든다.
 *
 * - 중심(parent 없는 노드)은 정확히 하나.
 * - "mindmap": 1단계 갈래를 하위 높이 합이 비슷하도록 오른쪽·왼쪽에 나눈다.
 *   "tree": 모두 오른쪽으로 편다.
 * - 부모는 자식 묶음의 세로 가운데에 놓인다. 선은 부모의 바깥 변에서 자식의 안쪽 변으로.
 * ───────────────────────────────────────────────────────────── */

export type Side = "top" | "right" | "bottom" | "left";

export interface MapNodeInput {
  key: string;
  parent?: string;
}

export interface MapLayoutOptions {
  layout?: "mindmap" | "tree";
  origin?: { x: number; y: number };
  /** 노드(메모) 한 변 길이. 메모는 정사각형. */
  size?: number;
  /** 중심 노드 한 변 길이. */
  rootSize?: number;
  gapX?: number;
  gapY?: number;
}

export interface PlacedNode {
  key: string;
  x: number;
  y: number;
  size: number;
  depth: number;
  side: "root" | "left" | "right";
}

export interface PlacedEdge {
  from: string;
  to: string;
  sourceSide: Side;
  targetSide: Side;
}

export function layoutMindmap(
  nodes: MapNodeInput[],
  opts: MapLayoutOptions = {},
): { nodes: PlacedNode[]; edges: PlacedEdge[] } {
  const size = opts.size ?? 240;
  const rootSize = opts.rootSize ?? 320;
  const gapX = opts.gapX ?? 140;
  const gapY = opts.gapY ?? 40;
  const origin = opts.origin ?? { x: 40, y: 40 };

  const byKey = new Map<string, MapNodeInput>();
  for (const n of nodes) {
    if (byKey.has(n.key)) throw new Error("key가 겹칩니다: " + n.key);
    byKey.set(n.key, n);
  }
  const roots = nodes.filter((n) => n.parent === undefined);
  if (roots.length !== 1) throw new Error("중심 노드(parent 없음)는 정확히 하나여야 합니다");
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parent === undefined) continue;
    if (!byKey.has(n.parent)) throw new Error("없는 parent: " + n.parent);
    children.set(n.parent, [...(children.get(n.parent) ?? []), n.key]);
  }
  const root = roots[0]!.key;

  // 하위 묶음 높이. 방문 표시로 순환을 잡는다(중심에서 닿지 않는 노드도 순환이다).
  const height = new Map<string, number>();
  const visiting = new Set<string>();
  const measure = (k: string): number => {
    if (visiting.has(k)) throw new Error("순환 parent: " + k);
    visiting.add(k);
    const kids = children.get(k) ?? [];
    const own = k === root ? rootSize : size;
    const sum = kids.reduce((s, c) => s + measure(c), 0) + gapY * Math.max(0, kids.length - 1);
    visiting.delete(k);
    const h = Math.max(own, sum);
    height.set(k, h);
    return h;
  };
  measure(root);
  if (height.size !== nodes.length) throw new Error("중심에서 닿지 않는 노드가 있습니다(순환 parent)");

  const top = children.get(root) ?? [];
  const right: string[] = [];
  const left: string[] = [];
  if (opts.layout === "tree") right.push(...top);
  else {
    const total = top.reduce((s, k) => s + height.get(k)!, 0);
    let acc = 0;
    for (const k of top) {
      // 순서를 지키며 앞쪽 절반은 오른쪽, 나머지는 왼쪽(위에서 아래로 읽힌다).
      if (acc < total / 2 || right.length === 0) {
        right.push(k);
        acc += height.get(k)!;
      } else left.push(k);
    }
  }

  const placed: PlacedNode[] = [];
  const edges: PlacedEdge[] = [];
  const rootCy = origin.y + rootSize / 2;
  placed.push({ key: root, x: origin.x, y: origin.y, size: rootSize, depth: 0, side: "root" });

  const place = (k: string, depth: number, side: "left" | "right", topY: number) => {
    const h = height.get(k)!;
    const step = size + gapX;
    const x =
      side === "right"
        ? origin.x + rootSize + gapX + (depth - 1) * step
        : origin.x - gapX - size - (depth - 1) * step;
    placed.push({ key: k, x, y: topY + h / 2 - size / 2, size, depth, side });
    const kids = children.get(k) ?? [];
    const kidsH = kids.reduce((s, c) => s + height.get(c)!, 0) + gapY * Math.max(0, kids.length - 1);
    let y = topY + (h - kidsH) / 2;
    for (const c of kids) {
      edges.push({ from: k, to: c, sourceSide: side, targetSide: side === "right" ? "left" : "right" });
      place(c, depth + 1, side, y);
      y += height.get(c)! + gapY;
    }
  };
  for (const [side, list] of [["right", right], ["left", left]] as const) {
    const h = list.reduce((s, k) => s + height.get(k)!, 0) + gapY * Math.max(0, list.length - 1);
    let y = rootCy - h / 2;
    for (const k of list) {
      edges.push({ from: root, to: k, sourceSide: side, targetSide: side === "right" ? "left" : "right" });
      place(k, 1, side, y);
      y += height.get(k)! + gapY;
    }
  }
  return { nodes: placed, edges };
}
