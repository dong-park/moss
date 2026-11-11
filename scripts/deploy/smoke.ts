// Stable Bun CLI alias for host-side release orchestration.
import { smoke } from './smoke.mjs';
try { await smoke(process.argv.slice(2)); console.log('production smoke passed'); }
catch (error) { console.error(`production smoke failed: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
