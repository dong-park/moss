import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetDB } from "@/state/db/schema";
import {
  __getTabId,
  __resetLiveSyncForTest,
  applyIncoming,
  attachLiveDoc,
  initLiveSync,
  MAX_UPDATE_BYTES,
  type YDocSyncMsg,
} from "@/state/db/liveSync";
import { putNote, readNote } from "@/state/ydoc/model";
import type { Note } from "@/state/db/schema";

const CHANNEL_NAME = "moss-ydoc-sync";

function makeNote(overrides: Partial<Note> = {}): Note {
  const now = Date.now();
  return {
    id: "n1",
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content: "hello",
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
    ...overrides,
  };
}

/** 다음 채널 메시지 1개를 받는다(타임아웃 시 reject). */
function nextMessage(ch: BroadcastChannel, timeout = 1000): Promise<YDocSyncMsg> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      ch.removeEventListener("message", onMsg);
      reject(new Error("no message"));
    }, timeout);
    const onMsg = (ev: MessageEvent) => {
      clearTimeout(t);
      ch.removeEventListener("message", onMsg);
      resolve(ev.data as YDocSyncMsg);
    };
    ch.addEventListener("message", onMsg);
  });
}

beforeEach(() => {
  __resetLiveSyncForTest();
});

afterEach(async () => {
  __resetLiveSyncForTest();
  await resetDB();
});

describe("liveSync — Yjs 업데이트 발신", () => {
  it("로컬 origin 쓰기가 ydoc-update를 다른 탭 채널로 방송한다", async () => {
    initLiveSync();
    const doc = new Y.Doc();
    attachLiveDoc(doc, "system");
    const listener = new BroadcastChannel(CHANNEL_NAME);
    try {
      const got = nextMessage(listener);
      putNote(doc, makeNote({ id: "n1", content: "new" }));
      const msg = await got;
      expect(msg.type).toBe("ydoc-update");
      expect(msg.key).toBe("system");
      expect(msg.origin).toBe(__getTabId());
      // 구조화 복제를 거치면 다른 realm의 Uint8Array가 될 수 있어 바이트 길이로 본다.
      expect(new Uint8Array(msg.update).byteLength).toBeGreaterThan(0);
    } finally {
      listener.close();
    }
  });

  it("로컬 origin이 아닌 적용(원격)은 재방송하지 않는다", () => {
    const doc = new Y.Doc();
    attachLiveDoc(doc, "system");
    const listener = new BroadcastChannel(CHANNEL_NAME);
    const received: YDocSyncMsg[] = [];
    listener.addEventListener("message", (ev) => received.push(ev.data as YDocSyncMsg));
    try {
      // 다른 출처(채널)로 적용 — 재방송 금지.
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(new Y.Doc()), { kind: "remote" });
    } finally {
      listener.close();
    }
    expect(received).toHaveLength(0);
  });
});

describe("liveSync — Yjs 업데이트 수신", () => {
  it("다른 탭 업데이트를 문서에 적용한다", () => {
    const docs = new Y.Doc();
    putNote(docs, makeNote({ id: "n1", content: "from-source" }));
    const update = Y.encodeStateAsUpdate(docs);

    const target = new Y.Doc();
    attachLiveDoc(target, "system");
    applyIncoming({ type: "ydoc-update", key: "system", update, origin: "other-tab" });

    expect(readNote(target, "n1")?.content).toBe("from-source");
  });

  it("자기 발신(origin === 내 탭 id)은 무시한다", () => {
    const docs = new Y.Doc();
    putNote(docs, makeNote({ id: "n1", content: "x" }));
    const target = new Y.Doc();
    attachLiveDoc(target, "system");
    applyIncoming({
      type: "ydoc-update",
      key: "system",
      update: Y.encodeStateAsUpdate(docs),
      origin: __getTabId(),
    });
    expect(readNote(target, "n1")).toBeUndefined();
  });

  it("다른 보드 키의 업데이트는 무시한다", () => {
    const docs = new Y.Doc();
    putNote(docs, makeNote({ id: "n1", content: "x" }));
    const target = new Y.Doc();
    attachLiveDoc(target, "system");
    applyIncoming({
      type: "ydoc-update",
      key: "other-board",
      update: Y.encodeStateAsUpdate(docs),
      origin: "other-tab",
    });
    expect(readNote(target, "n1")).toBeUndefined();
  });

  it("문서가 붙어 있지 않으면 수신은 no-op", () => {
    const docs = new Y.Doc();
    putNote(docs, makeNote({ id: "n1", content: "x" }));
    expect(() =>
      applyIncoming({
        type: "ydoc-update",
        key: "system",
        update: Y.encodeStateAsUpdate(docs),
        origin: "other-tab",
      }),
    ).not.toThrow();
  });

  it("(6(e)) Uint8Array가 아닌 update는 조용히 버린다", () => {
    const docs = new Y.Doc();
    putNote(docs, makeNote({ id: "n1", content: "x" }));
    const target = new Y.Doc();
    attachLiveDoc(target, "system");
    expect(() =>
      applyIncoming({
        type: "ydoc-update",
        key: "system",
        update: "not-bytes" as unknown as Uint8Array,
        origin: "other-tab",
      }),
    ).not.toThrow();
    expect(readNote(target, "n1")).toBeUndefined();
  });

  it("(6(e)) 상한(10MB)을 넘는 update는 버린다", () => {
    const target = new Y.Doc();
    attachLiveDoc(target, "system");
    const huge = new Uint8Array(MAX_UPDATE_BYTES + 1);
    expect(() =>
      applyIncoming({
        type: "ydoc-update",
        key: "system",
        update: huge,
        origin: "other-tab",
      }),
    ).not.toThrow();
  });
});

describe("liveSync — 멱등 init", () => {
  it("initLiveSync는 여러 번 호출해도 한 번만 시작한다(같은 dispose)", () => {
    const d1 = initLiveSync();
    const d2 = initLiveSync();
    expect(d1).toBe(d2);
  });
});
