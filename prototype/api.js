// 生产环境通过 Nginx 的 /api 反向代理访问；本地静态预览直接连接实时目录 API。
const isLocalPreview = window.location.protocol === 'file:' || window.location.port === '8765';
const API_BASE = isLocalPreview
  ? `${window.location.protocol === 'file:' ? 'http:' : window.location.protocol}//${window.location.hostname || 'localhost'}:3456`
  : '/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options });
  const data = await readApiResponse(res);
  if (!res.ok) {
    const err = new Error(data.error?.message || '请求失败');
    err.code = data.error?.code || 'UNKNOWN_ERROR';
    err.status = res.status;
    throw err;
  }
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await readApiResponse(res);
  if (!res.ok) {
    const err = new Error(data.error?.message || '请求失败');
    err.code = data.error?.code || 'UNKNOWN_ERROR';
    err.status = res.status;
    throw err;
  }
  return data;
}

async function apiPatch(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
  });
  const data = await readApiResponse(res);
  if (!res.ok) { const err = new Error(data.error?.message || '请求失败'); err.code = data.error?.code || 'UNKNOWN_ERROR'; err.status = res.status; throw err; }
  return data;
}

async function readApiResponse(res) {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Reverse proxies and upstream providers sometimes return a plain-text 5xx
    // response. Do not expose a JSON parse exception to the product UI.
    if (!res.ok) return { error: { code: 'UPSTREAM_UNAVAILABLE', message: `服务暂时不可用（HTTP ${res.status}），请稍后重试` } };
    throw new Error('服务返回了无法识别的数据，请刷新后重试');
  }
}

// Keep only the invite entered in this tab; never obtain configured codes from the API.
function evaluationInviteCode() { return sessionStorage.getItem('mc_invite_code') || ''; }
async function inviteLogin(inviteCode) {
  const account = (await apiPost('/auth/invite', { inviteCode })).data;
  sessionStorage.setItem('mc_invite_code', inviteCode.trim());
  return account;
}
async function currentAccount() {
  const account = (await apiFetch('/auth/me')).data;
  if (!account?.authenticated) sessionStorage.removeItem('mc_invite_code');
  return account?.authenticated && evaluationInviteCode() ? account : null;
}
async function logoutAccount() {
  const res = await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error('退出登录失败');
  sessionStorage.removeItem('mc_invite_code');
}

async function fetchVendors() {
  const json = await apiFetch('/vendors');
  return json.data;
}

async function fetchModels(params = {}) {
  const qs = new URLSearchParams();
  if (params.vendor) qs.set('vendor', params.vendor);
  if (params.category) qs.set('category', params.category);
  if (params.search) qs.set('search', params.search);
  qs.set('limit', params.limit || 100);
  qs.set('offset', params.offset || 0);

  const json = await apiFetch(`/models?${qs.toString()}`);
  return json;
}

async function fetchAllModels() {
  const data = [];
  let page;
  do {
    page = await fetchModels({ limit: 100, offset: data.length });
    if (!page.data?.length) break;
    data.push(...page.data);
  } while (data.length < page.meta.total);
  return { data };
}

async function fetchComparison(ids) {
  const json = await apiFetch(`/models/compare?ids=${ids.join(',')}`);
  return json.data;
}

async function createRecommendation(payload) {
  const json = await apiPost('/recommendations', payload);
  return json.data;
}

async function sendRecommendationFeedback(recommendationId, feedback) {
  return apiPost(`/recommendations/${recommendationId}/feedback`, feedback);
}

async function generateShareImage(ids, size) {
  const res = await fetch(`${API_BASE}/share-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, size }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error?.message || '生成分享图失败');
    err.code = data.error?.code || 'SHARE_FAILED';
    throw err;
  }

  return res.blob();
}

async function fetchAdminKnowledge() { return (await apiFetch('/admin/knowledge')).data; }
async function fetchAdminFeedback() { return (await apiFetch('/admin/feedback')).data; }
async function ingestKnowledgeSource(payload) { return (await apiPost('/admin/knowledge/ingest', payload)).data; }
async function fetchAdminVendors() { return (await apiFetch('/admin/vendors')).data; }
async function updateAdminVendor(id, payload) { return (await apiPatch(`/admin/vendors/${encodeURIComponent(id)}`, payload)).data; }
async function saveAdminVendorOrder(vendors) { return (await apiPatch('/admin/vendors', { vendors })).data; }
async function fetchEvaluationPrompts() { return (await apiFetch('/evaluations/prompts', { cache: 'no-store' })).data; }
async function createEvaluation(payload) { return (await apiPost('/evaluations', { ...payload, inviteCode: evaluationInviteCode() })).data; }
async function judgeEvaluation(id, choice) { return (await apiPost(`/evaluations/${id}/judgment`, { choice })).data; }
async function fetchEvaluationHistory(params = {}) { const qs = new URLSearchParams(params); return (await apiFetch(`/evaluations/history?${qs}`)).data; }
async function fetchAdminEvaluation(params = {}) { const qs = new URLSearchParams(params); return (await apiFetch(`/admin/evaluation?${qs}`)).data; }
async function fetchAdminEvaluationPrompts() { return (await apiFetch('/admin/evaluation/prompts')).data; }
async function updateAdminEvaluationPrompt(id, payload) { return (await apiPatch(`/admin/evaluation/prompts/${encodeURIComponent(id)}`, payload)).data; }
async function fetchEvaluationConfig() { return (await apiFetch('/admin/evaluation/config')).data; }
async function updateEvaluationConfig(payload) { return (await apiPatch('/admin/evaluation/config', payload)).data; }

async function fetchRecommendationHistory(offset = 0) { return (await apiFetch(`/recommendations?limit=10&offset=${offset}`)).data; }
async function fetchRecommendationSnapshot(id) { return (await apiFetch(`/recommendations/${encodeURIComponent(id)}`)).data; }
async function fetchScoreConfiguration() { return (await apiFetch('/evaluations/score-config')).data; }
async function fetchEvaluationScore(id) { return (await apiFetch(`/evaluations/${encodeURIComponent(id)}/score`)).data; }
async function startEvaluationScore(id, payload) { return (await apiPost(`/evaluations/${encodeURIComponent(id)}/score`, payload)).data; }
async function updateKnowledgeStatus(id, status) { return (await apiPatch(`/admin/knowledge/${encodeURIComponent(id)}`, { status })).data; }
