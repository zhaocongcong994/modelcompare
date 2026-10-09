import { disconnectDb, getDb } from './db.js';
import { archiveEvaluationImage, isArchivedEvaluationImage } from './evaluation-assets.js';

const db = await getDb();
if (!db) throw new Error('Database unavailable: cannot backfill evaluation images.');

let attempted = 0;
let archived = 0;
let unavailable = 0;

try {
  // Take a stable snapshot first: successful updates remove rows from the
  // source query, so cursor-based paging would otherwise skip records.
  const results = await db.evaluationResult.findMany({
    where: { imageUrl: { not: null, startsWith: 'http' } },
    select: { id: true, imageUrl: true },
    orderBy: { id: 'asc' },
  });
  for (const result of results) {
    attempted += 1;
    if (isArchivedEvaluationImage(result.imageUrl)) continue;
    try {
      const archivedUrl = await archiveEvaluationImage(result.imageUrl);
      const update = await db.evaluationResult.updateMany({ where: { id: result.id, imageUrl: result.imageUrl }, data: { imageUrl: archivedUrl } });
      if (update.count) archived += 1;
    } catch {
      unavailable += 1;
    }
  }
  console.log(JSON.stringify({ attempted, archived, unavailable }));
} finally {
  await disconnectDb();
}
