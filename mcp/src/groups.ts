/* ─────────────────────────────────────────────────────────────
 * 묶음 지도 배치 — 주제마다 메모판 하나, 판 안에 메모를 격자로 놓는다.
 * 순수 함수다. map_groups 도구가 이 결과로 판·메모를 만든다.
 *
 * - 맨 위 가운데에 제목 메모(center) 하나를 둘 수 있다.
 * - 판은 한 줄에 groupCols개씩, 판 안의 메모는 한 줄에 noteCols개씩 놓는다.
 * - 같은 줄의 판은 높이를 맞춘다(줄 맞춤이 눈에 편하다).
 * ───────────────────────────────────────────────────────────── */

export interface GroupsInput {
  hasCenter: boolean;
  groups: { key: string; notes: string[] }[];
}

export interface GroupsOptions {
  origin?: { x: number; y: number };
  size?: number;
  centerSize?: number;
  noteCols?: number;
  groupCols?: number;
  gap?: number;
  pad?: number;
  groupGapX?: number;
  groupGapY?: number;
}

export interface Rect { x: number; y: number; width: number; height: number }

export interface GroupsLayout {
  center?: Rect;
  frames: Record<string, Rect>;
  notes: Record<string, Rect>;
}

export function layoutGroups(input: GroupsInput, opts: GroupsOptions = {}): GroupsLayout {
  const size = opts.size ?? 200;
  const centerSize = opts.centerSize ?? 280;
  const noteCols = opts.noteCols ?? 3;
  const groupCols = opts.groupCols ?? 3;
  const gap = opts.gap ?? 24;
  const pad = opts.pad ?? 32;
  const gx = opts.groupGapX ?? 120;
  const gy = opts.groupGapY ?? 120;
  const origin = opts.origin ?? { x: 40, y: 40 };

  const seen = new Set<string>();
  for (const g of input.groups) {
    if (seen.has(g.key)) throw new Error("key가 겹칩니다: " + g.key);
    seen.add(g.key);
    for (const n of g.notes) {
      if (seen.has(n)) throw new Error("key가 겹칩니다: " + n);
      seen.add(n);
    }
  }

  const frameW = pad * 2 + noteCols * size + (noteCols - 1) * gap;
  const frameH = (n: number) => {
    const rows = Math.max(1, Math.ceil(n / noteCols));
    return pad * 2 + rows * size + (rows - 1) * gap;
  };
  const cols = Math.min(groupCols, Math.max(1, input.groups.length));
  const totalW = cols * frameW + (cols - 1) * gx;

  const out: GroupsLayout = { frames: {}, notes: {} };
  let y = origin.y;
  if (input.hasCenter) {
    out.center = { x: origin.x + (totalW - centerSize) / 2, y, width: centerSize, height: centerSize };
    y += centerSize + gy;
  }
  for (let r = 0; r * groupCols < input.groups.length; r++) {
    const row = input.groups.slice(r * groupCols, (r + 1) * groupCols);
    const h = Math.max(...row.map((g) => frameH(g.notes.length)));
    row.forEach((g, c) => {
      const fx = origin.x + c * (frameW + gx);
      out.frames[g.key] = { x: fx, y, width: frameW, height: h };
      g.notes.forEach((n, i) => {
        out.notes[n] = {
          x: fx + pad + (i % noteCols) * (size + gap),
          y: y + pad + Math.floor(i / noteCols) * (size + gap),
          width: size,
          height: size,
        };
      });
    });
    y += h + gy;
  }
  return out;
}
