// Runs under Bun, using the packages in the actual web image (or installed web workspace).
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function createClient(packagePath, packages) {
  const require = packages ? null : createRequire(resolve(packagePath));
  const Y = packages?.Y ?? await import(pathToFileURL(require.resolve('yjs')).href);
  const { HocuspocusProvider, HocuspocusProviderWebsocket } = packages ?? await import(pathToFileURL(require.resolve('@hocuspocus/provider')).href);
  let config, access, clients = [];
  const keys = new Set();
  const wait = async (predicate, label) => {
    const end = Date.now() + 20000;
    while (Date.now() < end) { if (predicate()) return; await new Promise(r => setTimeout(r, 50)); }
    throw new Error(`timeout: ${label}`);
  };
  async function request(path, body, authenticated = true) {
    const response = await fetch(`${config.api}${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { ...(body === undefined || body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(authenticated ? { authorization: `Bearer ${access}` } : {}) },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`API ${path.split('/').slice(-1)[0]} HTTP ${response.status}`);
    return response;
  }
  async function close() {
    for (const c of clients.splice(0)) { c.provider.destroy(); c.ws.destroy(); c.doc.destroy(); }
    // Hocuspocus persists and unloads on last disconnect. Fresh documents must reload, not reuse local state.
    await new Promise(r => setTimeout(r, 1500));
  }
  async function pair() {
    if (clients.length) throw new Error('close clients before opening fresh pair');
    for (let i = 0; i < 2; i++) {
      const doc = new Y.Doc();
      const ws = new HocuspocusProviderWebsocket({ url: config.sync, WebSocketPolyfill: WebSocket });
      const c = { doc, ws, failure: false };
      const provider = new HocuspocusProvider({ name: config.board, document: doc, websocketProvider: ws,
        token: async () => (await (await request(`/boards/${config.board}/token`, {})).json()).boardToken,
        onAuthenticationFailed: () => { c.failure = true; },
      });
      c.provider = provider; clients.push(c); provider.attach();
    }
    await wait(() => clients.every(c => c.provider.isSynced || c.failure), 'two clients authenticated');
    if (clients.some(c => c.failure)) throw new Error('sync authentication denied');
    return { clients: 2 };
  }
  function write(index, key, value) {
    keys.add(key);
    const doc = clients[index].doc;
    doc.transact(() => {
      doc.getMap('meta').set(key, value);
      const note = new Y.Map();
      for (const [field, item] of Object.entries({ id: key, boardId: config.board, kind: 'text', x: 10, y: 20, width: 240, height: 120, content: value, title: 'Deployment smoke', createdAt: Date.now(), updatedAt: Date.now() })) note.set(field, item);
      doc.getMap('notes').set(key, note);
    });
  }
  async function assertValues(values) {
    await wait(() => clients.length === 2 && clients.every(c => Object.entries(values).every(([k, v]) => c.doc.getMap('meta').get(k) === v && c.doc.getMap('notes').get(k)?.get('content') === v)), 'document convergence');
    return { verifiedKeys: Object.keys(values) };
  }
  return {
    async run(op, args = {}) {
      switch (op) {
        case 'init': {
          config = args;
          if (!/^[a-zA-Z0-9_-]+$/.test(config.board)) throw new Error('invalid board id');
          const denied = await fetch(`${config.api}/boards/${config.board}/token`, { method: 'POST', signal: AbortSignal.timeout(15000) });
          if (![401, 403].includes(denied.status)) throw new Error('unauthenticated board token was not denied');
          if (config.signup) await request('/auth/signup', { email: config.email, password: config.password, name: 'Isolated rehearsal', termsAccepted: true, termsVersion: config.terms }, false);
          access = (await (await request('/auth/login', { email: config.email, password: config.password }, false)).json()).accessToken;
          if (typeof access !== 'string' || !access) throw new Error('normal login did not return access token');
          if (config.signup) await request(`/boards/${config.board}/share`, { name: 'Isolated image rehearsal' });
          const boards = await (await request('/me/boards')).json();
          if (!boards.some(board => board.id === config.board && board.role === 'owner')) throw new Error('smoke board must belong to dedicated account');
          return { normalAuth: true, unauthenticatedDenied: true };
        }
        case 'pair': return pair();
        case 'write': write(args.index ?? 0, args.key, args.value); return { written: args.key };
        case 'assert': return assertValues(args.values);
        case 'offline': for (const c of clients) c.ws.disconnect(); await wait(() => clients.every(c => c.ws.status === 'disconnected'), 'clients offline'); return { disconnected: true };
        case 'online': for (const c of clients) await c.ws.connect(); await wait(() => clients.every(c => c.provider.isSynced), 'clients reconnected'); return { reconnected: true };
        case 'close': await close(); return { closed: true };
        case 'upload': {
          const body = new FormData(); body.append('file', new Blob([args.content], { type: 'application/octet-stream' }), 'rehearsal.txt');
          return (await request(`/boards/${config.board}/files`, body)).json();
        }
        case 'download': {
          const text = await (await request(`/boards/${config.board}/files/${args.id}`)).text();
          if (text !== args.content) throw new Error('restored attachment mismatch');
          return { attachmentVerified: true };
        }
        case 'clean': {
          // Remove only entries created by this worker; the production board itself is never deleted.
          for (const c of clients) c.doc.transact(() => { for (const key of keys) { c.doc.getMap('meta').delete(key); c.doc.getMap('notes').delete(key); } });
          return { removedOwnEntries: keys.size };
        }
        default: throw new Error('unknown client operation');
      }
    },
    close,
  };
}
