import { createHash } from 'node:crypto';
import { getDb } from '../db.js';
import { JEV_MODEL, buildJudgeInput, requestJudge } from './typesafe.js';
import { RUBRIC_VERSION, sceneForPrompt } from './rubrics.js';
import { jevApiKey } from './credentials.js';
const fail = (code, status = 422) => Object.assign(new Error(code), { code, status });
export function scoreConfiguration() {
  const mode = ['off', 'shadow', 'visible', 'ranking'].includes(process.env.JEV_MODE) ? process.env.JEV_MODE : 'off';
  // Ranking activation stays locked until a reviewed validation release adds
  // verified quality snapshots. Setting an env flag alone is insufficient.
  return { mode, enabled: mode !== 'off' && Boolean(jevApiKey()), rankingEnabled: false };
}
export function publicScore(job, role = 'user') {
  if (!job) return null;
  const visible = role === 'admin' || ['visible', 'ranking'].includes(scoreConfiguration().mode);
  return { id: job.id, runId: job.runId, status: job.status, scene: job.scene, modelVersion: job.modelVersion, rubricVersion: job.rubricVersion, errorCode: job.errorCode, attempts: job.attempts, createdAt: job.createdAt, startedAt: job.startedAt, finishedAt: job.finishedAt,
    result: visible ? job.result : null, costUsd: visible && job.costUsd !== null ? Number(job.costUsd) : null, visibility: visible ? 'visible' : 'shadow', rankingEnabled: false };
}
export async function enqueueScore(db, run, userId, body = {}) {
  if (run.type !== 'text') throw fail('SCORE_TEXT_ONLY');
  const scene = body.scene || sceneForPrompt(run.prompt?.title || '');
  const input = buildJudgeInput({ task: run.promptText, reference: body.reference ?? '', scene, answers: [run.modelAId, run.modelBId].map((id) => run.results.find((r) => r.modelId === id)?.content) });
  const inputHash = createHash('sha256').update(JSON.stringify(input.payload)).digest('hex');
  const where = { runId_inputHash_modelVersion_rubricVersion: { runId: run.id, inputHash, modelVersion: JEV_MODEL, rubricVersion: RUBRIC_VERSION } };
  const existing = await db.evaluationScoreRun.findUnique({ where });
  if (existing) return existing;
  const config = scoreConfiguration();
  if (!config.enabled) throw fail(config.mode === 'off' ? 'SCORE_DISABLED' : 'SCORE_NOT_CONFIGURED', 409);
  return db.$transaction(async (tx) => {
    // Serialize queue admission and duplicate checks across API instances.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(73460108)`;
    const raced = await tx.evaluationScoreRun.findUnique({ where });
    if (raced) return raced;
    const pending = await tx.evaluationScoreRun.count({ where: { status: { in: ['pending', 'running'] } } });
    const userPending = await tx.evaluationScoreRun.count({ where: { userId, status: { in: ['pending', 'running'] } } });
    if (pending >= 100 || userPending >= 5) throw fail('SCORE_QUEUE_FULL', 429);
    // Legacy ledger columns remain for historical data/schema compatibility;
    // the estimate is retained for accounting, never used to reject a request.
    return tx.evaluationScoreRun.create({ data: { runId: run.id, userId, inputHash, scene, modelVersion: JEV_MODEL, rubricVersion: RUBRIC_VERSION, budgetId: 'unrestricted', reservedCostUsd: input.reservedCostUsd, inputSnapshot: input } });
  });
}
export async function recoverScoreJobs(db, before = new Date(Date.now() - 120_000)) {
  await db.evaluationScoreRun.updateMany({ where: { status: 'running', startedAt: { lt: before }, attempts: 0 }, data: { status: 'pending', startedAt: null } });
  await db.evaluationScoreRun.updateMany({ where: { status: 'running', startedAt: { lt: before }, attempts: { gt: 0 } }, data: { status: 'failed', errorCode: 'SCORE_DELIVERY_UNCERTAIN', finishedAt: new Date() } });
}
export async function processScoreJob(db, judge = requestJudge) {
  const config = scoreConfiguration();
  if (!config.enabled) return false;
  const next = await db.evaluationScoreRun.findFirst({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' } });
  if (!next) return false;
  const claimed = await db.evaluationScoreRun.updateMany({ where: { id: next.id, status: 'pending' }, data: { status: 'running', startedAt: new Date() } });
  if (!claimed.count) return false;
  const started = Date.now();
  try {
    const judged = await judge(next.inputSnapshot, { onAttempt: async (attempts) => { await db.evaluationScoreRun.update({ where: { id: next.id }, data: { attempts } }); } });
    const result = { ...judged, durationMs: Date.now() - started };
    await db.evaluationScoreRun.update({ where: { id: next.id }, data: { status: 'succeeded', result, costUsd: result.costUsd, reservedCostUsd: result.costUsd, finishedAt: new Date() } });
  } catch (error) {
    const knownUnbilled = ['SCORE_AUTH_FAILED', 'SCORE_RATE_LIMITED', 'SCORE_NOT_CONFIGURED'].includes(error.code);
    await db.evaluationScoreRun.update({ where: { id: next.id }, data: { status: 'failed', errorCode: error.code || 'SCORE_PROVIDER_FAILED', ...(knownUnbilled ? { reservedCostUsd: 0, costUsd: 0 } : {}), finishedAt: new Date() } });
  }
  return true;
}
export function startScoreWorker() {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy || !scoreConfiguration().enabled) return; busy = true;
    try { const db = await getDb(); if (db) { await recoverScoreJobs(db); await processScoreJob(db); } }
    catch { console.error('Score queue unavailable'); }
    finally { busy = false; }
  }, 1000);
  timer.unref(); return () => clearInterval(timer);
}
