import { disconnectDb } from './db.js';
import { runSync, syncCatalog, syncOfficialSourceSnapshots, syncSuperclueResults } from './sync-service.js';

process.env.TZ = 'Asia/Shanghai';
const args = new Set(process.argv.slice(2));
const once = args.has('--once');
const dryRun = args.has('--dry-run');
const type = [...args].find((arg) => arg.startsWith('--type='))?.split('=')[1] || 'all';
const vendorIds = ([...args].find((arg) => arg.startsWith('--vendor='))?.slice('--vendor='.length) || '').split(',').filter(Boolean);

async function execute(kind = type) {
  const startedAt = new Date().toISOString();
  try {
  const result = kind === 'catalog' ? await syncCatalog({ dryRun, vendorIds }) : kind === 'sources' ? await syncOfficialSourceSnapshots({ dryRun }) : kind === 'superclue' ? await syncSuperclueResults({ dryRun }) : await runSync({ dryRun });
    console.log(JSON.stringify({ startedAt, kind, ok: true, result }));
  } catch (error) {
    console.error(JSON.stringify({ startedAt, kind, ok: false, error: error.message }));
    if (once) process.exitCode = 1;
  }
}

if (once) {
  await execute();
  await disconnectDb();
} else {
  await execute('all');
  const schedule = (label, hour, minute, everyDays, task) => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    while (next <= now) next.setDate(next.getDate() + everyDays);
    const delay = next.getTime() - now.getTime();
    console.log(`${label} scheduled for ${next.toISOString()}`);
    setTimeout(async () => { await task(); schedule(label, hour, minute, everyDays, task); }, delay);
  };
  schedule('catalog scan', 3, 0, 1, () => execute('catalog'));
  schedule('official source snapshots', 3, 30, 1, () => execute('sources'));
  schedule('SuperCLUE reviewed result import', 3, 45, 1, () => execute('superclue'));
  schedule('full API pricing refresh', 4, 0, 3, () => execute('catalog'));
  console.log('ModelCompare sync worker running (Asia/Shanghai).');
}
