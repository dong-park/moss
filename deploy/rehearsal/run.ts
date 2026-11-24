// Workflow entrypoint; consumes publish.py's exact rehearsal-input.json contract.
import { run } from './run.mjs';
try { await run(process.argv.slice(2)); console.log('image rehearsal passed'); }
catch (error) { console.error(`image rehearsal failed: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
