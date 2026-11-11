const KEY = "__mossMemoV1";
type Marker = { owner: string; cardId: string; boardId: string; token: string; url: string };
type Snapshot = { cardId: string | null; boardId: string; enabled: boolean; exists: (id: string) => boolean };
type Port = { read: () => Snapshot; open: (id: string) => void; close: (restoreBoard: boolean) => void; flush: () => void };

function marker(): Marker | undefined { return window.history.state?.[KEY]; }
function baseState() {
  const state = { ...window.history.state };
  delete state[KEY];
  return state;
}

/** One entry for a detail, never one for the software keyboard. No traversal in cleanup. */
export function createMemoHistory(port: Port) {
  const owner = crypto.randomUUID();
  let active: Marker | undefined;
  let pending: Marker | undefined;
  let afterClose: (() => void) | undefined;

  function sync() {
    if (pending) return;
    const state = port.read();
    const current = marker();
    if (!state.cardId || !state.exists(state.cardId)) {
      if (active && current?.token === active.token && current.owner === owner) close();
      return;
    }
    // A detail opened on mobile keeps its entry when the viewport grows.
    if (!state.enabled && !active) return;
    if (current?.owner === owner && current.boardId === state.boardId && current.url === location.href) {
      active = { ...current, cardId: state.cardId };
      if (current.cardId !== state.cardId) window.history.replaceState({ ...baseState(), [KEY]: active }, "", location.href);
      return;
    }
    // A marker from a previous document cannot restore this controller's modal.
    if (current) window.history.replaceState(baseState(), "", location.href);
    active = { owner, cardId: state.cardId, boardId: state.boardId, token: crypto.randomUUID(), url: location.href };
    window.history.pushState({ ...baseState(), [KEY]: active }, "", location.href);
  }

  function close() {
    if (pending) return;
    port.flush();
    if (active && marker()?.token === active.token && marker()?.owner === owner && location.href === active.url) {
      pending = active;
      window.history.back();
    } else {
      active = undefined;
      port.close(true);
      const next = afterClose; afterClose = undefined; next?.();
    }
  }

  function onPop() {
    port.flush();
    const current = marker();
    if (pending) {
      const closing = pending;
      if (current?.owner === owner && current.token === closing.token) return;
      pending = undefined;
      active = undefined;
      const state = port.read();
      const sameUrl = location.href === closing.url;
      // A newer open request wins; consume the old close before creating its entry.
      if (state.cardId === closing.cardId || !sameUrl || afterClose) port.close(sameUrl);
      const next = afterClose; afterClose = undefined;
      if (next) next(); else sync();
      return;
    }
    const state = port.read();
    if (current?.owner === owner && current.url === location.href && current.boardId === state.boardId && state.enabled && state.exists(current.cardId)) {
      active = current;
      port.open(current.cardId); // Forward returns to reading, never summons a keyboard.
    } else {
      const sameUrl = !active || active.url === location.href;
      active = undefined;
      if (current) window.history.replaceState(baseState(), "", location.href);
      if (state.cardId) port.close(sameUrl);
    }
  }

  return {
    sync, close,
    navigate(next: () => void) {
      if (active || pending) { afterClose = next; close(); }
      else next();
    },
    connect() {
      window.addEventListener("popstate", onPop);
      return () => window.removeEventListener("popstate", onPop);
    },
  };
}

let navigationGate: ((next: () => void) => void) | undefined;
export function bindMemoNavigation(gate: (next: () => void) => void) {
  navigationGate = gate;
  return () => { if (navigationGate === gate) navigationGate = undefined; };
}
export function navigateAfterMemoClose(next: () => void) {
  if (navigationGate) navigationGate(next); else next();
}
