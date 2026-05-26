/**
 * 코사인 기반 단순 클러스터링 (FEAT-ai-pipeline §0, §6).
 *
 * single-pass online clustering — 메모 500개 이하 데이터셋용.
 * 알고리즘:
 *   1) 입력을 순서대로 본다 (저장 순서가 시드).
 *   2) 각 메모마다 현재 클러스터들의 centroid와 코사인 유사도를 비교한다.
 *   3) 임계값 이상의 가장 가까운 클러스터에 합친다(centroid 업데이트).
 *   4) 없으면 새 클러스터를 만든다.
 *
 * O(N × K). K는 결과 클러스터 수. k-means/HNSW는 다음 iteration(메모 500+ 시점).
 *
 * 순수 함수 — Dexie/React 의존성 없음.
 */

import { cosineSimilarity } from "./connectionScore";

export interface ClusterInput {
  id: string;
  vector: Float32Array | number[];
}

export interface NoteCluster {
  id: string;
  members: string[];
  centroid: number[];
  size: number;
}

export interface ClusterOptions {
  /** 두 메모를 같은 클러스터로 묶을 코사인 임계 (기본 0.78). */
  threshold?: number;
}

const DEFAULT_THRESHOLD = 0.78;

export function clusterNotes(
  notes: ClusterInput[],
  options: ClusterOptions = {},
): NoteCluster[] {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const clusters: NoteCluster[] = [];

  for (const note of notes) {
    if (note.vector.length === 0) continue;

    let bestCluster: NoteCluster | null = null;
    let bestSim = -Infinity;
    for (const cluster of clusters) {
      const sim = cosineSimilarity(cluster.centroid, note.vector);
      if (sim > bestSim) {
        bestSim = sim;
        bestCluster = cluster;
      }
    }

    if (bestCluster && bestSim >= threshold) {
      mergeIntoCluster(bestCluster, note);
    } else {
      clusters.push({
        id: `cluster-${clusters.length + 1}`,
        members: [note.id],
        centroid: toArray(note.vector),
        size: 1,
      });
    }
  }

  return clusters;
}

function mergeIntoCluster(cluster: NoteCluster, note: ClusterInput) {
  const n = cluster.size;
  const dims = cluster.centroid.length;
  const v = note.vector;
  const next = new Array<number>(dims);
  for (let i = 0; i < dims; i++) {
    next[i] = (cluster.centroid[i] * n + v[i]) / (n + 1);
  }
  cluster.centroid = next;
  cluster.members.push(note.id);
  cluster.size = n + 1;
}

function toArray(v: Float32Array | number[]): number[] {
  if (Array.isArray(v)) return v.slice();
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i];
  return out;
}
