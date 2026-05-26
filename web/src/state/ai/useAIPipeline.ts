"use client";

import { useCallback } from "react";
import { getDB, type Connection, type Note } from "../db/schema";
import { useStorage } from "../storage";
import { filterNotesForAI, type AINoteRef } from "../aiGate";
import { enqueueEmbed as enqueueEmbedRaw } from "./embeddingQueue";
import { callAISummarize, callAIConnectionLabel } from "./client";
import { contentHash } from "./hash";
import {
  computeConnectionCandidates,
  type ConnectionCandidate,
  type RejectedPair,
  type ScoredNote,
} from "./connectionScore";
import { clusterNotes, type NoteCluster } from "./cluster";
import type { SummarizeKind } from "@/server/ai/summarize";

/**
 * FEAT-ai-pipeline 클라이언트 진입점.
 *
 * Slice 1: enqueueEmbed + getEmbedding.
 * Slice 2(P0-1): summarizeBoard / findConnections / clusterRecent.
 *
 * AI 차단 보장:
 * - globalOptOut/aiOptOut은 filterNotesForAI를 통과한 메모만 페이로드에 실린다.
 * - fetch는 client.ts의 단일 진입점을 거친다 (ESLint 가드 단일 화이트리스트).
 */

export interface ClusterRecentResult {
  clusters: NoteCluster[];
  summary: string;
}

