"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-multitab-sync (W8) — 다중 탭 동기화.
 *
 * 두 탭이 같은 보드를 열었을 때 한쪽 편집이 다른 쪽을 조용히 덮어쓰지 않도록,
 * 카드 변경을 BroadcastChannel로 탭 간 전파한다.
 *
 *  - 발신: Dexie 테이블 훅(creating/updating/deleting)을 걸어 notes 쓰기가
 *    "트랜잭션 커밋 완료" 시점에 {card-upsert|card-delete} 메시지를 방송한다.
 *    persistCard/storage.saveNote 본문은 건드리지 않는다(seam 불필요 — 훅으로 가로챔).
 *  - 수신: 메시지의 origin이 자기 탭이면 무시(자기 발신), updatedAt이 이미 본 것보다
 *    오래되면 무시(stale). 편집 중(editingId/expandedCardId)인 카드는 덮어쓰지 않고
 *    충돌 플래그만 세워 배너로 알린다(커서 보호). 그 외에는 DB에서 최신 노트를 읽어
 *    store(cards)에 반영한다.
 *
 * 단일 탭에서는 BroadcastChannel이 자기 발신 메시지를 자기 인스턴스에 돌려주지
 * 않으므로 수신 이벤트 0 (AC-4).
 *
 * 메시지 모델은 spec §5: { type, boardId, id, updatedAt } (+ origin 탭 id).
 * ───────────────────────────────────────────────────────────── */

import { type Transaction } from "dexie";
import { getDB, type MossDB, type Note } from "./schema";
import { migratedContent } from "../markdownMigration";
import {
  parseCode,
  parseHandwriting,
  serializeBlocks,
  type CardBlock,
} from "../cardContent";
import {
  useWorkspace,
  SYSTEM_BOARD_ID,
  type Card,
  type CardKind,
} from "../workspace";

const CHANNEL_NAME = "moss-card-sync";

export type CardSyncMsg = {
  type: "card-upsert" | "card-delete";
  /** storage 기준 boardId (시스템 보드는 null). */
  boardId: string | null;
  id: string;
  updatedAt: number;
  /** 발신 탭 id — 자기 발신 무시용. broadcastCardChange가 채운다. */
  origin?: string;
};

/** 탭별 고유 id — 자기 발신 메시지 식별. 탭(문서) 수명 동안 불변. */
const tabId = makeTabId();

