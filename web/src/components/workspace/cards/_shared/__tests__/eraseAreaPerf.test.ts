/**
 * wall-marker 리뷰 W3 — 천으로 지우고 손을 떼는 순간의 비용. 닦은 경로 W개 점 × 획 N개 표본을
 * 전수 비교하면 수천만 번이다. 경로를 솎고 격자로 후보를 좁혀도 결과(잘린 조각·id)는 같아야
 * 한다. 기준 구현(전수 비교)과 무작위 장면에서 결과를 맞춰 보고, 큰 장면의 걸린 시간을 남긴다.
 */
import { describe, expect, it } from "vitest";
import { eraseArea, type DrawingStroke } from "../useDrawing";
import type { HandwritingPoint } from "@/state/cardContent";

/** 결정적 난수(mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scene(
  seed: number,
  strokeCount: number,
  pointsPerStroke: number,
  span: number,
  jitter = 30,
) {
  const rand = rng(seed);
  const strokes: DrawingStroke[] = [];
  for (let i = 0; i < strokeCount; i++) {
    let x = rand() * span;
    let y = rand() * span;
    const points: HandwritingPoint[] = [];
    for (let k = 0; k < pointsPerStroke; k++) {
      points.push({ x: +x.toFixed(1), y: +y.toFixed(1) });
      x += (rand() - 0.5) * jitter;
      y += (rand() - 0.5) * jitter;
    }
    strokes.push({ id: `s${i}`, points, color: "black", width: "thin" });
  }
  return { strokes, rand };
}

/** 지그재그로 장면을 훑는 닦은 경로. 점 사이 간격은 [minStep, maxStep]. */
function wipe(rand: () => number, count: number, span: number, minStep: number, maxStep: number) {
  const out: HandwritingPoint[] = [];
  let x = rand() * span;
  let y = rand() * span;
  let dir = 0;
  for (let i = 0; i < count; i++) {
    out.push({ x: +x.toFixed(1), y: +y.toFixed(1) });
    if (i % 17 === 0) dir = rand() * Math.PI * 2;
    const step = minStep + rand() * (maxStep - minStep);
    x += Math.cos(dir) * step;
    y += Math.sin(dir) * step;
  }
  return out;
}

/* ── 기준 구현: 전수 비교(리뷰 이전 eraseArea와 같은 판정) ── */
function refDistSq(p: HandwritingPoint, a: HandwritingPoint, b: HandwritingPoint) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = p.x - (a.x + abx * t);
  const dy = p.y - (a.y + aby * t);
  return dx * dx + dy * dy;
}
function refErase(
  strokes: readonly DrawingStroke[],
  wipePath: readonly HandwritingPoint[],
  radius: number,
) {
  const removedIds: string[] = [];
  const added: Array<{ of: string; points: HandwritingPoint[] }> = [];
  const step = Math.max(radius / 2, 0.5);
  const r2 = radius * radius;
  const touches = (p: HandwritingPoint) => {
    if (wipePath.length === 1) return (p.x - wipePath[0].x) ** 2 + (p.y - wipePath[0].y) ** 2 <= r2;
    for (let i = 0; i + 1 < wipePath.length; i++) {
      if (refDistSq(p, wipePath[i], wipePath[i + 1]) <= r2) return true;
    }
    return false;
  };
  for (const stroke of strokes) {
    const samples: Array<HandwritingPoint & { orig: boolean }> = [];
    stroke.points.forEach((cur, i) => {
      if (i > 0) {
        const prev = stroke.points[i - 1];
        const n = Math.min(Math.ceil(Math.hypot(cur.x - prev.x, cur.y - prev.y) / step), 2048);
        for (let k = 1; k < n; k++) {
          const t = k / n;
          samples.push({
            x: prev.x + (cur.x - prev.x) * t,
            y: prev.y + (cur.y - prev.y) * t,
            orig: false,
          });
        }
      }
      samples.push({ x: cur.x, y: cur.y, orig: true });
    });
    const hit = samples.map(touches);
    if (!hit.includes(true)) continue;
    removedIds.push(stroke.id);
    let run: typeof samples = [];
    const flush = () => {
      if (run.length >= 2) {
        const last = run.length - 1;
        const points = run
          .filter((s, i) => s.orig || i === 0 || i === last)
          .map(({ x, y }) => ({ x, y }));
        if (points.length >= 2) added.push({ of: stroke.id, points });
      }
      run = [];
    };
    samples.forEach((s, i) => {
      if (hit[i]) flush();
      else run.push(s);
    });
    flush();
  }
  return { removedIds, added };
}

describe("eraseArea — 기준 구현(전수 비교)과 같은 결과", () => {
  it("무작위 장면 40개에서 지워진 id와 남은 조각의 점이 같다", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { strokes, rand } = scene(seed, 25, 12, 400);
      const radius = 6 + (seed % 5) * 3;
      // 점 간격이 radius/2 이상이라 경로 솎기가 아무것도 빼지 않는다 — 판정만 비교한다.
      const path = wipe(rand, 30, 400, radius / 2 + 0.5, radius * 2);
      let n = 0;
      const got = eraseArea(strokes, path, radius, () => `p${++n}`);
      const want = refErase(strokes, path, radius);
      expect(got.removedIds).toEqual(want.removedIds);
      expect(got.added.map((a) => a.points)).toEqual(want.added.map((a) => a.points));
    }
  });

  it("점 하나짜리 닦은 경로도 같다", () => {
    const { strokes } = scene(7, 30, 10, 200);
    const path = [{ x: 100, y: 100 }];
    const got = eraseArea(strokes, path, 20, () => "x");
    expect(got.removedIds).toEqual(refErase(strokes, path, 20).removedIds);
  });
});

describe("eraseArea — 큰 장면의 걸린 시간", () => {
  it("획 1,000개 · 닦은 경로 400점(장면 전체를 가로지르는 사인파)", () => {
    const span = 1500;
    // 손으로 그은 획은 점이 수백 개다 — 150점짜리 획 1,000개.
    const { strokes } = scene(99, 1000, 150, span, 20);
    const radius = 12;
    // 장면 전체를 가로지르는 경로 — 닦은 경로의 경계 상자가 모든 획을 덮어 상자 거름이 못 줄인다.
    // 점 간격은 촘촘하다(포인터 이동 이벤트).
    const path: HandwritingPoint[] = [];
    for (let i = 0; i < 400; i++) {
      path.push({
        x: +((i / 399) * span).toFixed(1),
        y: +(span / 2 + Math.sin(i / 10) * span * 0.45).toFixed(1),
      });
    }
    const t0 = performance.now();
    const r = eraseArea(strokes, path, radius, () => "x");
    const ms = performance.now() - t0;
    console.log(`[W3] eraseArea 획 1000 · 경로 400점: ${ms.toFixed(0)}ms (지워진 획 ${r.removedIds.length})`);
    expect(r.removedIds.length).toBeGreaterThan(0);
    // 기록(개발 기기): 전수 비교 ≈ 205ms → 솎기·격자 ≈ 25ms. 부하에 흔들리지 않게 여유를 둔다.
    expect(ms).toBeLessThan(150);
  });
});
