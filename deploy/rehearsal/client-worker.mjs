import { createInterface } from 'node:readline';
import { createClient } from './client.mjs';

{
  let client;
  try {
    client = await createClient(process.env.MOSS_CLIENT_PACKAGE ?? '/app/package.json');
    for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
      const { id, op, args } = JSON.parse(line);
      try { console.log(`MOSS_RPC ${JSON.stringify({ id, ok: true, result: await client.run(op, args) })}`); }
      catch { console.log(`MOSS_RPC ${JSON.stringify({ id, ok: false, error: `client operation failed: ${op}` })}`); }
    }
  } finally { await client?.close(); }
}