function makeTabId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* noop */
  }
  return `tab-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** id별 마지막으로 관측한 updatedAt — 단조 증가만 수용해 stale 메시지 무시. */
const lastSeen = new Map<string, number>();

function bumpSeen(id: string, updatedAt: number): void {
  const prev = lastSeen.get(id) ?? 0;
  if (updatedAt > prev) lastSeen.set(id, updatedAt);
}

/* ── 충돌 배너 store (편집 중 외부 변경 발생) ───────────────────── */

const conflicts = new Set<string>();
const conflictListeners = new Set<() => void>();

function emitConflicts(): void {
  for (const l of conflictListeners) l();
}

function setConflict(id: string): void {
  if (conflicts.has(id)) return;
  conflicts.add(id);
  emitConflicts();
}

function clearConflictInternal(id: string): void {
  if (!conflicts.delete(id)) return;
  emitConflicts();
}

/** 충돌 상태 구독(useSyncExternalStore용). 변경 시 cb 호출. */
export function subscribeConflict(cb: () => void): () => void {
  conflictListeners.add(cb);
  return () => {
    conflictListeners.delete(cb);
  };
}

/** 해당 카드가 "다른 탭에서 변경됨" 충돌 상태인지. */
export function isCardConflicted(id: string): boolean {
  return conflicts.has(id);
}

/**
 * 충돌 해소("새로고침") — DB의 최신 버전을 store에 강제 반영하고 편집을 닫는다.
 * 노트가 사라졌으면(다른 탭에서 삭제) store에서도 제거한다.
 */
export async function resolveConflict(id: string): Promise<void> {
  const ws = useWorkspace.getState();
  const note = await getDB().notes.get(id);
  if (!note) {
    // 다른 탭에서 삭제됨 — store에서 제거 + 편집 종료.
    if (ws.cards.some((c) => c.id === id)) {
      useWorkspace.setState({
        cards: ws.cards.filter((c) => c.id !== id),
      });
    }
    if (ws.editingId === id) useWorkspace.setState({ editingId: null });
    if (ws.expandedCardId === id) {
      useWorkspace.setState({ expandedCardId: null });
    }
    bumpSeen(id, Date.now());
    clearConflictInternal(id);
    return;
  }
  bumpSeen(id, note.updatedAt);
  // 편집 종료 후 카드 교체 — 에디터가 새 content로 재마운트되도록.
  if (ws.editingId === id) useWorkspace.setState({ editingId: null });
  if (currentStorageBoardId() === note.boardId) {
    replaceCard(note);
  } else if (ws.cards.some((c) => c.id === id)) {
    // 다른 보드로 이동됨 — 현재 보드 뷰에서 제거.
    useWorkspace.setState({
      cards: useWorkspace.getState().cards.filter((c) => c.id !== id),
    });
  }
  clearConflictInternal(id);
}

/* ── 현재 보드 매핑 ─────────────────────────────────────────────── */

/** 현재 열린 보드의 storage boardId(시스템 보드는 null). */
function currentStorageBoardId(): string | null {
  const id = useWorkspace.getState().currentBoardId;
  return id === SYSTEM_BOARD_ID ? null : id;
}

function isEditing(id: string): boolean {
  const ws = useWorkspace.getState();
  return ws.editingId === id || ws.expandedCardId === id;
}

/* ── 발신 ──────────────────────────────────────────────────────── */

let channel: BroadcastChannel | null = null;

/** 카드 변경을 다른 탭에 방송한다. origin(자기 탭 id)을 실어 보낸다. */
export function broadcastCardChange(msg: CardSyncMsg): void {
  bumpSeen(msg.id, msg.updatedAt);
  if (!channel) return;
  try {
    channel.postMessage({ ...msg, origin: tabId });
  } catch {
    /* 직렬화/전송 실패는 동기화 best-effort라 무시 */
  }
}

/* ── 수신 / 반영 ───────────────────────────────────────────────── */

/** notes row → 캔버스 Card. workspace.decodeNoteToCard의 충실한 포트.
 * (live 쓰기 content는 이미 마이그레이션 후라 레거시 분기는 방어용이다.) */
function noteToCard(note: Note): Card {
  if (note.kind === "board") {
    let boardRef: string | undefined;
    try {
      const parsed = JSON.parse(note.content) as {
        __moss_subcanvas_v1__?: boolean;
        boardRef?: string;
      };
      if (parsed.__moss_subcanvas_v1__) boardRef = parsed.boardRef || undefined;
    } catch {
      /* 손상된 content — boardRef 없음 */
    }
    return {
      id: note.id,
      kind: "board",
      x: note.x,
      y: note.y,
      width: note.width,
      height: note.height,
      content: "",
      boardRef,
      lastVisitedAt: note.lastVisitedAt,
    };
  }

  let kind: CardKind = note.kind;
  let content = note.content;
  let author: string | undefined;
  let time: string | undefined;

  if (note.kind === "text" && content.startsWith("{")) {
    try {
      const parsed = JSON.parse(content) as {
        __moss_comment_v1__?: boolean;
        $comment?: boolean;
        author?: string;
        time?: string;
        body?: string;
      };
      if (parsed.__moss_comment_v1__ === true || parsed.$comment === true) {
        kind = "comment";
        content = String(parsed.body ?? "");
        author = parsed.author ?? undefined;
        time = parsed.time ?? undefined;
      }
    } catch {
      /* plain text */
    }
  }

  if (note.kind === "code") {
    const { code, lang } = parseCode(content);
    const block: CardBlock = lang
      ? { type: "code", code, lang }
      : { type: "code", code };
    kind = "text";
    content = serializeBlocks([block]);
  } else if (note.kind === "handwriting") {
    const { paths } = parseHandwriting(content);
    kind = "text";
    content = serializeBlocks([{ type: "handwriting", paths }]);
  } else {
    const md = migratedContent(note.kind, content);
    if (md !== null) {
      kind = "text";
      content = serializeBlocks([{ type: "text", text: md }]);
    }
  }

  return {
    id: note.id,
    kind,
    x: note.x,
    y: note.y,
    width: note.width,
    height: note.height,
    content,
    attachmentRef: note.attachmentRef,
    mediaType: note.mediaType,
    overlay: note.overlay,
    // FEAT-memo-title: 여러 탭 동기화 변환에도 제목이 실린다.
    title: note.title,
    author,
    time,
    aiOptOut: note.aiOptOut || undefined,
    lastVisitedAt: note.lastVisitedAt,
  };
}

function replaceCard(note: Note): void {
  const card = noteToCard(note);
  const cards = useWorkspace.getState().cards;
  const exists = cards.some((c) => c.id === card.id);
  useWorkspace.setState({
    cards: exists
      ? cards.map((c) => (c.id === card.id ? card : c))
      : [...cards, card],
  });
}

function removeCard(id: string): void {
  const cards = useWorkspace.getState().cards;
  if (!cards.some((c) => c.id === id)) return;
  useWorkspace.setState({ cards: cards.filter((c) => c.id !== id) });
}

/**
 * 다른 탭에서 온 메시지를 처리한다. 자기 발신·stale은 무시, 편집 중이면 보호.
 * 채널 수신뿐 아니라 단위 테스트에서도 직접 호출한다.
 */
export async function handleIncoming(msg: CardSyncMsg): Promise<void> {
  if (!msg || msg.origin === tabId) return; // 자기 발신
  const seen = lastSeen.get(msg.id) ?? 0;
  if (msg.updatedAt <= seen) return; // stale
  bumpSeen(msg.id, msg.updatedAt);

  if (msg.type === "card-delete") {
    if (isEditing(msg.id)) {
      setConflict(msg.id);
      return;
    }
    removeCard(msg.id);
    clearConflictInternal(msg.id);
    return;
  }

  // card-upsert — 최신 노트를 DB(커밋 완료된 상태)에서 읽는다.
  const note = await getDB().notes.get(msg.id);
  if (!note) return; // 경쟁 상태로 사라짐
  const onCurrentBoard = note.boardId === currentStorageBoardId();
  if (!onCurrentBoard) {
    // 다른 보드로 이동/생성 — 현재 뷰에 있으면 제거(이동), 없으면 무시.
    if (!isEditing(msg.id)) {
      removeCard(msg.id);
      clearConflictInternal(msg.id);
    } else {
      setConflict(msg.id);
    }
    return;
  }
  if (isEditing(msg.id)) {
    setConflict(msg.id); // 편집 중 — 덮어쓰기 금지, 배너만
    return;
  }
  replaceCard(note);
  clearConflictInternal(msg.id);
}

/* ── Dexie 훅: notes 쓰기 → 커밋 완료 시 방송 ────────────────────── */

let hookDispose: (() => void) | null = null;

function registerHooks(db: MossDB): () => void {
  const onCreate = (_primKey: string, obj: Note, trans: Transaction) => {
    const { id, boardId, updatedAt } = obj;
    trans.on("complete", () =>
      broadcastCardChange({ type: "card-upsert", id, boardId, updatedAt }),
    );
  };

  const onUpdate = (
    mods: object,
    _primKey: string,
    obj: Note,
    trans: Transaction,
  ) => {
    const next = { ...obj, ...(mods as Partial<Note>) };
    trans.on("complete", () =>
      broadcastCardChange({
        type: "card-upsert",
        id: next.id,
        boardId: next.boardId,
        updatedAt: next.updatedAt,
      }),
    );
  };

  const onDelete = (_primKey: string, obj: Note, trans: Transaction) => {
    const { id, boardId } = obj;
    trans.on("complete", () =>
      broadcastCardChange({
        type: "card-delete",
        id,
        boardId,
        updatedAt: Date.now(),
      }),
    );
  };

  db.notes.hook("creating", onCreate);
  db.notes.hook("updating", onUpdate);
  db.notes.hook("deleting", onDelete);

  return () => {
    db.notes.hook.creating.unsubscribe(onCreate);
    db.notes.hook.updating.unsubscribe(onUpdate);
    db.notes.hook.deleting.unsubscribe(onDelete);
  };
}

/* ── 수명 ──────────────────────────────────────────────────────── */

let started = false;
let dispose: (() => void) | null = null;

/**
 * 다중 탭 동기화 시작. store init 1곳에서 호출한다(멱등 — 한 번만 시작).
 * BroadcastChannel 미지원 환경에서는 발신 훅만 걸고 수신은 no-op.
 * dispose를 반환한다(테스트/언마운트용).
 */
export function initLiveSync(): () => void {
  if (started) return dispose ?? (() => {});
  started = true;

  const db = getDB();
  const unhook = registerHooks(db);

  let onMessage: ((ev: MessageEvent) => void) | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      // Node(테스트)에서 핸들이 프로세스 종료를 막지 않도록.
      (channel as unknown as { unref?: () => void }).unref?.();
      onMessage = (ev: MessageEvent) => {
        void handleIncoming(ev.data as CardSyncMsg);
      };
      channel.addEventListener("message", onMessage);
    } catch {
      channel = null;
    }
  }

  dispose = () => {
    unhook();
    if (channel && onMessage) channel.removeEventListener("message", onMessage);
    try {
      channel?.close();
    } catch {
      /* noop */
    }
    channel = null;
    hookDispose = null;
    started = false;
    dispose = null;
  };
  hookDispose = unhook;
  return dispose;
}

/* ── 테스트 헬퍼 ───────────────────────────────────────────────── */

/** 테스트용 — 모듈 상태를 초기화한다(채널/훅/충돌/seen). */
export function __resetLiveSyncForTest(): void {
  if (dispose) dispose();
  if (hookDispose) {
    hookDispose();
    hookDispose = null;
  }
  conflicts.clear();
  conflictListeners.clear();
  lastSeen.clear();
  channel = null;
  started = false;
  dispose = null;
}

/** 테스트용 — 이 탭의 id. 자기 발신 무시 검증에 쓴다. */
export function __getTabId(): string {
  return tabId;
}
