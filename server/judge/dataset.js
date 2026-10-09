import { createHash } from 'node:crypto';
import { buildJudgeInput, JEV_MODEL } from './typesafe.js';
import { RUBRIC_VERSION } from './rubrics.js';
export const sampleFingerprint = (s) => createHash('sha256').update(JSON.stringify({ id: s.id, groupId: s.groupId, scene: s.scene, split: s.split, datasetVersion: s.datasetVersion, task: s.task, reference: s.reference || '', a: s.a, b: s.b })).digest('hex');
export function validationInput(sample, variant = 'original') {
  const input = buildJudgeInput({ task: sample.task, reference: sample.reference || '', answers: variant === 'swapped' ? [sample.b, sample.a] : [sample.a, sample.b], scene: sample.scene });
  const inputHash = createHash('sha256').update(JSON.stringify({ payload: input.payload, rubricVersion: input.rubricVersion, scene: input.scene })).digest('hex');
  return { input, inputHash };
}
export function inspectDataset(samples) {
  const issues = [], ids = new Set(), groups = new Map(), tasks = new Map(), answers = new Map();
  for (const s of samples) {
    if (!s || typeof s !== 'object') { issues.push({ code: 'INVALID_SAMPLE' }); continue; }
    if (!s || typeof s.id !== 'string' || !s.id || ids.has(s.id)) issues.push({ code: 'DUPLICATE_OR_INVALID_ID', id: s?.id });
    ids.add(s?.id);
    if (!['development','validation'].includes(s?.split) || !s.groupId || !s.datasetVersion) issues.push({ code: 'INVALID_GROUP_OR_VERSION', id: s?.id });
    try { validationInput(s); } catch { issues.push({ code: 'INVALID_INPUT', id: s?.id }); }
    for (const [map, value, kind] of [[groups,s.groupId,'GROUP'],[tasks,s.task,'TASK'],[answers,s.a,'ANSWER'],[answers,s.b,'ANSWER']]) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const key = value.normalize('NFKC').replace(/\s+/g,'').trim(), previous = map.get(key);
      if (previous && previous.split !== s.split) issues.push({ code: `CROSS_SPLIT_${kind}`, ids: [previous.id, s.id] });
      else if (!previous) map.set(key,{ id:s.id, split:s.split });
    }
  }
  return { valid: samples.length > 0 && issues.length === 0, samples: samples.length, issues };
}
export function mergeRaterLabels(samples, first, second) {
  const valid = new Set(['a','b','tie','unjudgeable']);
  const parse = (rows) => {
    const identities = new Set(rows.map((r) => r.raterId)), map = new Map();
    if (identities.size !== 1 || typeof rows[0]?.raterId !== 'string' || !rows[0].raterId.trim()) throw new Error('Each file requires one named rater');
    for (const r of rows) {
      if ((r.annotationOrigin !== undefined && r.annotationOrigin !== 'human') || r.independentHuman === false || r.reviewedByHuman === false || r.needsHumanReview === true) throw new Error('AI-assisted or unreviewed labels cannot count as an independent human rater');
      if (map.has(r.id) || !valid.has(r.label)) throw new Error('Duplicate or invalid rater label');
      const sample = samples.find((s) => s.id === r.id);
      if (!sample || r.sampleHash !== sampleFingerprint(sample) || r.datasetVersion !== sample.datasetVersion) throw new Error('Labels do not match this dataset');
      map.set(r.id,r);
    }
    return { identity: rows[0].raterId.trim(), map };
  };
  const a = parse(first), b = parse(second);
  if (a.identity === b.identity) throw new Error('Two independent raters are required');
  return samples.filter((s) => a.map.has(s.id) && b.map.has(s.id)).map((s) => ({ id:s.id, sampleHash:sampleFingerprint(s), datasetVersion:s.datasetVersion, rater1:a.map.get(s.id).label, rater2:b.map.get(s.id).label, rater1Id:a.identity, rater2Id:b.identity, rater1Origin:'human', rater2Origin:'human', adjudicated:null, labelVersion:'human-2026-10-09.1' }));
}
export function matchingResult(sample, record) {
  if (!record || record.status !== 'succeeded' || record.sampleHash !== sampleFingerprint(sample) || record.result?.model !== JEV_MODEL || record.result?.rubricVersion !== RUBRIC_VERSION || record.result?.scene !== sample.scene || !['a','b','tie','abstain'].includes(record.result?.decision)) return false;
  return record.inputHash === validationInput(sample,record.variant).inputHash;
}
