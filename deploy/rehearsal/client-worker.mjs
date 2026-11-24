import { createInterface } from 'node:readline';
import { createClient } from './client.mjs';

{
  let client;
  try {
    client = await createClient(process.env.MOSS_CLIENT_PACKAGE ?? '/app/package.json');
    for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
      const { id, op, args } = JSON.parse(line);
      try { console.log(`MOSS_RPC ${JSON.stringify({ id, ok: true, result: await client.run(op, args) })}`); }
      catch (error) {
        const allowed=new Set(['timeout: two clients authenticated','sync authentication denied','timeout: document convergence','timeout: clients offline','timeout: clients reconnected','close clients before opening fresh pair']);
        const detail=allowed.has(error?.message) || /^API (token|boards|login|signup|share|files) HTTP [0-9]{3}$/.test(error?.message) ? error.message : 'unexpected client failure';
        console.log(`MOSS_RPC ${JSON.stringify({ id, ok: false, error: `client operation failed: ${op}: ${detail}` })}`);
      }
    }
  } finally { await client?.close(); }
}