export interface AIPipelineApi {
  enqueueEmbed: (noteId: string, content: string, aiOptOut: boolean) => void;
  getEmbedding: (noteId: string) => Promise<Float32Array | null>;
  summarizeBoard: (boardId: string, kind: SummarizeKind) => Promise<string>;
  findConnections: (
    noteId: string,
    topK?: number,
  ) => Promise<ConnectionCandidate[]>;
  clusterRecent: (days?: number) => Promise<ClusterRecentResult>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RECENT_DAYS = 7;
const SUMMARIZE_BATCH_MAX = 50;

function toRef(note: Note): AINoteRef {
  return {
    id: note.id,
    title: note.content.split("\n")[0]?.slice(0, 40) || "(빈 메모)",
    aiOptOut: note.aiOptOut,
  };
}

async function loadEmbeddingsFor(noteIds: string[]) {
  const rows = await getDB().embeddings.bulkGet(noteIds);
  const map = new Map<string, Float32Array>();
  for (const row of rows) {
    if (!row) continue;
    const v =
      row.vector instanceof Float32Array
        ? row.vector
        : Float32Array.from(row.vector as unknown as ArrayLike<number>);
    map.set(row.noteId, v);
  }
  return map;
}

async function loadRejectedPairs(): Promise<RejectedPair[]> {
  const rows = await getDB()
    .connections.where("status")
    .equals("rejected")
    .toArray();
  return rows.map((c: Connection) => ({
    a: c.sourceNoteId,
    b: c.targetNoteId,
    rejectedAt: c.createdAt,
  }));
}

export function useAIPipeline(): AIPipelineApi {
  const globalOptOut = useStorage(
    (s) => s.settings?.aiOptOutGlobal ?? false,
  );

  const enqueueEmbed = useCallback(
    (noteId: string, content: string, aiOptOut: boolean) => {
      enqueueEmbedRaw(noteId, content, aiOptOut);
    },
    [],
  );

  const getEmbedding = useCallback(
    async (noteId: string): Promise<Float32Array | null> => {
      const row = await getDB().embeddings.get(noteId);
      if (!row) return null;
      return row.vector instanceof Float32Array
        ? row.vector
        : Float32Array.from(row.vector as unknown as ArrayLike<number>);
    },
    [],
  );

  const summarizeBoard = useCallback(
    async (boardId: string, kind: SummarizeKind): Promise<string> => {
      if (globalOptOut) return "";
      const notes = await getDB().notes.where("boardId").equals(boardId).toArray();
      const { allowed } = filterNotesForAI(notes.map(toRef), false);
      if (allowed.length === 0) return "";

      const allowedIds = new Set(allowed.map((a) => a.id));
      const texts = notes
        .filter((n) => allowedIds.has(n.id) && n.content.trim().length > 0)
        .slice(0, SUMMARIZE_BATCH_MAX)
        .map((n) => n.content);
      if (texts.length === 0) return "";

      const res = await callAISummarize(texts, kind);
      return res.text;
    },
    [globalOptOut],
  );

  const findConnections = useCallback(
    async (
      noteId: string,
      topK = 10,
    ): Promise<ConnectionCandidate[]> => {
      if (globalOptOut) return [];
      const source = await getDB().notes.get(noteId);
      if (!source || source.aiOptOut) return [];

      const candidates = await getDB()
        .notes.filter((n) => !n.aiOptOut && n.id !== noteId)
        .toArray();
      const allIds = [noteId, ...candidates.map((n) => n.id)];
      const embeddings = await loadEmbeddingsFor(allIds);
      const srcVec = embeddings.get(noteId);
      if (!srcVec) return [];

      const scored: ScoredNote[] = [];
      scored.push({
        id: source.id,
        boardId: source.boardId,
        createdAt: source.createdAt,
        vector: srcVec,
      });
      for (const n of candidates) {
        const v = embeddings.get(n.id);
        if (!v) continue;
        scored.push({
          id: n.id,
          boardId: n.boardId,
          createdAt: n.createdAt,
          vector: v,
        });
      }

      const rejected = await loadRejectedPairs();
      const all = computeConnectionCandidates(scored, { rejectedPairs: rejected });
      return all
        .filter((c) => c.sourceId === noteId || c.targetId === noteId)
        .slice(0, topK);
    },
    [globalOptOut],
  );

  const clusterRecent = useCallback(
    async (days = DEFAULT_RECENT_DAYS): Promise<ClusterRecentResult> => {
      if (globalOptOut) return { clusters: [], summary: "" };
      const cutoff = Date.now() - days * DAY_MS;
      const recent = await getDB()
        .notes.where("createdAt")
        .above(cutoff)
        .filter((n) => !n.aiOptOut)
        .toArray();
      if (recent.length === 0) return { clusters: [], summary: "" };

      const embeddings = await loadEmbeddingsFor(recent.map((n) => n.id));
      const inputs = recent
        .map((n) => {
          const v = embeddings.get(n.id);
          return v ? { id: n.id, vector: v } : null;
        })
        .filter((x): x is { id: string; vector: Float32Array } => x !== null);
      if (inputs.length === 0) return { clusters: [], summary: "" };

      const clusters = clusterNotes(inputs);
      const noteById = new Map(recent.map((n) => [n.id, n]));
      const topClusters = [...clusters]
        .sort((a, b) => b.size - a.size)
        .slice(0, 5);
      const summaryTexts = topClusters
        .map((c) => noteById.get(c.members[0])?.content ?? "")
        .filter((t) => t.length > 0);
      let summary = "";
      if (summaryTexts.length > 0) {
        const res = await callAISummarize(
          summaryTexts.slice(0, SUMMARIZE_BATCH_MAX),
          "cluster",
        );
        summary = res.text;
      }
      return { clusters, summary };
    },
    [globalOptOut],
  );

  return {
    enqueueEmbed,
    getEmbedding,
    summarizeBoard,
    findConnections,
    clusterRecent,
  };
}

// 향후 호출 라벨 생성 헬퍼는 만들면 곧장 사용할 수 있도록 모듈 레벨로 export.
export async function generateConnectionLabel(
  textA: string,
  textB: string,
): Promise<string> {
  // 본 함수는 useAIGate confirm 모달이 이미 통과된 직후 호출 전제.
  const ahash = await contentHash(textA);
  const bhash = await contentHash(textB);
  // 동일 쌍이면 캐시할 자리 — Slice 3 도입 시 IDB connections.label에 저장.
  void ahash;
  void bhash;
  const res = await callAIConnectionLabel(textA, textB);
  return res.label;
}
