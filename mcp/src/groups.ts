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
  /**
   * 손으로 붙인 벽: key 해시로 정해지는 흔들림. 같은 입력이면 같은 결과다.
   * pos = 메모 위치(±px), rot = 기울기(±도), group = 묶음 위치(±px).
   */
  jitter?: { pos: number; rot: number; group: number };
}

export interface Rect { x: number; y: number; width: number; height: number; rotation?: number }

/** FNV-1a → [-1, 1]. 같은 문자열은 항상 같은 값. */
export function wobble(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

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
  const jt = opts.jitter;
  const shake = (key: string, amp: number) => (jt ? Math.round(wobble(key) * amp * 100) / 100 : 0);

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
      const fx = origin.x + c * (frameW + gx) + Math.round(shake(g.key + "#gx", jt?.group ?? 0));
      const fy = y + Math.round(shake(g.key + "#gy", jt?.group ?? 0));
      out.frames[g.key] = { x: fx, y: fy, width: frameW, height: h };
      g.notes.forEach((n, i) => {
        const row2 = Math.floor(i / noteCols);
        out.notes[n] = {
          // 벽: 홀수 줄은 살짝 밀어 벽돌처럼 어긋나게 한다.
          x: fx + pad + (i % noteCols) * (size + gap) + Math.round(shake(n + "#x", jt?.pos ?? 0)) + (jt && row2 % 2 ? Math.round(gap / 2) : 0),
          y: fy + pad + row2 * (size + gap) + Math.round(shake(n + "#y", jt?.pos ?? 0)),
          width: size,
          height: size,
          ...(jt ? { rotation: shake(n + "#r", jt.rot) } : {}),
        };
      });
    });
    y += h + gy;
  }
  return out;
}
