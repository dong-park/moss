// Stable Bun CLI alias for host-side release orchestration.
import { smoke } from './smoke.mjs';
try { console.log(JSON.stringify(await smoke(process.argv.slice(2)))); }
catch (error) { if (error?.evidence) console.log(JSON.stringify(error.evidence)); console.error('production smoke failed'); process.exitCode = 1; }
