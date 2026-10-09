import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
const storePath = () => process.env.RAG_KNOWLEDGE_PATH || new URL('./rag-knowledge.json', import.meta.url);
let writes = Promise.resolve();
export const knowledgeSourceId = (url) => createHash('sha256').update(url).digest('hex').slice(0, 24);
export async function readKnowledge() {
  let raw;
  try { raw = await fs.readFile(storePath(), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { fragments: [], snapshot: null }; throw error; }
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Invalid knowledge store');
  return { fragments: data.map((item) => ({ ...item, status: item.status || 'active' })), snapshot: createHash('sha256').update(raw).digest('hex') };
}
export function mutateKnowledge(change) {
  const task = writes.then(async () => {
    const { fragments } = await readKnowledge();
    const next = await change(fragments);
    const temporary = `${storePath() instanceof URL ? storePath().pathname : storePath()}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
    await fs.rename(temporary, storePath());
    return next;
  });
  writes = task.catch(() => {});
  return task;
}
export async function setKnowledgeStatus(id, status) {
  let found = false;
  const items = await mutateKnowledge((fragments) => fragments.map((item) => {
    if (knowledgeSourceId(item.sourceUrl) !== id && item.id !== id) return item;
    found = true; return { ...item, status, statusUpdatedAt: new Date().toISOString() };
  }));
  return found ? { id, status, fragmentCount: items.filter((i) => knowledgeSourceId(i.sourceUrl) === id || i.id === id).length } : null;
}
