// Maintainer compatibility entry; secrets must be injected externally.
import { seedRabdi } from '../../../scripts/seed-rabdi.mjs';
try { const result = await seedRabdi(); console.log(JSON.stringify({ ...result, entities: undefined })); }
catch { console.error('Seed stopped; inspect the persistent journal before retrying.'); process.exitCode = 1; }
