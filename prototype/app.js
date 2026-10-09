const MAX_MODELS = 5;
const MIN_MODELS = 2;

let vendors = [];
let models = [];
let selectedIds = [];
let currentVendorId = null;
let currentShareSize = '9:16';
let isLoading = false;
let activePage = 'compare';
let latestRecommendation = null;
let currentUser = null;
let priceSort = 'selection';
let currentShareKind = 'overview';
let pendingFeedbackModelId = null;
let evaluationPrompts = [];
let latestEvaluation = null;
let scoreViewToken = 0;
let scoreRun = null;
let adminEvaluationPrompts = [];
let adminEvaluationRuns = [];
let activeAdminPromptType = 'text';
let editingPromptId = null;
let historyRequestToken = 0;
let generationAvailability = null;
let evaluationBusy = false;

const els = {
  themeToggle: document.getElementById('themeToggle'),
  addModelBtn: document.getElementById('addModelBtn'),
  selectedChips: document.getElementById('selectedChips'),
  emptyState: document.getElementById('emptyState'),
  comparison: document.getElementById('comparison'),
  drawerOverlay: document.getElementById('drawerOverlay'),
  drawer: document.getElementById('drawer'),
  drawerClose: document.getElementById('drawerClose'),
  doneBtn: document.getElementById('doneBtn'),
  vendorList: document.getElementById('vendorList'),
  modelList: document.getElementById('modelList'),
  selectedCount: document.getElementById('selectedCount'),
  shareOverlay: document.getElementById('shareOverlay'),
  shareModal: document.getElementById('shareModal'),
  shareClose: document.getElementById('shareClose'),
  sharePreview: document.getElementById('sharePreview'),
  downloadBtn: document.getElementById('downloadBtn'),
  shareSizeTabs: document.getElementById('shareSizeTabs'),
  compareTab: document.getElementById('compareTab'),
  recommendTab: document.getElementById('recommendTab'),
  evaluationTab: document.getElementById('evaluationTab'), evaluationPage: document.getElementById('evaluationPage'), evaluationForm: document.getElementById('evaluationForm'), evaluationType: document.getElementById('evaluationType'), evaluationPrompt: document.getElementById('evaluationPrompt'), evaluationPromptPreview: document.getElementById('evaluationPromptPreview'), evaluationModelA: document.getElementById('evaluationModelA'), evaluationModelB: document.getElementById('evaluationModelB'), evaluationSubmit: document.getElementById('evaluationSubmit'), evaluationJudgment: document.getElementById('evaluationJudgment'), evaluationResults: document.getElementById('evaluationResults'), evaluationScoreButton: document.getElementById('evaluationScoreButton'),
  managementButton: document.getElementById('managementButton'),
  comparePage: document.getElementById('comparePage'),
  recommendPage: document.getElementById('recommendPage'),
  adminPage: document.getElementById('adminPage'),
  recommendForm: document.getElementById('recommendForm'),
  recommendQuery: document.getElementById('recommendQuery'),
  recommendPrompt: document.getElementById('recommendPrompt'),
  recommendDeployment: document.getElementById('recommendDeployment'),
  recommendModality: document.getElementById('recommendModality'),
  recommendOpenSource: document.getElementById('recommendOpenSource'),
  recommendReasoning: document.getElementById('recommendReasoning'),
  recommendContext: document.getElementById('recommendContext'),
  recommendInputTokens: document.getElementById('recommendInputTokens'),
  recommendOutputTokens: document.getElementById('recommendOutputTokens'),
  recommendCacheRatio: document.getElementById('recommendCacheRatio'),
  recommendDailyRequests: document.getElementById('recommendDailyRequests'),
  recommendDaysPerMonth: document.getElementById('recommendDaysPerMonth'),
  recommendBudget: document.getElementById('recommendBudget'),
  advancedParametersToggle: document.getElementById('advancedParametersToggle'),
  advancedParameters: document.getElementById('advancedParameters'),
  recommendSubmit: document.getElementById('recommendSubmit'),
  recommendationResults: document.getElementById('recommendationResults'),
  appShell: document.querySelector('.app'),
  inviteGate: document.getElementById('inviteGate'),
  authButton: document.getElementById('authButton'),
  authForm: document.getElementById('authForm'),
  inviteCode: document.getElementById('inviteCode'),
  knowledgeIngestForm: document.getElementById('knowledgeIngestForm'), knowledgeSourceUrl: document.getElementById('knowledgeSourceUrl'), knowledgeSourceTitle: document.getElementById('knowledgeSourceTitle'), knowledgeSourceVendor: document.getElementById('knowledgeSourceVendor'), knowledgeSourceList: document.getElementById('knowledgeSourceList'), knowledgeAddButton: document.getElementById('knowledgeAddButton'), knowledgeAddOverlay: document.getElementById('knowledgeAddOverlay'), knowledgeAddModal: document.getElementById('knowledgeAddModal'), knowledgeAddClose: document.getElementById('knowledgeAddClose'), knowledgeAddCancel: document.getElementById('knowledgeAddCancel'), adminFeedbackList: document.getElementById('adminFeedbackList'), adminVendorList: document.getElementById('adminVendorList'), refreshAdminData: document.getElementById('refreshAdminData'), adminKnowledgeTab: document.getElementById('adminKnowledgeTab'), adminVendorsTab: document.getElementById('adminVendorsTab'), adminFeedbackTab: document.getElementById('adminFeedbackTab'), adminKnowledgePanel: document.getElementById('adminKnowledgePanel'), adminVendorsPanel: document.getElementById('adminVendorsPanel'), adminFeedbackPanel: document.getElementById('adminFeedbackPanel'),
  feedbackOverlay: document.getElementById('feedbackOverlay'), feedbackModal: document.getElementById('feedbackModal'), feedbackForm: document.getElementById('feedbackForm'), feedbackReason: document.getElementById('feedbackReason'), feedbackClose: document.getElementById('feedbackClose'), feedbackCancel: document.getElementById('feedbackCancel'),
  adminEvaluationPromptTab: document.getElementById('adminEvaluationPromptTab'), adminEvaluationQuotaTab: document.getElementById('adminEvaluationQuotaTab'), adminEvaluationResultsTab: document.getElementById('adminEvaluationResultsTab'), adminEvaluationPromptPanel: document.getElementById('adminEvaluationPromptPanel'), adminEvaluationResultsPanel: document.getElementById('adminEvaluationResultsPanel'), adminEvaluationPromptList: document.getElementById('adminEvaluationPromptList'), adminEvaluationQuotaPanel: document.getElementById('adminEvaluationQuotaPanel'), adminPromptSectionTitle: document.getElementById('adminPromptSectionTitle'), textDailyLimit: document.getElementById('textDailyLimit'), imageDailyLimit: document.getElementById('imageDailyLimit'), saveEvaluationConfig: document.getElementById('saveEvaluationConfig'), adminEvaluationInviteFilter: document.getElementById('adminEvaluationInviteFilter'), refreshEvaluationResults: document.getElementById('refreshEvaluationResults'), adminEvaluationResultsList: document.getElementById('adminEvaluationResultsList'), promptEditOverlay: document.getElementById('promptEditOverlay'), promptEditModal: document.getElementById('promptEditModal'), promptEditForm: document.getElementById('promptEditForm'), promptEditClose: document.getElementById('promptEditClose'), promptEditCancel: document.getElementById('promptEditCancel'), promptEditType: document.getElementById('promptEditType'), promptEditName: document.getElementById('promptEditName'), promptEditContent: document.getElementById('promptEditContent'),
  recommendPickerOverlay: document.getElementById('recommendPickerOverlay'), recommendPickerModal: document.getElementById('recommendPickerModal'), recommendPickerClose: document.getElementById('recommendPickerClose'), recommendPickerCancel: document.getElementById('recommendPickerCancel'), recommendPickerConfirm: document.getElementById('recommendPickerConfirm'), recommendPickerHint: document.getElementById('recommendPickerHint'), recommendPickerList: document.getElementById('recommendPickerList'),
  scoreRequestOverlay: document.getElementById('scoreRequestOverlay'), scoreRequestModal: document.getElementById('scoreRequestModal'), scoreRequestForm: document.getElementById('scoreRequestForm'), scoreRequestClose: document.getElementById('scoreRequestClose'), scoreRequestCancel: document.getElementById('scoreRequestCancel'), scoreScene: document.getElementById('scoreScene'), scoreReference: document.getElementById('scoreReference'), startScore: document.getElementById('startScore'),
  scoreDetailOverlay: document.getElementById('scoreDetailOverlay'), scoreDetailModal: document.getElementById('scoreDetailModal'), scoreDetailClose: document.getElementById('scoreDetailClose'), scoreDetailBody: document.getElementById('scoreDetailBody'),
  costWeight: document.getElementById('costWeight'),
  contextWeight: document.getElementById('contextWeight'),
  qualityWeight: document.getElementById('qualityWeight'),
  costWeightValue: document.getElementById('costWeightValue'),
  contextWeightValue: document.getElementById('contextWeightValue'),
  qualityWeightValue: document.getElementById('qualityWeightValue'),
};

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(0) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
  return String(num);
}

// The page is a legacy template-based UI. Keep its existing layout templates,
// but never insert API or user text without escaping it first. `setSafeHtml`
// also removes executable markup if a future template misses an escape call.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.origin);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch { /* invalid URLs are rendered as plain text */ }
  return '';
}

const SAFE_TAGS = new Set(['a', 'article', 'button', 'circle', 'details', 'div', 'h2', 'h3', 'h4', 'img', 'input', 'label', 'li', 'option', 'p', 'path', 'pre', 'rect', 'section', 'select', 'span', 'strong', 'summary', 'svg', 'textarea', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul']);
const SAFE_ATTRIBUTES = new Set(['alt', 'aria-expanded', 'aria-hidden', 'aria-label', 'aria-selected', 'checked', 'class', 'colspan', 'disabled', 'download', 'height', 'hidden', 'href', 'id', 'maxlength', 'placeholder', 'max', 'min', 'name', 'rel', 'role', 'rowspan', 'scope', 'selected', 'src', 'step', 'style', 'tabindex', 'target', 'title', 'type', 'value', 'viewbox', 'width', 'x', 'y', 'd', 'r', 'rx', 'fill', 'stroke']);

function setSafeHtml(element, markup) {
  const template = document.createElement('template');
  template.innerHTML = String(markup || '');
  const sanitize = (node) => {
    for (const child of [...node.children]) {
      const tag = child.tagName.toLowerCase();
      if (!SAFE_TAGS.has(tag)) {
        child.replaceWith(document.createTextNode(child.textContent || ''));
        continue;
      }
      for (const attribute of [...child.attributes]) {
        const name = attribute.name.toLowerCase();
        const allowed = SAFE_ATTRIBUTES.has(name) || name.startsWith('data-');
        if (!allowed || name.startsWith('on')) {
          child.removeAttribute(attribute.name);
          continue;
        }
        if ((name === 'href' || name === 'src') && !safeExternalUrl(attribute.value)) child.removeAttribute(attribute.name);
      }
      if (child.getAttribute('target') === '_blank') child.setAttribute('rel', 'noopener noreferrer');
      sanitize(child);
    }
  };
  sanitize(template.content);
  element.replaceChildren(template.content.cloneNode(true));
}

function formatDomain(url) {
  if (!url) return '-';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

function dedupeModels(items) {
  const unique = new Map();
  for (const model of items) {
    const key = `${model.vendorId || model.vendor?.id || ''}::${String(model.displayName || '').trim().toLowerCase()}`;
    const current = unique.get(key);
    if (!current) {
      unique.set(key, model);
      continue;
    }
    const currentDate = Date.parse(current.releaseDate || current.latestUpdate?.releasedAt || '') || 0;
    const candidateDate = Date.parse(model.releaseDate || model.latestUpdate?.releasedAt || '') || 0;
    if (candidateDate > currentDate) unique.set(key, model);
  }
  return [...unique.values()];
}

function renderModeIcons(modes = []) {
  const icons = {
    '文本': ['文本', '<span class="mode-icon-glyph">T</span>'],
    '图像': ['图像', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m5.5 18 4.5-4.5 3.2 3 2.3-2.4 3.5 3.9"/></svg>'],
    '音频': ['音频', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4M9 7v10M13 5v14M17 8v8M21 10v4"/></svg>'],
    '视频': ['视频', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 5-3v10l-5-3z"/></svg>'],
    '文件': ['文件', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M10 13h5M10 16h5"/></svg>'],
    '结构化决策': ['结构化决策', '<span class="mode-icon-glyph">✓</span>'],
  };
  const values = [...new Set(modes)].filter((mode) => icons[mode]);
  if (!values.length) return '—';
  return `<div class="mode-icons">${values.map((mode) => `<span class="mode-icon" title="${icons[mode][0]}" aria-label="${icons[mode][0]}">${icons[mode][1]}</span>`).join('')}</div>`;
}

function renderPricingDetail(p) {
  if (!p) return '';
  const itemsHtml = (p.items || [])
    .map((item) => `<div class="pricing-detail-item"><span class="pricing-detail-label">${escapeHtml(item.label)}</span><span class="pricing-detail-value">${escapeHtml(item.value)}</span></div>`)
    .join('');
  const notesHtml = (p.notes || [])
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join('');
  return `
    <div class="pricing-detail">
      ${itemsHtml ? `<div class="pricing-detail-items">${itemsHtml}</div>` : ''}
      ${notesHtml ? `<ul class="pricing-detail-notes">${notesHtml}</ul>` : ''}
    </div>
  `;
}

function formatRateAmount(item, currency) {
  if (item.amount === null || item.amount === undefined || !Number.isFinite(Number(item.amount)) || Number(item.amount) < 0) return '动态或未知定价';
  const units = { per_million_tokens: '/ 1M tokens', per_request: '/ 次', per_image: '/ 张' };
  return `${currency || ''} ${item.amount}${units[item.unit] || ''}`.trim();
}

function pricingItemsFor(model) {
  const fallback = model.pricing || {};
  const items = (fallback.items || []).map((item) => ({ label: item.label, value: item.value, numeric: Number.parseFloat(item.value) }));
  for (const card of model.apiPricing || []) {
    for (const item of card.items || []) {
      items.push({ label: item.label, value: formatRateAmount(item, card.currency), numeric: item.amount === null || item.amount === undefined ? NaN : Number(item.amount) });
    }
  }
  for (const plan of model.subscriptions || []) {
    items.push({ label: `订阅 · ${plan.name}`, value: plan.amount === null ? '订阅价格未知' : `${plan.currency} ${plan.amount} / ${plan.billingPeriod === 'annual' ? '年' : '月'}`, numeric: plan.amount === null || plan.amount === undefined ? NaN : Number(plan.amount) });
  }
  return items;
}

function renderCommercialPricing(model) {
  const items = pricingItemsFor(model);
  if (!items.length) return `<div class="pricing-summary">${escapeHtml(model.pricing?.summary || '—')}</div>`;
  return `<div class="pricing-cell-list">${items.map((item) => `<div class="pricing-cell-item"><span class="pricing-cell-label">${escapeHtml(item.label)}</span><span class="pricing-cell-value">${escapeHtml(item.value)}</span></div>`).join('')}</div>`;
}

const PRICING_COLUMN_METRICS = { '输入': 'input_tokens', '输出': 'output_tokens', '缓存读取': 'cache_read_tokens', '单张图片': 'image' };

function modelHasPerImagePricing(model) {
  return (model.apiPricing || []).some((card) => (card.items || []).some((item) => item.unit === 'per_image'));
}

function pricingItemFor(model, label) {
  const metric = PRICING_COLUMN_METRICS[label];
  const canonicalRate = model.pricing?.rates?.find((r) => r.metric === metric && r.unit === (metric === 'image' ? 'per_image' : 'per_million_tokens'));
  if (canonicalRate) return { label, value: formatRateAmount(canonicalRate, canonicalRate.currency), numeric: canonicalRate.amount === null || canonicalRate.amount === undefined ? NaN : Number(canonicalRate.amount), currency: canonicalRate.currency, unit: canonicalRate.unit };
  const isImageColumn = metric === 'image';
  const preferredCard = (model.apiPricing || []).find((card) => card.channel === 'direct') || (model.apiPricing || [])[0];
  const metricItem = preferredCard?.items?.find((item) => item.metric === metric && (isImageColumn ? item.unit === 'per_image' : item.unit !== 'per_image'));
  if (metricItem) return { label: metricItem.label, value: formatRateAmount(metricItem, preferredCard.currency), numeric: metricItem.amount === null || metricItem.amount === undefined ? NaN : Number(metricItem.amount) };
  const aliases = {
    '输入': ['输入', 'input'],
    '输出': ['输出', 'output'],
    '缓存读取': ['缓存读取', '缓存读', 'cache read', 'cached input'],
    '单张图片': ['图', 'image'],
  };
  const item = pricingItemsFor(model).find((entry) => {
    const isPerImage = String(entry.value || '').includes('/ 张');
    if (isPerImage !== isImageColumn) return false;
    const name = String(entry.label || '').toLowerCase();
    return (aliases[label] || [label]).some((alias) => name.includes(alias.toLowerCase()));
  });
  return item;
}

function inputPriceForSort(model) {
  const item = pricingItemFor(model, '输入') || pricingItemFor(model, '单张图片');
  return Number.isFinite(item?.numeric) && item.numeric >= 0 ? item.numeric : Number.POSITIVE_INFINITY;
}
function pricingGroup(model) {
  const image = model.outputModes?.includes('图像') || modelHasPerImagePricing(model);
  return `${image ? 'per_image' : 'per_million_tokens'}:${model.pricing?.currency || '未知'}`;
}


function pricingValueFor(model, label) {
  const item = pricingItemFor(model, label);
  if (item) return item.value;
  // Text-to-image models take a free text prompt and bill per generated image.
  if (label === '输入' && modelHasPerImagePricing(model)) return '免费（文字提示词）';
  return '—';
}

function latestSuperclue(model) {
  return (model.benchmarks || [])
    .filter((item) => item.provider === 'SuperCLUE')
    .sort((a, b) => new Date(b.evaluatedAt) - new Date(a.evaluatedAt))[0];
}

function renderSuperclueSection(comparedModels) {
  const scores = comparedModels.map(latestSuperclue);
  if (!scores.some(Boolean)) return '';
  const columns = comparedModels.map((model, index) => {
    const score = scores[index];
    if (!score) return `<div class="superclue-model"><div class="superclue-model-name">${escapeHtml(model.displayName)}</div><p class="superclue-empty">暂无公开评测数据</p></div>`;
    const dimensions = Object.entries(score.dimensionScores || {})
      .map(([name, value]) => `<div class="superclue-dimension"><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
    const date = new Date(score.evaluatedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' });
    return `
      <div class="superclue-model">
        <div class="superclue-model-name">${escapeHtml(model.displayName)}</div>
        <div class="superclue-score-label">测评总分</div>
        <div class="superclue-score">${score.totalScore ?? '-'}<span>分</span></div>
        <div class="superclue-meta">${score.rank ? `排名 #${score.rank}` : '排名未提供'} · ${date}</div>
        <div class="superclue-meta">${escapeHtml(score.category || score.benchmark)}</div>
        ${dimensions ? `<div class="superclue-dimensions">${dimensions}</div>` : ''}
        ${safeExternalUrl(score.sourceUrl) ? `<a class="superclue-source" href="${escapeHtml(safeExternalUrl(score.sourceUrl))}" target="_blank" rel="noopener">数据来源：SuperCLUE ↗</a>` : ''}
      </div>`;
  }).join('');
  return `
    <section class="superclue-section">
      <button class="superclue-toggle" id="superclueToggle" type="button" aria-expanded="false">查看 SuperCLUE 评测</button>
      <div class="superclue-panel" id="supercluePanel" hidden>
        <div class="superclue-heading"><div><p>第三方评测参考</p><h3>SuperCLUE 评测</h3></div><span>不参与推荐评分</span></div>
        <div class="superclue-grid">${columns}</div>
      </div>
    </section>`;
}

function getSelectedModels() {
  return selectedIds.map((id) => models.find((m) => m.id === id)).filter(Boolean);
}

function toggleTheme() {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';
  document.body.setAttribute('data-theme', nextTheme);
  const label = nextTheme === 'dark' ? '切换到夜间主题' : '切换到日间主题';
  els.themeToggle.setAttribute('aria-label', label);
  els.themeToggle.title = label;
}

function showToast(message, type = 'error') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

function showGlobalLoading() {
  els.emptyState.innerHTML = `
    <div class="skeleton-screen">
      <div class="skeleton-title"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>
  `;
}

function hideGlobalLoading() {
  els.emptyState.innerHTML = `
    <div class="empty-state-icon">◫</div>
    <p>尚未选择模型</p>
    <p class="empty-state-hint">至少选择 2 个模型开始对比</p>
  `;
}

async function init() {
  showGlobalLoading();
  try {
    currentUser = await currentAccount();
    renderAuthState();
    const [vendorsData, modelsData] = await Promise.all([
      fetchVendors(),
      fetchAllModels(),
    ]);
    vendors = vendorsData;
    models = dedupeModels(modelsData.data || []);
    currentVendorId = vendors[0]?.id;
    if (currentUser) await loadEvaluationPrompts();
    updateUI();
  } catch (err) {
    showToast(err.message || '数据加载失败');
    console.error(err);
  } finally {
    hideGlobalLoading();
  }
}

async function reloadCatalog() {
  const [vendorsData, modelsData] = await Promise.all([fetchVendors(), fetchAllModels()]);
  vendors = vendorsData;
  models = dedupeModels(modelsData.data || []);
  if (!vendors.some((vendor) => vendor.id === currentVendorId)) currentVendorId = vendors[0]?.id || null;
  updateUI();
}

function renderAuthState() {
  const isAuthenticated = Boolean(currentUser);
  els.appShell.hidden = !isAuthenticated;
  els.inviteGate.hidden = isAuthenticated;
  els.authButton.textContent = isAuthenticated ? '退出登录' : '登录';
  els.managementButton.hidden = currentUser?.role !== 'admin';
  if (!isAuthenticated) requestAnimationFrame(() => els.inviteCode.focus());
}
function requireLogin() { if (currentUser) return true; renderAuthState(); return false; }
async function authenticate() {
  const inviteCode = els.inviteCode.value.trim();
  try {
    currentUser = await inviteLogin(inviteCode);
    renderAuthState(); els.authForm.reset(); showToast('登录成功', 'success');
    await loadEvaluationPrompts();
  } catch (err) { showToast(err.message || '登录失败'); }
}

function openDrawer() {
  if (!requireLogin()) return;
  if (!currentVendorId && vendors.length > 0) {
    currentVendorId = vendors[0].id;
  }
  els.drawerOverlay.classList.add('open');
  els.drawer.classList.add('open');
  renderVendors();
  renderModels();
}

function closeDrawer() {
  els.drawerOverlay.classList.remove('open');
  els.drawer.classList.remove('open');
}

function renderVendors() {
  setSafeHtml(els.vendorList, vendors
    .map(
      (v) => `
        <button
          class="vendor-btn ${v.id === currentVendorId ? 'active' : ''}"
          data-vendor="${escapeHtml(v.id)}"
        >${escapeHtml(v.name)}</button>
      `
    )
    .join(''));

  els.vendorList.querySelectorAll('.vendor-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentVendorId = btn.dataset.vendor;
      renderVendors();
      renderModels();
    });
  });
}

function renderModels() {
  const vendorModels = models.filter((m) => m.vendorId === currentVendorId);
  const isFull = selectedIds.length >= MAX_MODELS;

  if (isLoading) {
    els.modelList.innerHTML = Array.from({ length: 5 })
      .map(() => '<div class="skeleton-line" style="height: 64px; margin-bottom: 8px;"></div>')
      .join('');
    return;
  }

  setSafeHtml(els.modelList, vendorModels
    .map((m) => {
      const selected = selectedIds.includes(m.id);
      const disabled = !selected && isFull;
      return `
        <div
          class="model-option ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}"
          data-model="${escapeHtml(m.id)}"
        >
          <div>
            <div class="model-option-name">${escapeHtml(m.displayName)}</div>
          </div>
          <div class="model-option-check">✓</div>
        </div>
      `;
    })
    .join(''));

  els.modelList.querySelectorAll('.model-option').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.classList.contains('disabled')) return;
      const id = el.dataset.model;
      if (selectedIds.includes(id)) {
        selectedIds = selectedIds.filter((sid) => sid !== id);
      } else {
        if (selectedIds.length >= MAX_MODELS) return;
        selectedIds.push(id);
      }
      renderModels();
      updateSelectedCount();
    });
  });
}

function updateSelectedCount() {
  els.selectedCount.textContent = selectedIds.length;
  els.doneBtn.disabled = selectedIds.length < MIN_MODELS;

  // 动态调整选择模型按钮文案
  const btnText = els.addModelBtn.querySelector('span:last-child') || els.addModelBtn;
  if (selectedIds.length >= MAX_MODELS) {
    btnText.textContent = '修改模型';
  } else {
    btnText.textContent = '选择模型';
  }
}

function renderChips() {
  const selectedModels = getSelectedModels();
  if (selectedModels.length === 0) {
    els.selectedChips.innerHTML = '';
    return;
  }

  setSafeHtml(els.selectedChips, selectedModels
    .map((m) => {
      const vendor = vendors.find((v) => v.id === m.vendorId);
      return `
        <div class="chip">
          <span class="chip-vendor">${escapeHtml(vendor?.name || '')}</span>
          <span class="chip-name">${escapeHtml(m.displayName)}</span>
          <button class="chip-remove" data-remove="${escapeHtml(m.id)}" aria-label="移除">✕</button>
        </div>
      `;
    })
    .join(''));

  els.selectedChips.querySelectorAll('.chip-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedIds = selectedIds.filter((id) => id !== btn.dataset.remove);
      updateUI();
    });
  });
}

async function renderComparison() {
  const selectedModels = getSelectedModels();
  els.comparison.classList.remove('comparison--notice');

  if (selectedModels.length === 0) {
    els.emptyState.style.display = 'block';
    els.comparison.innerHTML = '';
    return;
  }

  els.emptyState.style.display = 'none';

  if (selectedModels.length < MIN_MODELS) {
    els.comparison.classList.add('comparison--notice');
    els.comparison.innerHTML = `
      <div class="limit-hint">请再选择至少 ${MIN_MODELS - selectedModels.length} 个模型</div>
    `;
    return;
  }

  els.comparison.innerHTML = '<div class="skeleton-screen"><div class="skeleton-title"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>';

  try {
    const comparison = await fetchComparison(selectedIds);
    renderComparisonData(comparison);
  } catch (err) {
    setSafeHtml(els.comparison, `
      <div class="error-row">
        <span>${escapeHtml(err.message || '对比数据加载失败')}</span>
        <button class="retry-btn" id="retryComparison">重试</button>
      </div>
    `);
    document.getElementById('retryComparison')?.addEventListener('click', renderComparison);
  }
}

function renderComparisonData(comparison) {
  const { models: comparedModels, fields } = comparison;
  const pricedModels = [...comparedModels].sort((a, b) => {
    if (priceSort !== 'selection') {
      const groupOrder = pricingGroup(a).localeCompare(pricingGroup(b));
      if (groupOrder) return groupOrder;
      const pa = inputPriceForSort(a), pb = inputPriceForSort(b);
      if (!Number.isFinite(pa) || !Number.isFinite(pb)) return Number.isFinite(pa) ? -1 : Number.isFinite(pb) ? 1 : 0;
      return priceSort === 'input-asc' ? pa - pb : pb - pa;
    }
    return 0;
  });
  const pricingRateColumns = ['输入', '输出', '缓存读取'];
  if (comparedModels.some(modelHasPerImagePricing)) pricingRateColumns.push('单张图片');
  const valueFor = (model, key) => {
    if (key === 'contextSize') return formatNumber(model.contextSize);
    if (key === 'supportsReasoning') return model.supportsReasoning ? '是' : '否';
    if (key === 'inputModes' || key === 'outputModes') return renderModeIcons(model[key]);
    if (key === 'primaryFeatures') {
      const overview = [
        model.category,
        model.supportsReasoning ? '支持推理' : '不支持推理',
        model.contextSize ? `上下文 ${formatNumber(model.contextSize)}` : null,
      ].filter(Boolean).join(' · ');
      return `<div class="feature-chinese-summary">${escapeHtml(overview || '能力信息待补充')}</div><div class="feature-source-text">${escapeHtml(model.primaryFeatures || '—')}</div>`;
    }
    if (key === 'superclue') {
      const score = model.superclue;
      if (!score) return '—';
      const dimensions = Object.entries(score.dimensions || score)
        .filter(([name]) => !['totalScore', 'rank', 'category', 'evaluatedAt', 'sourceUrl', 'dimensions'].includes(name))
        .map(([name, value]) => `${escapeHtml(name)} ${escapeHtml(value)}`)
        .join(' / ');
      const index = score.totalScore ?? score['智力指数'] ?? score.intelligence;
      const content = [Number.isFinite(Number(index)) ? `指数 ${index}` : null, dimensions].filter(Boolean).join(' · ') || '—';
      const sourceUrl = safeExternalUrl(score.sourceUrl);
      const source = sourceUrl ? `<a class="superclue-inline-source" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">查看数据来源</a>` : '';
      return `<div class="superclue-inline-value">${escapeHtml(content)}${source}</div>`;
    }
    if (key === 'openSource') return escapeHtml(model.openSource || '未知');
    if (key === 'releaseDate') return escapeHtml(model.releaseDate || '—');
    return escapeHtml(model[key] || '—');
  };

  // Models are columns so the first, sticky row always identifies the model
  // being read. All fields remain in the desktop comparison table.
  const tableHeadHtml = `<thead><tr><th class="comparison-table-field-header">对比字段</th>${comparedModels.map((m) => { const sourceUrl = safeExternalUrl(m.sourceUrl); return `<th class="comparison-table-model-header"><div class="comparison-model-vendor">${escapeHtml(m.vendor?.name || '')}</div><div class="comparison-model-name">${escapeHtml(m.displayName)}</div>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener" class="source-link" title="${escapeHtml(sourceUrl)}">查看获取渠道</a>` : ''}</th>`; }).join('')}</tr></thead>`;
  const overviewFields = fields.filter((field) => field.key !== 'primaryFeatures');
  const tableBodyHtml = `<tbody>${overviewFields.map((field) => `<tr><th scope="row" class="comparison-table-field">${escapeHtml(field.label)}</th>${comparedModels.map((m) => { const mono = field.key === 'contextSize' || field.key === 'releaseDate'; return `<td class="comparison-table-cell ${mono ? 'mono' : ''}">${valueFor(m, field.key)}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
  const overviewWidth = 180 + comparedModels.length * 260;

  setSafeHtml(els.comparison, `
    <div class="comparison-toolbar comparison-overview-toolbar">
      <div class="comparison-overview-copy">
        <div class="comparison-overview-heading">
          <h2>概述</h2>
          <p class="comparison-toolbar-eyebrow">已选 ${comparedModels.length} 个模型</p>
        </div>
        <p class="selection-disclaimer comparison-overview-disclaimer">定价与发布信息仅供参考，具体以各厂商官网实时数据为准。不同区域、计费模式、缓存命中率及使用场景可能导致实际费用存在差异。</p>
      </div>
      <div class="comparison-share-actions">
        <button class="comparison-share-btn" id="shareBtn" type="button">生成概述分享图</button>
        <button class="comparison-share-btn" id="evaluateBtn" type="button">进行模型评测</button>
      </div>
    </div>
    <div class="comparison-table-scroll" aria-label="模型对比表格，可横向滚动">
      <table class="comparison-table comparison-overview-table" style="min-width: ${overviewWidth}px">
        ${tableHeadHtml}
        ${tableBodyHtml}
      </table>
    </div>
    <section class="pricing-section">
      <div class="pricing-divider" aria-hidden="true"><span>定价与订阅</span></div>
      <div class="comparison-toolbar pricing-toolbar">
        <h2>定价</h2>
        <select id="priceSort" class="pricing-sort" aria-label="同币种、单位内按单价排序">
          <option value="selection">按选择顺序</option>
          <option value="input-asc">输入价格从低到高</option>
          <option value="input-desc">输入价格从高到低</option>
        </select>
        <button class="comparison-share-btn" id="pricingShareBtn" type="button">生成定价分享图</button>
      </div>
      <div class="comparison-table-scroll" aria-label="模型定价表格，可横向滚动">
        <table class="comparison-table comparison-pricing-table" style="min-width: 980px">
          <thead><tr><th class="comparison-table-field-header pricing-model-column">模型名称</th>${pricingRateColumns.map((label) => `<th class="comparison-table-model-header pricing-rate-column">${escapeHtml(label)}</th>`).join('')}</tr></thead>
          <tbody>${pricedModels.map((m) => { const sourceUrl = safeExternalUrl(m.sourceUrl); return `<tr><th scope="row" class="comparison-table-field pricing-model-column"><div class="comparison-model-vendor">${escapeHtml(m.vendor?.name || '')}</div><div class="comparison-model-name">${escapeHtml(m.displayName)}</div>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener" class="source-link">查看获取渠道</a>` : ''}</th>${pricingRateColumns.map((label) => `<td class="comparison-table-cell mono pricing-rate-cell">${escapeHtml(pricingValueFor(m, label))}</td>`).join('')}</tr>`; }).join('')}</tbody>
        </table>
      </div>
    </section>
  `);

  els.comparison.querySelector('#shareBtn')?.addEventListener('click', openShareModal);
  els.comparison.querySelector('#evaluateBtn')?.addEventListener('click', goToEvaluationFromComparison);
  els.comparison.querySelector('#pricingShareBtn')?.addEventListener('click', () => openShareModal('pricing'));
  const sort = els.comparison.querySelector('#priceSort');
  sort.value = priceSort;
  sort.addEventListener('change', (event) => { priceSort = event.target.value; renderComparisonData(comparison); });
}

function renderAdminSources(data) {
  const sources = data.sources || [];
  const modelSources = data.modelSources || [];
  const sourceLink = (url) => { const safeUrl = safeExternalUrl(url); return safeUrl ? `<a class="source-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener">${escapeHtml(safeUrl)}</a>` : '<span>来源不可用</span>'; };
  const modelItems = modelSources.map((source) => `<article class="admin-list-item"><div><strong>${escapeHtml(source.vendor)} · ${escapeHtml(source.title)}</strong>${sourceLink(source.sourceUrl)}</div></article>`).join('');
  const knowledgeItems = sources.map((source) => `<article class="admin-list-item"><div><strong>${escapeHtml(source.sourceTitle || source.title || source.sourceUrl)}</strong><p>${Number(source.fragmentCount) || 1} 个知识片段 · ${escapeHtml(source.updatedAt || source.sourceUpdatedAt ? new Date(source.updatedAt || source.sourceUpdatedAt).toLocaleString('zh-CN') : '时间未知')}</p>${sourceLink(source.sourceUrl)}<label>检索状态<select data-knowledge-status="${escapeHtml(source.id || '')}">${['active','pending','expired'].map((status) => `<option value="${status}" ${source.status === status ? 'selected' : ''}>${({active:'启用',pending:'待审核',expired:'停用'})[status]}</option>`).join('')}</select></label></div></article>`).join('');
  setSafeHtml(els.knowledgeSourceList, `${modelItems}${knowledgeItems}` || '<div class="limit-hint">尚无知识库来源。</div>');
  els.knowledgeSourceList.querySelectorAll('[data-knowledge-status]').forEach((select) => select.addEventListener('change', async () => { select.disabled = true; try { await updateKnowledgeStatus(select.dataset.knowledgeStatus, select.value); showToast('检索状态已更新', 'success'); } catch (e) { showToast(e.message); loadAdminData(); } finally { select.disabled = false; } }));
}

function renderAdminFeedback(data) {
  const feedback = data.feedback || [];
  setSafeHtml(els.adminFeedbackList, feedback.length ? feedback.filter((item) => item.reason?.trim()).map((item) => `<article class="admin-list-item"><strong>${escapeHtml(item.reason)}</strong><p>邀请码：${escapeHtml(item.user?.inviteCodeLabel || item.user?.inviteCodeHash?.slice(0, 8) || '历史邀请码')} · ${escapeHtml(item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '')}</p></article>`).join('') : '<div class="limit-hint">暂无反馈。</div>');
}

let adminVendorRows = [];
let vendorSaving = false;
let vendorDrag = null;

function renderAdminVendors(data) {
  adminVendorRows = [...(data.vendors || [])].sort((a, b) => Number(b.visible) - Number(a.visible));
  setSafeHtml(els.adminVendorList, [true, false].map((visible) => {
    const rows = adminVendorRows.filter((vendor) => vendor.visible === visible);
    return `<section class="vendor-group" data-visible="${visible}"><h3 class="vendor-group-title">${visible ? '展示中' : '未展示'} · ${rows.length}</h3>${rows.map((vendor) => `<div class="admin-vendor-row ${visible ? '' : 'is-hidden'}" data-vendor-id="${escapeHtml(vendor.id)}"><button type="button" class="vendor-drag-handle" aria-label="拖动排序 ${escapeHtml(vendor.name)}" title="按住拖动">⠿</button><span class="vendor-drag-label">${escapeHtml(vendor.name)}</span><label class="vendor-visible-control"><input class="vendor-visible-input" type="checkbox" aria-label="展示 ${escapeHtml(vendor.name)}" ${visible ? 'checked' : ''} />展示</label></div>`).join('')}</section>`;
  }).join(''));
  if (vendorSaving) els.adminVendorList.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
}

async function persistVendorOrder() {
  if (vendorSaving) return;
  vendorSaving = true;
  const status = document.getElementById('vendorSortStatus');
  status.className = 'sr-only';
  status.textContent = '保存中…';
  els.adminVendorList.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
  let saved = false;
  try {
    const result = await saveAdminVendorOrder(adminVendorRows.map(({ id, visible }) => ({ id, visible })));
    saved = true;
    renderAdminVendors(result);
    await reloadCatalog();
    renderVendors(); renderModels();
    document.getElementById('vendorSortStatus').textContent = '厂商展示顺序已保存';
  } catch (error) {
    status.className = 'limit-hint';
    status.textContent = saved ? '设置已保存，页面同步失败，请刷新页面。' : '设置未保存，请重新调整后重试。';
    showToast(saved ? '设置已保存，页面同步失败，请重试' : (error.message || '保存失败，请重试'));
  } finally {
    vendorSaving = false;
    els.adminVendorList.querySelectorAll('input, button').forEach((el) => { el.disabled = false; });
  }
}

function finishVendorDrag(cancel = false) {
  const drag = vendorDrag;
  if (!drag) return;
  clearTimeout(drag.timer);
  vendorDrag = null;
  drag.row.classList.remove('is-dragging');
  if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
  if (!drag.active) return;
  if (cancel) { renderAdminVendors({ vendors: adminVendorRows }); return; }
  const ids = [...els.adminVendorList.querySelectorAll('[data-vendor-id]')].map((row) => row.dataset.vendorId);
  const changed = ids.some((id, index) => id !== adminVendorRows[index].id);
  adminVendorRows = ids.map((id) => adminVendorRows.find((vendor) => vendor.id === id));
  if (changed) void persistVendorOrder();
}

els.adminVendorList.addEventListener('change', (event) => {
  if (!event.target.matches('.vendor-visible-input') || vendorSaving) return;
  const id = event.target.closest('[data-vendor-id]').dataset.vendorId;
  const vendor = adminVendorRows.find((item) => item.id === id);
  vendor.visible = event.target.checked;
  // Join the end of the destination group; preserve every other vendor's order.
  adminVendorRows = [...adminVendorRows.filter((item) => item.id !== id), vendor];
  renderAdminVendors({ vendors: adminVendorRows });
  void persistVendorOrder();
});

els.adminVendorList.addEventListener('pointerdown', (event) => {
  const area = event.target.closest('.vendor-drag-handle, .vendor-drag-label');
  if (!area || vendorSaving || event.button !== 0 || vendorDrag) return;
  event.preventDefault();
  const row = area.closest('[data-vendor-id]');
  const handle = row.querySelector('.vendor-drag-handle');
  const drag = { handle, row, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false, pointerType: event.pointerType };
  vendorDrag = drag;
  handle.setPointerCapture(drag.pointerId);
  const activate = () => {
    drag.active = true;
    handle.setPointerCapture(drag.pointerId);
    row.classList.add('is-dragging');
    document.getElementById('vendorSortStatus').textContent = '已拿起厂商，拖动调整位置，松开保存';
  };
  if (event.pointerType === 'touch') drag.timer = setTimeout(activate, 250);
  else activate();
});
window.addEventListener('pointermove', (event) => {
  const drag = vendorDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.active) {
    return;
  }
  event.preventDefault();
  const group = drag.row.parentElement;
  const siblings = [...group.querySelectorAll('[data-vendor-id]')].filter((row) => row !== drag.row);
  const next = siblings.find((row) => event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
  group.insertBefore(drag.row, next || null);
  // Reordering a captured element can release capture in some browsers.
  if (!drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.setPointerCapture(drag.pointerId);
  if (event.clientY < 80) window.scrollBy(0, -24);
  else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 24);
}, { passive: false });
window.addEventListener('pointerup', (event) => { if (vendorDrag?.pointerId === event.pointerId) finishVendorDrag(); });
window.addEventListener('pointercancel', () => finishVendorDrag(true));
window.addEventListener('blur', () => finishVendorDrag(true));
els.adminVendorList.addEventListener('contextmenu', (event) => { if (event.target.closest('.vendor-drag-handle, .vendor-drag-label')) event.preventDefault(); });
els.adminVendorList.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { finishVendorDrag(true); return; }
  const handle = event.target.closest('.vendor-drag-handle');
  if (!handle || vendorSaving || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const id = handle.closest('[data-vendor-id]').dataset.vendorId;
  const index = adminVendorRows.findIndex((vendor) => vendor.id === id);
  const groupIndices = adminVendorRows.map((vendor, i) => vendor.visible === adminVendorRows[index].visible ? i : -1).filter((i) => i >= 0);
  const target = event.key === 'Home' ? groupIndices[0] : event.key === 'End' ? groupIndices.at(-1) : index + (event.key === 'ArrowUp' ? -1 : 1);
  if (!adminVendorRows[target] || adminVendorRows[target].visible !== adminVendorRows[index].visible) return;
  adminVendorRows.splice(target, 0, adminVendorRows.splice(index, 1)[0]);
  renderAdminVendors({ vendors: adminVendorRows });
  void persistVendorOrder().then(() => els.adminVendorList.querySelector(`[data-vendor-id="${CSS.escape(id)}"] .vendor-drag-handle`)?.focus());
});

async function loadAdminData() {
  if (!currentUser || currentUser.role !== 'admin') return;
  els.knowledgeSourceList.innerHTML = '<div class="skeleton-screen"><div class="skeleton-line"></div></div>';
  try {
    const [knowledge, feedback, vendorData] = await Promise.all([fetchAdminKnowledge(), fetchAdminFeedback(), fetchAdminVendors()]);
    renderAdminSources(knowledge);
    renderAdminFeedback(feedback);
    renderAdminVendors(vendorData);
  } catch (err) { setSafeHtml(els.knowledgeSourceList, `<div class="error-row">${escapeHtml(err.message || '管理数据加载失败')}</div>`); }
}

function switchPage(page) {
  activePage = page;
  const isCompare = page === 'compare';
  const isAdmin = page === 'admin';
  const isEvaluation = page === 'evaluation';
  els.comparePage.hidden = !isCompare;
  els.recommendPage.hidden = isCompare || isAdmin || isEvaluation;
  els.adminPage.hidden = !isAdmin;
  els.evaluationPage.hidden = !isEvaluation;
  els.compareTab.classList.toggle('active', isCompare);
  els.recommendTab.classList.toggle('active', page === 'recommend');
  els.evaluationTab.classList.toggle('active', isEvaluation);
  if (isAdmin) loadAdminData();
  if (isEvaluation) { loadEvaluationPrompts(); loadLatestEvaluation(); }
  if (page === 'recommend') loadEvaluationPrompts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function evaluationModels(type) {
  if (type === 'image') return [
    { id: 'minimax/image-01', vendorId: 'MiniMax', displayName: 'Image-01' },
    { id: 'minimax/image-01-live', vendorId: 'MiniMax', displayName: 'Image-01 Live' },
    { id: 'doubao/doubao-seedream-4-0-20260415', vendorId: 'ByteDance', displayName: 'Seedream 4.0' },
    { id: 'doubao/doubao-seedream-4-5-251128', vendorId: 'ByteDance', displayName: 'Seedream 4.5' },
  ];
  const textIds = new Set(['minimax/minimax-m3','minimax/minimax-m2.7','minimax/minimax-m2.5']);
  const isDeepSeekV4Text = (id) => /^deepseek\/deepseek-v4-(?:flash|pro)(?:-\d+)?$/.test(id);
  const permitted = type === 'text'
    ? (model) => textIds.has(model.id) || isDeepSeekV4Text(model.id)
    : () => false;
  const collator = new Intl.Collator('zh-CN', { sensitivity: 'base' });
  return models.filter(permitted).sort((a, b) => collator.compare(a.vendor?.name || a.vendorId, b.vendor?.name || b.vendorId) || collator.compare(a.displayName, b.displayName));
}
function renderEvaluationOptions() {
  const type = els.evaluationType.value;
  const prompts = evaluationPrompts.filter((prompt) => prompt.type === type);
  renderPromptOptions(els.evaluationPrompt, prompts);
  renderEvaluationPromptPreview();
  // Preserve current selections across re-renders (e.g. prompts reloading after
  // page switches); only fall back to defaults when the previous pick is gone.
  const previousA = els.evaluationModelA.value;
  const previousB = els.evaluationModelB.value;
  const options = evaluationModels(type).map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.vendor?.name || model.vendorId)} · ${escapeHtml(model.displayName)}</option>`).join('');
  setSafeHtml(els.evaluationModelA, options); setSafeHtml(els.evaluationModelB, options);
  if (previousA && [...els.evaluationModelA.options].some((option) => option.value === previousA)) els.evaluationModelA.value = previousA;
  if (previousB && [...els.evaluationModelB.options].some((option) => option.value === previousB)) els.evaluationModelB.value = previousB;
  else if (els.evaluationModelB.options.length > 1) els.evaluationModelB.selectedIndex = 1;
  renderEvaluationAvailability();
}
function renderEvaluationAvailability() {
  const ids = [els.evaluationModelA.value, els.evaluationModelB.value];
  const statuses = ids.map((id) => generationAvailability?.[id.split('/')[0]]);
  const messages = [...new Set(statuses.filter((status) => status && !status.available).map((status) => status.message))];
  const unknown = ids.some((id) => !id) || statuses.some((status) => !status);
  const hint = document.getElementById('evaluationAvailabilityHint');
  hint.textContent = messages.join(' ') || (unknown ? '暂时无法确认所选模型的评测服务状态，请刷新重试。' : '');
  hint.hidden = !hint.textContent;
  els.evaluationSubmit.disabled = evaluationBusy || unknown || messages.length > 0;
  els.evaluationSubmit.textContent = evaluationBusy ? '生成中…' : '发起测评';
}
function promptSummary(content = '') {
  return content.trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ') || '';
}
function renderPromptOptions(select, prompts) {
  const previous = select.value;
  setSafeHtml(select, prompts.map((prompt) => `<option value="${escapeHtml(prompt.id)}">${escapeHtml(prompt.title)}</option>`).join('') || '<option value="">暂无可用场景</option>');
  if (prompts.some((prompt) => prompt.id === previous)) select.value = previous;
}
function renderPromptPreview(prefix, select) {
  const prompt = evaluationPrompts.find((item) => item.id === select.value);
  const context = document.getElementById(`${prefix}Context`);
  const details = document.getElementById(`${prefix}Details`);
  const content = prompt?.content || '';
  context.hidden = !content;
  // Preserve expansion on a harmless reload; collapse when the content changes.
  if (document.getElementById(`${prefix}Preview`).textContent !== content) details.open = false;
  document.getElementById(`${prefix}Summary`).textContent = promptSummary(content);
  document.getElementById(`${prefix}Length`).textContent = `${Array.from(content).length} 字符`;
  document.getElementById(`${prefix}Preview`).textContent = content;
}
function renderEvaluationPromptPreview() {
  renderPromptPreview('evaluationPrompt', els.evaluationPrompt);
}
function renderRecommendationPromptOptions() {
  const prompts = evaluationPrompts.filter((prompt) => prompt.type === els.recommendQuery.value);
  renderPromptOptions(els.recommendPrompt, prompts);
  renderPromptPreview('recommendPrompt', els.recommendPrompt);
}
let promptLoadVersion = 0;
async function loadEvaluationPrompts() {
  const version = ++promptLoadVersion;
  try {
    const data = await fetchEvaluationPrompts();
    if (version !== promptLoadVersion) return;
    evaluationPrompts = data.prompts;
    generationAvailability = data.availability || null;
    renderEvaluationOptions();
    renderRecommendationPromptOptions();
  } catch (error) {
    if (version !== promptLoadVersion) return;
    generationAvailability = null;
    renderEvaluationAvailability();
    showToast(error.message || '评测配置加载失败');
  }
}
async function prefillEvaluationFromRecommendation() {
  await loadEvaluationPrompts();
  const type = els.recommendQuery.value;
  els.evaluationType.value = type;
  renderEvaluationOptions();
  const promptId = els.recommendPrompt.value;
  if ([...els.evaluationPrompt.options].some((option) => option.value === promptId)) els.evaluationPrompt.value = promptId;
  renderEvaluationPromptPreview();
  const candidates = (latestRecommendation?.items || []).map((item) => item.model.id).filter((id) => evaluationModels(type).some((model) => model.id === id));
  const selectable = [...els.evaluationModelA.options].map((option) => option.value);
  const first = candidates[0] || selectable[0];
  const second = candidates.find((id) => id !== first) || selectable.find((id) => id !== first);
  els.evaluationModelA.value = first;
  els.evaluationModelB.value = second || first;
  renderEvaluationAvailability();
}
async function goToEvaluationFromComparison() {
  await loadEvaluationPrompts();
  const comparedIds = getSelectedModels().map((model) => model.id);
  const picksFor = (type) => comparedIds.filter((id) => evaluationModels(type).some((model) => model.id === id));
  const imagePicks = picksFor('image');
  const textPicks = picksFor('text');
  const type = imagePicks.length >= 2 ? 'image' : textPicks.length >= 2 ? 'text' : els.evaluationType.value;
  els.evaluationType.value = type;
  renderEvaluationOptions();
  const picks = type === 'image' ? imagePicks : textPicks;
  if (picks.length) els.evaluationModelA.value = picks[0];
  if (picks.length > 1) els.evaluationModelB.value = picks[1];
  renderEvaluationAvailability();
  switchPage('evaluation');
}
function renderEvaluation(run, interactive = true) {
  latestEvaluation = interactive ? run : null; const byModel = new Map(run.results.map((result) => [result.modelId, result]));
  const card = (modelId, label) => { const model = models.find((item) => item.id === modelId) || evaluationModels(run.type).find((item) => item.id === modelId); const result = byModel.get(modelId); const imageUrl = safeExternalUrl(result?.imageUrl); const unavailable = result?.imageExpired ? '历史图片链接已过期，原始文件无法恢复。' : '图片结果不可用。'; return `<article class="evaluation-result-card"><h3>${escapeHtml(label)} · ${escapeHtml(model?.displayName || modelId)}</h3>${run.type === 'image' ? (imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(model?.displayName || '')} 生成结果" /><a class="source-link" download="modelcompare-${escapeHtml(modelId.split('/').pop())}" href="${escapeHtml(imageUrl)}">下载图片</a>` : `<p>${unavailable}</p>`) : `<pre>${escapeHtml(result?.content || '')}</pre>`}</article>`; };
  setSafeHtml(els.evaluationResults, `<div class="evaluation-result-grid">${card(run.modelAId, '模型 A')}${card(run.modelBId, '模型 B')}</div>`);
  els.evaluationJudgment.hidden = !interactive;
  loadScoreView(run);
}
async function loadLatestEvaluation() {
  try {
    const { runs } = await fetchEvaluationHistory({ type: els.evaluationType.value });
    if (runs.length) renderEvaluation(runs[0], false);
  } catch { /* 历史结果加载失败时静默，不影响评测页使用 */ }
}

function renderAdminPromptManagement() {
  document.querySelectorAll('[data-prompt-type]').forEach((button) => button.classList.toggle('active', button.dataset.promptType === activeAdminPromptType));
  els.adminPromptSectionTitle.textContent = `${activeAdminPromptType === 'text' ? '文本生成' : '图片生成'}提示词`;
  const prompts = adminEvaluationPrompts.filter((prompt) => prompt.type === activeAdminPromptType);
  setSafeHtml(els.adminEvaluationPromptList, prompts.length ? prompts.map((prompt) => `<article class="admin-list-item prompt-admin-item"><div><strong>${escapeHtml(prompt.title)}</strong><p class="prompt-scene-summary">${escapeHtml(promptSummary(prompt.content))}</p><details class="prompt-preview-details"><summary>查看完整提示词 <span class="prompt-length">${Array.from(prompt.content).length} 字符</span></summary><div class="prompt-preview-body" tabindex="0" role="region" aria-label="${escapeHtml(prompt.title)}完整提示词">${escapeHtml(prompt.content)}</div></details></div><button class="comparison-share-btn prompt-edit-btn" data-edit-prompt="${escapeHtml(prompt.id)}" type="button">编辑</button></article>`).join('') : '<div class="limit-hint">该类型暂无提示词。</div>');
}

async function loadAdminPromptManagement() {
  const [prompts, config] = await Promise.all([fetchAdminEvaluationPrompts(), fetchEvaluationConfig()]);
  adminEvaluationPrompts = prompts.prompts;
  els.textDailyLimit.value = config.textDailyLimit;
  els.imageDailyLimit.value = config.imageDailyLimit;
  renderAdminPromptManagement();
}

function openPromptEditModal(prompt) {
  editingPromptId = prompt.id;
  els.promptEditType.value = prompt.type;
  els.promptEditName.value = prompt.title;
  els.promptEditContent.value = prompt.content;
  els.promptEditOverlay.classList.add('open');
  els.promptEditModal.classList.add('open');
  els.promptEditName.focus();
}
function closePromptEditModal() {
  editingPromptId = null;
  els.promptEditOverlay.classList.remove('open');
  els.promptEditModal.classList.remove('open');
}

function switchAdminTab(tab) {
  const isKnowledge = tab === 'knowledge';
  const isVendors = tab === 'vendors';
  const isEvaluationPrompts = tab === 'evaluation-prompts';
  const isEvaluationQuota = tab === 'evaluation-quota';
  const isEvaluationResults = tab === 'evaluation-results';
  els.adminKnowledgeTab.classList.toggle('active', isKnowledge);
  els.adminVendorsTab.classList.toggle('active', isVendors);
  els.adminFeedbackTab.classList.toggle('active', tab === 'feedback');
  els.adminEvaluationPromptTab.classList.toggle('active', isEvaluationPrompts);
  els.adminEvaluationQuotaTab.classList.toggle('active', isEvaluationQuota);
  els.adminEvaluationResultsTab.classList.toggle('active', isEvaluationResults);
  els.adminKnowledgeTab.setAttribute('aria-selected', String(isKnowledge));
  els.adminVendorsTab.setAttribute('aria-selected', String(isVendors));
  els.adminFeedbackTab.setAttribute('aria-selected', String(!isKnowledge && !isVendors));
  els.adminKnowledgePanel.hidden = !isKnowledge;
  els.adminVendorsPanel.hidden = !isVendors;
  els.adminFeedbackPanel.hidden = isKnowledge || isVendors || isEvaluationPrompts || isEvaluationQuota || isEvaluationResults;
  els.adminEvaluationPromptPanel.hidden = !isEvaluationPrompts;
  els.adminEvaluationQuotaPanel.hidden = !isEvaluationQuota;
  els.adminEvaluationResultsPanel.hidden = !isEvaluationResults;
}

async function loadAdminEvaluationResults() {
  try {
    const data = await fetchAdminEvaluation({ inviteCode: els.adminEvaluationInviteFilter.value });
    adminEvaluationRuns = data.runs;
    if (!els.adminEvaluationInviteFilter.options.length || els.adminEvaluationInviteFilter.options.length === 1) setSafeHtml(els.adminEvaluationInviteFilter, `<option value="">全部邀请码</option>${data.inviteCodes.map((code) => `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`).join('')}`);
    setSafeHtml(els.adminEvaluationResultsList, data.runs.length ? data.runs.map((run) => `<article class="admin-list-item"><strong>${escapeHtml(run.user.inviteCodeLabel || '历史邀请码')} · ${run.type === 'text' ? '文本生成' : '图片生成'}</strong><p>${escapeHtml(run.promptText)}</p><button class="comparison-share-btn" data-admin-run="${escapeHtml(run.id)}" type="button">查看对比结果</button></article>`).join('') : '<div class="limit-hint">暂无对比结果。</div>');
  } catch (error) { setSafeHtml(els.adminEvaluationResultsList, `<div class="error-row">${escapeHtml(error.message || '加载失败')}</div>`); }
}

function renderAdminEvaluationRun(run) {
  const modelName = (modelId) => models.find((model) => model.id === modelId)?.displayName || evaluationModels(run.type).find((model) => model.id === modelId)?.displayName || modelId;
  const result = (modelId, label) => {
    const item = run.results.find((entry) => entry.modelId === modelId);
    const output = run.type === 'image'
      ? (safeExternalUrl(item?.imageUrl) ? `<img src="${escapeHtml(safeExternalUrl(item.imageUrl))}" alt="${escapeHtml(modelName(modelId))} 生成结果" />` : `<p>${item?.imageExpired ? '历史图片链接已过期，原始文件无法恢复。' : '图片结果不可用。'}</p>`)
      : `<pre>${escapeHtml(item?.content || '结果不可用。')}</pre>`;
    return `<article class="evaluation-result-card"><h3>${escapeHtml(label)} · ${escapeHtml(modelName(modelId))}</h3>${output}</article>`;
  };
  const verdict = { a_better: '模型 A 更好', b_better: '模型 B 更好', both_good: '两个模型都好', both_bad: '两个模型都不好' }[run.judgment?.choice] || '尚未选择评测结论';
  return `<section class="admin-evaluation-run-detail"><div class="admin-evaluation-run-meta"><strong>评测结论：${verdict}</strong><span>${new Date(run.createdAt).toLocaleString('zh-CN')}</span></div><div class="evaluation-result-grid">${result(run.modelAId, '模型 A')}${result(run.modelBId, '模型 B')}</div></section>`;
}

function formatEvidence(evidence) {
  if (evidence.field === 'contextSize') return `上下文：${formatNumber(evidence.value)}`;
  if (evidence.field === 'inputPricePerMillionUsd') {
    const amount = Number(evidence.value);
    const displayAmount = Number.isFinite(amount) ? Number(amount.toFixed(6)) : evidence.value;
    return `输入价：$${displayAmount} / 1M`;
  }
  if (evidence.field === 'imagePricePerImage') {
    const amount = Number(evidence.value);
    if (!Number.isFinite(amount)) return `图片单价：${evidence.value}`;
    const symbol = evidence.currency === 'CNY' ? '¥' : '$';
    return `图片单价：${symbol}${amount} / 张`;
  }
  if (evidence.field === 'capability') return `能力：${evidence.value}`;
  return `${evidence.field}：${evidence.value}`;
}

function formatCostAmount(value, currency) {
  if (!Number.isFinite(value)) return '价格待补充';
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency || '未知币种'} `;
  return `${symbol}${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

function formatUsd(value) {
  return Number.isFinite(value) ? `$${value.toFixed(value < 0.01 ? 6 : 2)}` : '价格待补充';
}

function closeFeedbackModal() { els.feedbackOverlay.classList.remove('open'); els.feedbackModal.classList.remove('open'); pendingFeedbackModelId = null; }
function openFeedbackModal(modelId) { pendingFeedbackModelId = modelId; els.feedbackReason.value = ''; els.feedbackOverlay.classList.add('open'); els.feedbackModal.classList.add('open'); els.feedbackReason.focus(); }
function closeKnowledgeAddModal() { els.knowledgeAddOverlay.classList.remove('open'); els.knowledgeAddModal.classList.remove('open'); }
function openKnowledgeAddModal() { els.knowledgeIngestForm.reset(); els.knowledgeAddOverlay.classList.add('open'); els.knowledgeAddModal.classList.add('open'); els.knowledgeSourceVendor.focus(); }
function closeScoreRequestModal() { els.scoreRequestOverlay.classList.remove('open'); els.scoreRequestModal.classList.remove('open'); }
function openScoreRequestModal() {
  els.scoreRequestForm.reset();
  const scene = sceneForTitle(scoreRun?.prompt?.title) || 'product';
  els.scoreScene.value = scene;
  document.getElementById('scoreSceneLabel').textContent = ({ product: '产品说明', support: '客服回复', marketing: '营销文案' })[scene] || scene;
  els.scoreRequestOverlay.classList.add('open');
  els.scoreRequestModal.classList.add('open');
  els.scoreReference.focus();
}
function closeScoreDetailModal() { els.scoreDetailOverlay.classList.remove('open'); els.scoreDetailModal.classList.remove('open'); }
function openScoreDetailModal(job) {
  const result = job?.result;
  if (!result) return;
  const lowConfidence = result.decision === 'abstain';
  setSafeHtml(els.scoreDetailBody, `
    ${lowConfidence ? `<p><span class="score-confidence-badge">低置信度</span> 部分维度置信度低于阈值 ${Number(result.threshold ?? .6).toFixed(2)}，分数仅供参考，暂不给结论。</p>` : ''}
    ${['a','b'].map((side) => `<p>${side.toUpperCase()}：${escapeHtml(result.results[side].dimensions.map((d) => `${d.label} ${d.score.toFixed(2)} / ${(d.criteria?.length || 3)-1}，置信度 ${d.confidence.toFixed(2)}，概率 ${JSON.stringify(d.probabilities)}`).join('；'))}</p>`).join('')}
    <p>${escapeHtml(job.modelVersion)} · ${escapeHtml(job.rubricVersion)} · $${Number(job.costUsd).toFixed(8)}</p>
    <p>置信度表示分布集中程度；事实判断仅依据已提供资料。AI 评分不覆盖人工结论。</p>`);
  els.scoreDetailOverlay.classList.add('open');
  els.scoreDetailModal.classList.add('open');
}

function openRecommendationPicker(items) {
  const slots = MAX_MODELS - selectedIds.length;
  if (slots <= 0) return showToast('对比数量已达上限');
  els.recommendPickerHint.textContent = `最多还能选择 ${slots} 个模型；默认勾选排名最高的候选。`;
  setSafeHtml(els.recommendPickerList, items.map((item, index) => `<label><input type="checkbox" value="${escapeHtml(item.model.id)}" ${index < slots ? 'checked' : ''} /> #${Number(item.rank) || '-'} ${escapeHtml(item.model.vendor.name)} · ${escapeHtml(item.model.displayName)}</label>`).join(''));
  const enforce = () => {
    const checked = els.recommendPickerList.querySelectorAll('input:checked');
    els.recommendPickerHint.textContent = `已选择 ${checked.length}/${slots} 个模型。`;
    els.recommendPickerList.querySelectorAll('input:not(:checked)').forEach((input) => { input.disabled = checked.length >= slots; });
  };
  els.recommendPickerList.querySelectorAll('input').forEach((input) => input.addEventListener('change', enforce));
  enforce(); els.recommendPickerOverlay.classList.add('open'); els.recommendPickerModal.classList.add('open');
}
function closeRecommendationPicker() { els.recommendPickerOverlay.classList.remove('open'); els.recommendPickerModal.classList.remove('open'); }

function renderRecommendationResults() {
  const recommendation = latestRecommendation;
  if (!recommendation) {
    els.recommendationResults.innerHTML = `
      <section class="recommendation-empty recommendation-default-state">
        <div class="recommendation-empty-icon" aria-hidden="true">✦</div>
        <h2>等待生成推荐</h2>
        <p>填写左侧任务、部署与工作负载条件后，系统会基于模型目录、知识库证据和排序偏好生成推荐结果。</p>
        <ul><li>支持按成本、上下文与综合质量排序</li><li>结果会展示预估成本、推荐依据与取舍说明</li></ul>
      </section>
    `;
    return;
  }

  if (!recommendation.items.length) {
    setSafeHtml(els.recommendationResults, `
      <section class="recommendation-empty recommendation-fallback-state">
        <div class="recommendation-empty-icon" aria-hidden="true">⌁</div>
        <h2>暂未找到满足条件的模型</h2><p>任务：${escapeHtml(recommendation.inputSnapshot?.query || '旧记录未保存输入')} · 规则 ${escapeHtml(recommendation.criteriaVersion)}</p>
        <p>本次推荐没有返回可用结果，系统未自动放宽硬性条件。可在左侧调整：${escapeHtml((recommendation.relaxations || ['部署方式、上下文、预算或能力偏好']).join('、'))}。</p>
        ${recommendation.excluded.length ? `<details><summary>查看未入选原因（${recommendation.excluded.length}）</summary><ul>${recommendation.excluded.map((item) => `<li><strong>${escapeHtml(item.modelId)}</strong>：${escapeHtml(item.reason)}</li>`).join('')}</ul></details>` : ''}
      </section>
    `);
    return;
  }

  const comparisonReady = selectedIds.length >= MIN_MODELS;
  const availableSlots = MAX_MODELS - selectedIds.length;
  setSafeHtml(els.recommendationResults, `
    <div class="recommendation-result-header">
      <div>
        <h2>推荐结果</h2>
        <p>${escapeHtml(new Date(recommendation.generatedAt).toLocaleString('zh-CN'))} · 规则 ${escapeHtml(recommendation.criteriaVersion)}</p>
      </div>
      <div class="recommendation-header-actions">
        ${recommendation.items.length >= MIN_MODELS ? `<button class="compare-selected-btn compact-action-btn" id="addAllRecommended" type="button" ${availableSlots ? '' : 'disabled'}>全部加入对比</button>` : ''}
        ${comparisonReady ? `<button class="compare-selected-btn compact-action-btn" id="compareRecommended" type="button">去评测</button>` : ''}
      </div>
    </div>
    <details class="recommendation-snapshot"><summary>评分依据与当时快照</summary>
      <p>分数是本次候选组内的相对匹配程度。</p>
      <p>有效权重：${escapeHtml(Object.entries(recommendation.effectiveWeights || {}).map(([k,v]) => `${({cost:'成本',context:'上下文',quality:'质量'})[k]} ${Math.round(v*100)}%`).join(' · ') || '旧记录未保存')}</p>
      <p>${escapeHtml((recommendation.omittedDimensions || []).map((d) => d.reason).join('；'))}</p>
      <p>解释：${escapeHtml(recommendation.rag?.explanation?.status === 'generated' ? 'AI 基于已给事实补充解释' : '规则模板')} · 检索 ${escapeHtml(recommendation.rag?.provider || '旧记录未保存')}</p>
      <p>任务：${escapeHtml(recommendation.inputSnapshot?.query || '旧记录未保存输入')}</p>
      <p>目录时间：${escapeHtml(recommendation.catalogSnapshot?.fetchedAt || '旧记录未保存')}</p>
      <p>比较组：${escapeHtml(recommendation.comparisonGroup?.billing || '未知')} / ${escapeHtml(recommendation.comparisonGroup?.currency || '未知')}</p>
      <p>当时候选 ${recommendation.candidates?.length ?? recommendation.items.length} 个；淘汰 ${recommendation.excluded?.length || 0} 个。</p>
      <ul>${(recommendation.excluded || []).map((e) => `<li>${escapeHtml(e.modelId)}：${escapeHtml(e.reason)}</li>`).join('')}</ul>
      <button id="rerunRecommendation" class="comparison-share-btn" type="button" ${recommendation.inputSnapshot ? '' : 'disabled'}>用当前数据重新推荐</button>
    </details>
    <div class="recommendation-list">
      ${recommendation.items.map((item) => {
        const isAdded = selectedIds.includes(item.model.id);
        const cannotAdd = !isAdded && selectedIds.length >= MAX_MODELS;
        const cost = item.costEstimate || {};
        const billsPerImage = cost.billing === 'per_image';
        const costLine = billsPerImage
          ? `<strong>预估月度成本 ${formatCostAmount(cost.monthly, cost.currency)}</strong><span>单张图片 ${formatCostAmount(cost.perRequest, cost.currency)} / 张</span>`
          : `<strong>预估月度成本 ${formatCostAmount(cost.monthly, cost.currency)}</strong><span>单次请求 ${formatCostAmount(cost.perRequest, cost.currency)}</span>`;
        const costDetailLine = billsPerImage
          ? `每日生成 ${cost.workload?.dailyRequests ?? '-'} 张 · 每月 ${cost.workload?.daysPerMonth ?? '-'} 天 · 按张计费（文生图 1 次请求计 1 张）`
          : `输入 ${cost.workload?.inputTokens ?? '-'} tokens · 输出 ${cost.workload?.outputTokens ?? '-'} tokens · 缓存输入 ${cost.workload?.cacheRatio ?? 0}% · 每日 ${cost.workload?.dailyRequests ?? '-'} 次 · 每月 ${cost.workload?.daysPerMonth ?? '-'} 天`;
        return `
          <article class="recommendation-card">
            <div class="recommendation-card-heading">
              <div><span class="recommendation-rank">#${Number(item.rank) || '-'}</span><span class="recommendation-vendor">${escapeHtml(item.model.vendor.name)}</span><h3>${escapeHtml(item.model.displayName)}</h3></div>
              <div class="recommendation-card-tools"><button class="feedback-btn" data-feedback="up" data-model-id="${escapeHtml(item.model.id)}" type="button" aria-label="推荐有帮助">👍</button><button class="feedback-btn" data-feedback="down" data-model-id="${escapeHtml(item.model.id)}" type="button" aria-label="推荐无帮助">👎</button><div class="recommendation-score"><strong>${item.score === null || item.score === undefined ? '—' : Number(item.score)}</strong><span>相对匹配分</span></div></div>
            </div>
            <div class="recommendation-price">${costLine}</div>
            <details class="recommendation-cost-details"><summary>查看成本明细</summary><p>${costDetailLine}</p><p>按公开 API 单价估算，批量价未公开时仍使用标准单价。</p></details>
            <details class="recommendation-cost-details"><summary>分项得分与定价来源</summary><p>${escapeHtml(Object.entries(item.scoreBreakdown || {}).map(([k,v]) => `${k}: ${v === null ? '未参与' : Number(v).toFixed(4)}`).join(' · '))}</p><ul>${(cost.rates || []).map((r) => `<li>${escapeHtml(r.metric)} · ${r.amount === null ? '未知' : Number(r.amount)} ${escapeHtml(r.currency)} / ${escapeHtml(r.unit)} · ${escapeHtml(r.channel || '未知渠道')} · ${escapeHtml(r.verifiedAt || '未核验时间')}</li>`).join('')}</ul></details>
            <div class="recommendation-section"><h4>为什么推荐</h4><ul>${(item.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul></div>
            <div class="recommendation-section tradeoff"><h4>取舍 / 不确定项</h4><ul>${(item.tradeoffs || []).map((tradeoff) => `<li>${escapeHtml(tradeoff)}</li>`).join('')}</ul></div>
            <div class="recommendation-evidence">${(item.evidence || []).map((evidence) => { const sourceUrl = safeExternalUrl(evidence.sourceUrl); return sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(formatEvidence(evidence))}</a>` : `<span>${escapeHtml(formatEvidence(evidence))}</span>`; }).join('')}</div>
            <details class="recommendation-excluded"><summary data-history-model="${escapeHtml(item.model.id)}">历史对比结果</summary><div class="model-history" data-history-content="${escapeHtml(item.model.id)}">暂无历史对比结果。</div></details>
          </article>
        `;
      }).join('')}
    </div>
  `);

  document.getElementById('rerunRecommendation')?.addEventListener('click', async (event) => {
    event.target.disabled = true;
    try { latestRecommendation = await createRecommendation(recommendation.inputSnapshot); renderRecommendationResults(); showToast('已用当前数据生成新记录', 'success'); } catch (e) { showToast(e.message); event.target.disabled = false; }
  });
  document.getElementById('compareRecommended')?.addEventListener('click', async () => { await prefillEvaluationFromRecommendation(); switchPage('evaluation'); });
  document.getElementById('addAllRecommended')?.addEventListener('click', () => {
    selectedIds = recommendation.items.slice(0, 2).map((item) => item.model.id); updateUI(); switchPage('compare');
  });
  els.recommendationResults.querySelectorAll('[data-history-model]').forEach((summary) => summary.addEventListener('click', async () => {
    const target = els.recommendationResults.querySelector(`[data-history-content="${summary.dataset.historyModel}"]`);
    if (!target || target.dataset.loaded) return; target.dataset.loaded = 'true';
    try {
      const data = await fetchEvaluationHistory({ modelId: summary.dataset.historyModel });
      setSafeHtml(target, data.runs.length ? data.runs.map((run) => {
        const result = (run.results || []).find((item) => item.modelId === summary.dataset.historyModel);
        const imageUrl = safeExternalUrl(result?.imageUrl);
        const when = run.createdAt ? new Date(run.createdAt).toLocaleString('zh-CN') : '';
        const body = run.type === 'image'
          ? (imageUrl ? `<img class="model-history-img" src="${escapeHtml(imageUrl)}" alt="历史生成图片" loading="lazy" />` : `<p class="model-history-text">${result?.imageExpired ? '历史图片链接已过期，原始文件无法恢复。' : '图片结果不可用。'}</p>`)
          : `<p class="model-history-text">${escapeHtml((result?.content || '').slice(0, 150))}</p>`;
        return `<div class="model-history-run"><p>${escapeHtml(run.promptText)}</p>${body}<span class="model-history-time">${escapeHtml(when)}</span></div>`;
      }).join('') : '暂无历史对比结果。');
    } catch { target.textContent = '历史结果加载失败。'; }
  }));
  els.recommendationResults.querySelectorAll('[data-feedback]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.dataset.feedback === 'down') return openFeedbackModal(button.dataset.modelId);
      try { await sendRecommendationFeedback(recommendation.recommendationId, { modelId: button.dataset.modelId, action: 'viewed', helpful: true }); showToast('感谢你的反馈', 'success'); } catch (err) { showToast(err.message || '反馈提交失败'); }
    });
  });
}

function selectedCheckboxValues(name) {
  return Array.from(els.recommendForm.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
}

function numericInputValue(element) {
  if (element.value.trim() === '') return undefined;
  return Number(element.value);
}

function syncDeploymentOpenSource() {
  const isSelfHosted = els.recommendDeployment.value === 'self_hosted';
  if (isSelfHosted) els.recommendOpenSource.value = 'open';
  els.recommendOpenSource.disabled = isSelfHosted;
  els.recommendOpenSource.title = isSelfHosted
    ? '私有部署需要可获得模型权重，已自动限定为仅开源'
    : '';
}

async function submitRecommendation(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  syncDeploymentOpenSource();
  if (!els.recommendForm.checkValidity()) {
    els.recommendForm.reportValidity();
    return;
  }
  if (!els.recommendPrompt.value) {
    els.recommendPrompt.setCustomValidity('请选择提示词');
    els.recommendForm.reportValidity();
    els.recommendPrompt.setCustomValidity('');
    els.recommendPrompt.focus();
    return;
  }
  const preferences = {
    cost: Number(els.costWeight.value) / 100,
    context: Number(els.contextWeight.value) / 100,
    quality: Number(els.qualityWeight.value) / 100,
  };
  if (Math.round(Object.values(preferences).reduce((total, value) => total + value, 0) * 100) !== 100) {
    showToast('排序偏好总和须为 100%');
    return;
  }
  const minContextSize = numericInputValue(els.recommendContext);
  const maxMonthlyBudgetUsd = numericInputValue(els.recommendBudget);
  const workload = {
    inputTokens: numericInputValue(els.recommendInputTokens), outputTokens: numericInputValue(els.recommendOutputTokens),
    cacheRatio: numericInputValue(els.recommendCacheRatio), dailyRequests: numericInputValue(els.recommendDailyRequests),
    daysPerMonth: numericInputValue(els.recommendDaysPerMonth),
  };
  if ((minContextSize !== undefined && (!Number.isInteger(minContextSize) || minContextSize < 0)) || (maxMonthlyBudgetUsd !== undefined && maxMonthlyBudgetUsd < 0) || [workload.inputTokens, workload.outputTokens, workload.dailyRequests, workload.daysPerMonth].some((value) => !Number.isInteger(value) || value < 0) || !Number.isFinite(workload.cacheRatio) || workload.cacheRatio < 0 || workload.cacheRatio > 100) {
    showToast('请检查上下文与预算的数值');
    return;
  }

  const payload = {
    query: evaluationPrompts.find((prompt) => prompt.id === els.recommendPrompt.value)?.content || els.recommendPrompt.options[els.recommendPrompt.selectedIndex]?.text || '',
    requirements: {
      ...(minContextSize !== undefined ? { minContextSize } : {}),
      ...(maxMonthlyBudgetUsd !== undefined ? { maxMonthlyBudget: maxMonthlyBudgetUsd } : {}),
      budgetCurrency: document.getElementById('recommendBudgetCurrency').value, billing: els.recommendQuery.value === 'image' ? 'per_image' : 'per_token',
      ...(sceneForTitle(evaluationPrompts.find((p) => p.id === els.recommendPrompt.value)?.title) ? { scene: sceneForTitle(evaluationPrompts.find((p) => p.id === els.recommendPrompt.value)?.title) } : {}),
      deployment: els.recommendDeployment.value,
      modality: els.recommendModality.value, openSource: els.recommendOpenSource.value, requiresReasoning: els.recommendReasoning.value === 'required',
      workload,
    },
    preferences,
    limit: 2,
  };
  const originalText = els.recommendSubmit.textContent;
  els.recommendSubmit.textContent = '筛选与排序中…';
  els.recommendSubmit.disabled = true;
  els.recommendationResults.innerHTML = '<div class="skeleton-screen"><div class="skeleton-title"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>';
  try {
    latestRecommendation = await createRecommendation(payload);
    renderRecommendationResults();
  } catch (err) {
    setSafeHtml(els.recommendationResults, `<div class="error-row"><span>${escapeHtml(err.message || '推荐请求失败')}</span><button class="retry-btn" id="retryRecommendation">重试</button></div>`);
    document.getElementById('retryRecommendation')?.addEventListener('click', () => els.recommendForm.requestSubmit());
  } finally {
    els.recommendSubmit.textContent = originalText;
    els.recommendSubmit.disabled = false;
  }
}

function updateWeightLabel(input, output) {
  output.textContent = `${input.value}%`;
}

function updateUI() {
  renderChips();
  renderComparison();
  renderRecommendationResults();
}

// Share image generation
function renderShareCard(size, comparedModels, fields, kind = 'overview') {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

  const modelsHtml = comparedModels
    .map((m) => `
      <div class="share-card-model">
        <div class="share-card-model-vendor">${escapeHtml(m.vendor?.name)}</div>
        <div class="share-card-model-name">${escapeHtml(m.displayName)}</div>
      </div>
    `)
    .join('');

  const shareFields = kind === 'pricing' ? [{ key: 'pricing', label: '公开计费' }] : fields;
  const fieldsHtml = shareFields
    .map((field) => {
      const valuesHtml = comparedModels
        .map((m) => {
          let value = '-';
          if (field.key === 'vendor') value = escapeHtml(m.vendor?.name || '-');
          else if (field.key === 'contextSize') value = formatNumber(m.contextSize);
          else if (field.key === 'displayName') value = escapeHtml(m.displayName);
          else if (field.key === 'category') value = escapeHtml(m.category);
          else if (field.key === 'releaseDate') value = escapeHtml(m.releaseDate);
          else if (field.key === 'sourceUrl') {
            const sourceUrl = safeExternalUrl(m.sourceUrl);
            value = sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener" class="source-link" title="${escapeHtml(sourceUrl)}">${escapeHtml(formatDomain(sourceUrl))}</a>` : '来源不可用';
          } else if (field.key === 'supportsReasoning') value = m.supportsReasoning ? '是' : '否';
          else if (field.key === 'inputModes' || field.key === 'outputModes') value = escapeHtml((m[field.key] || []).join('+') || '—');
          else if (field.key === 'primaryFeatures') value = escapeHtml(m.primaryFeatures || '—');
          else if (field.key === 'superclue') {
            const score = m.superclue;
            const dimensions = score && Object.entries(score.dimensions || score).filter(([name]) => !['totalScore', 'rank', 'category', 'evaluatedAt', 'sourceUrl', 'dimensions'].includes(name)).map(([name, value]) => `${name} ${value}`).join(' / ');
            value = escapeHtml(score ? [score.totalScore !== undefined ? `指数 ${score.totalScore}` : null, dimensions].filter(Boolean).join(' · ') : '—');
          } else if (field.key === 'pricing') value = escapeHtml(pricingItemsFor(m).map((item) => `${item.label} ${item.value}`).join('；') || m.pricing?.summary || '—');
          const mono = field.key === 'contextSize' || field.key === 'releaseDate';
          return `<div class="share-card-field-value ${mono ? 'mono' : ''}">${value}</div>`;
        })
        .join('');

      return `
        <div class="share-card-field">
          <div class="share-card-field-label">${escapeHtml(field.label)}</div>
          <div class="share-card-field-values">${valuesHtml}</div>
        </div>
      `;
    })
    .join('');

  const ratioClass = `ratio-${size.replace(':', '-')}`;

  return `
    <div class="share-card ${ratioClass}">
      <div class="share-card-header">
        <div class="share-card-logo">
          <div class="share-card-logo-mark">MC</div>
          <div class="share-card-logo-text">ModelCompare</div>
        </div>
        <div class="share-card-date">${dateStr}</div>
      </div>
      <div class="share-card-title">${kind === 'pricing' ? '模型定价对比' : '模型对比'}</div>
      <div class="share-card-models">${modelsHtml}</div>
      <div class="share-card-fields">${fieldsHtml}</div>
      <div class="share-card-footer">
        <div class="share-card-qr">QR CODE<br/>PLACEHOLDER</div>
        <div class="share-card-url">modelcompare.app/c/abc123</div>
      </div>
    </div>
  `;
}

async function openShareModal(kind = 'overview') {
  if (!requireLogin()) return;
  const selectedModels = getSelectedModels();
  if (selectedModels.length < MIN_MODELS) return;

  currentShareSize = '9:16';
  currentShareKind = kind;
  els.sharePreview.innerHTML = '<div class="skeleton-screen"><div class="skeleton-title"></div><div class="skeleton-line"></div></div>';
  updateShareTabs();
  els.shareOverlay.classList.add('open');
  els.shareModal.classList.add('open');

  try {
    const comparison = await fetchComparison(selectedIds);
    setSafeHtml(els.sharePreview, renderShareCard(
      currentShareSize,
      comparison.models,
      comparison.fields,
      currentShareKind
    ));
  } catch (err) {
    setSafeHtml(els.sharePreview, `<div class="error-row">${escapeHtml(err.message || '加载失败')}</div>`);
  }
}

function closeShareModal() {
  els.shareOverlay.classList.remove('open');
  els.shareModal.classList.remove('open');
}

function updateShareTabs() {
  els.shareSizeTabs.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.size === currentShareSize);
  });
}

async function downloadShareImage() {
  if (!selectedIds.length || selectedIds.length < MIN_MODELS) return;

  const originalText = els.downloadBtn.textContent;
  els.downloadBtn.textContent = '生成中...';
  els.downloadBtn.disabled = true;

  try {
    const blob = await generateShareImage(selectedIds, currentShareSize);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `model-compare-${currentShareSize}-${Date.now()}.png`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    // 生产环境的服务端渲染不可用时，使用已加载的 html-to-image 在客户端生成。
    // 这样分享能力不会因 Chromium 容器首次下载或短暂故障而阻塞。
    try {
      const card = els.sharePreview.querySelector('.share-card');
      if (!card || !window.htmlToImage) throw err;
      const exportCard = card.cloneNode(true);
      exportCard.classList.add('share-card-export');
      exportCard.setAttribute('aria-hidden', 'true');
      document.body.appendChild(exportCard);
      const dataUrl = await window.htmlToImage.toPng(exportCard, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#0A0A0F',
        fontEmbedCSS: '',
      });
      exportCard.remove();
      const link = document.createElement('a');
      link.download = `model-compare-${currentShareSize}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      showToast('已使用本地渲染生成分享图', 'success');
    } catch (fallbackErr) {
      console.error('生成分享图失败', fallbackErr);
      showToast(fallbackErr.message || '生成分享图失败');
    }
  } finally {
    els.downloadBtn.textContent = originalText;
    els.downloadBtn.disabled = false;
  }
}

// Event bindings
els.compareTab.addEventListener('click', () => switchPage('compare'));
els.recommendTab.addEventListener('click', () => switchPage('recommend'));
els.evaluationTab.addEventListener('click', () => switchPage('evaluation'));
els.managementButton.addEventListener('click', () => {
  if (!currentUser) { renderAuthState(); return; }
  if (currentUser.role !== 'admin') { showToast('当前账号没有管理权限'); return; }
  switchPage('admin');
});
els.addModelBtn.addEventListener('click', openDrawer);
els.drawerClose.addEventListener('click', closeDrawer);
els.drawerOverlay.addEventListener('click', closeDrawer);
els.doneBtn.addEventListener('click', () => {
  closeDrawer();
  updateUI();
});
els.shareClose.addEventListener('click', closeShareModal);
els.shareOverlay.addEventListener('click', closeShareModal);
els.downloadBtn.addEventListener('click', downloadShareImage);
els.recommendForm.addEventListener('submit', submitRecommendation);
els.evaluationType.addEventListener('change', () => { renderEvaluationOptions(); loadLatestEvaluation(); });
els.evaluationPrompt.addEventListener('change', renderEvaluationPromptPreview);
els.evaluationModelA.addEventListener('change', renderEvaluationAvailability);
els.evaluationModelB.addEventListener('change', renderEvaluationAvailability);
els.recommendPrompt.addEventListener('change', () => renderPromptPreview('recommendPrompt', els.recommendPrompt));
els.evaluationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!requireLogin() || els.evaluationSubmit.disabled) return;
  if (els.evaluationModelA.value === els.evaluationModelB.value) return showToast('请选择两个不同的模型');
  evaluationBusy = true; renderEvaluationAvailability();
  try { renderEvaluation(await createEvaluation({ type: els.evaluationType.value, promptId: els.evaluationPrompt.value, modelAId: els.evaluationModelA.value, modelBId: els.evaluationModelB.value })); }
  catch (error) {
    if (['AUTH_REQUIRED', 'INVITE_CODE_REQUIRED', 'INVITE_SESSION_MISMATCH'].includes(error.code)) {
      sessionStorage.removeItem('mc_invite_code'); currentUser = null; renderAuthState();
    }
    showToast(error.message || '评测生成失败');
  }
  finally { evaluationBusy = false; renderEvaluationAvailability(); }
});
els.evaluationJudgment.querySelectorAll('[data-judgment]').forEach((button) => button.addEventListener('click', async () => { if (!latestEvaluation) return; try { await judgeEvaluation(latestEvaluation.id, button.dataset.judgment); latestEvaluation.judgment = { choice: button.dataset.judgment }; loadScoreView(latestEvaluation); els.evaluationJudgment.hidden = true; showToast('评测结论已提交', 'success'); } catch (error) { showToast(error.message || '提交失败'); } }));
els.advancedParametersToggle.addEventListener('click', () => {
  const willExpand = els.advancedParameters.hidden;
  els.advancedParameters.hidden = !willExpand;
  els.advancedParametersToggle.setAttribute('aria-expanded', String(willExpand));
  els.advancedParametersToggle.classList.toggle('expanded', willExpand);
});
els.recommendDeployment.addEventListener('change', syncDeploymentOpenSource);
els.recommendQuery.addEventListener('change', renderRecommendationPromptOptions);
els.refreshAdminData.addEventListener('click', loadAdminData);
els.adminKnowledgeTab.addEventListener('click', () => switchAdminTab('knowledge'));
els.adminVendorsTab.addEventListener('click', () => switchAdminTab('vendors'));
els.adminFeedbackTab.addEventListener('click', () => switchAdminTab('feedback'));
els.adminEvaluationPromptTab.addEventListener('click', async () => { switchAdminTab('evaluation-prompts'); try { await loadAdminPromptManagement(); } catch (error) { showToast(error.message || '提示词配置加载失败'); } });
els.adminEvaluationQuotaTab.addEventListener('click', async () => { switchAdminTab('evaluation-quota'); try { const config = await fetchEvaluationConfig(); els.textDailyLimit.value = config.textDailyLimit; els.imageDailyLimit.value = config.imageDailyLimit; } catch (error) { showToast(error.message || '配额配置加载失败'); } });
els.adminEvaluationResultsTab.addEventListener('click', async () => { switchAdminTab('evaluation-results'); await loadAdminEvaluationResults(); });
els.saveEvaluationConfig.addEventListener('click', async () => { try { await updateEvaluationConfig({ textDailyLimit: Number(els.textDailyLimit.value), imageDailyLimit: Number(els.imageDailyLimit.value) }); showToast('评测配额已保存', 'success'); } catch (error) { showToast(error.message || '保存失败'); } });
els.refreshEvaluationResults.addEventListener('click', loadAdminEvaluationResults);
els.adminEvaluationInviteFilter.addEventListener('change', loadAdminEvaluationResults);
els.adminEvaluationResultsList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-admin-run]');
  if (!button) return;
  const run = adminEvaluationRuns.find((item) => item.id === button.dataset.adminRun);
  if (!run) return;
  const item = button.closest('.admin-list-item');
  const existing = item.querySelector('.admin-evaluation-run-detail');
  if (existing) { existing.remove(); button.textContent = '查看对比结果'; return; }
  els.adminEvaluationResultsList.querySelectorAll('.admin-evaluation-run-detail').forEach((detail) => detail.remove());
  els.adminEvaluationResultsList.querySelectorAll('[data-admin-run]').forEach((other) => { other.textContent = '查看对比结果'; });
  const detailHost = document.createElement('div');
  setSafeHtml(detailHost, renderAdminEvaluationRun(run));
  item.append(...detailHost.childNodes);
  button.textContent = '收起对比结果';
});
document.querySelectorAll('[data-prompt-type]').forEach((button) => button.addEventListener('click', () => { activeAdminPromptType = button.dataset.promptType; renderAdminPromptManagement(); }));
els.adminEvaluationPromptList.addEventListener('click', (event) => { const button = event.target.closest('[data-edit-prompt]'); if (!button) return; const prompt = adminEvaluationPrompts.find((item) => item.id === button.dataset.editPrompt); if (prompt) openPromptEditModal(prompt); });
els.promptEditClose.addEventListener('click', closePromptEditModal);
els.promptEditCancel.addEventListener('click', closePromptEditModal);
els.promptEditOverlay.addEventListener('click', closePromptEditModal);
els.promptEditForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingPromptId || !els.promptEditForm.checkValidity()) return els.promptEditForm.reportValidity();
  const submit = els.promptEditForm.querySelector('button[type="submit"]'); const original = submit.textContent;
  submit.disabled = true; submit.textContent = '保存中…';
  try {
    await updateAdminEvaluationPrompt(editingPromptId, { type: els.promptEditType.value, title: els.promptEditName.value.trim(), content: els.promptEditContent.value.trim() });
    await Promise.all([loadAdminPromptManagement(), loadEvaluationPrompts()]);
    closePromptEditModal(); showToast('提示词已更新', 'success');
  } catch (error) { showToast(error.message || '保存失败'); }
  finally { submit.disabled = false; submit.textContent = original; }
});
els.knowledgeAddButton.addEventListener('click', openKnowledgeAddModal);
els.knowledgeAddClose.addEventListener('click', closeKnowledgeAddModal);
els.knowledgeAddCancel.addEventListener('click', closeKnowledgeAddModal);
els.knowledgeAddOverlay.addEventListener('click', closeKnowledgeAddModal);
els.knowledgeIngestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!els.knowledgeIngestForm.checkValidity()) return els.knowledgeIngestForm.reportValidity();
  const button = els.knowledgeIngestForm.querySelector('button[type="submit"]');
  const label = button.textContent; button.disabled = true; button.textContent = '入库中…';
  try {
    await ingestKnowledgeSource({ url: els.knowledgeSourceUrl.value.trim(), title: els.knowledgeSourceTitle.value.trim(), vendor: els.knowledgeSourceVendor.value.trim() });
    closeKnowledgeAddModal(); await loadAdminData(); showToast('知识来源已入库', 'success');
  } catch (err) { showToast(err.message || '知识入库失败'); }
  finally { button.disabled = false; button.textContent = label; }
});
[
  [els.costWeight, els.costWeightValue],
  [els.contextWeight, els.contextWeightValue],
  [els.qualityWeight, els.qualityWeightValue],
].forEach(([input, output]) => input.addEventListener('input', () => updateWeightLabel(input, output)));

els.shareSizeTabs.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', async () => {
    currentShareSize = btn.dataset.size;
    updateShareTabs();
    try {
      const comparison = await fetchComparison(selectedIds);
      setSafeHtml(els.sharePreview, renderShareCard(
        currentShareSize,
        comparison.models,
        comparison.fields,
        currentShareKind
      ));
    } catch (err) {
      setSafeHtml(els.sharePreview, `<div class="error-row">${escapeHtml(err.message || '加载失败')}</div>`);
    }
  });
});
els.authButton.addEventListener('click', async () => {
  if (currentUser) {
    await logoutAccount(); currentUser = null; renderAuthState();
    if (activePage === 'admin') switchPage('compare');
    showToast('已退出登录', 'success'); return;
  }
  renderAuthState();
});
els.authForm.addEventListener('submit', (event) => { event.preventDefault(); authenticate(); });
els.feedbackClose.addEventListener('click', closeFeedbackModal);
els.feedbackCancel.addEventListener('click', closeFeedbackModal);
els.feedbackOverlay.addEventListener('click', closeFeedbackModal);
els.evaluationScoreButton.addEventListener('click', () => { if (scoreRun) openScoreRequestModal(); });
els.scoreRequestClose.addEventListener('click', closeScoreRequestModal);
els.scoreRequestCancel.addEventListener('click', closeScoreRequestModal);
els.scoreRequestOverlay.addEventListener('click', closeScoreRequestModal);
els.scoreDetailClose.addEventListener('click', closeScoreDetailModal);
els.scoreDetailOverlay.addEventListener('click', closeScoreDetailModal);
els.scoreRequestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!scoreRun) return;
  els.startScore.disabled = true;
  try { await startEvaluationScore(scoreRun.id, { scene: els.scoreScene.value, reference: els.scoreReference.value }); closeScoreRequestModal(); loadScoreView(scoreRun); }
  catch (e) { showToast(e.message); }
  finally { els.startScore.disabled = false; }
});
els.feedbackForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pendingFeedbackModelId || !latestRecommendation) return;
  try { await sendRecommendationFeedback(latestRecommendation.recommendationId, { modelId: pendingFeedbackModelId, action: 'dismissed', helpful: false, reason: els.feedbackReason.value.trim() }); closeFeedbackModal(); showToast('反馈已提交', 'success'); } catch (err) { showToast(err.message || '反馈提交失败'); }
});
els.recommendPickerClose.addEventListener('click', closeRecommendationPicker);
els.recommendPickerCancel.addEventListener('click', closeRecommendationPicker);
els.recommendPickerOverlay.addEventListener('click', closeRecommendationPicker);
els.recommendPickerConfirm.addEventListener('click', () => {
  const ids = [...els.recommendPickerList.querySelectorAll('input:checked')].map((input) => input.value);
  selectedIds = [...selectedIds, ...ids.filter((id) => !selectedIds.includes(id))].slice(0, MAX_MODELS);
  closeRecommendationPicker(); updateUI();
});

// Initialize
syncDeploymentOpenSource();
init();

function sceneForTitle(title = '') { return /产品.*说明/.test(title) ? 'product' : /客服/.test(title) ? 'support' : /营销/.test(title) ? 'marketing' : null; }
function setRecommendationHistoryExpanded(expanded) {
  document.getElementById('recommendationHistory').hidden = !expanded;
  const button = document.getElementById('recommendationHistoryButton');
  button.textContent = expanded ? '收起我的选型记录' : '查看我的选型记录';
  button.setAttribute('aria-expanded', String(expanded));
}
document.getElementById('recommendationHistoryButton').addEventListener('click', () => {
  if (!document.getElementById('recommendationHistory').hidden) {
    historyRequestToken++;
    setRecommendationHistoryExpanded(false);
  } else {
    loadRecommendationHistory(0);
  }
});
async function loadRecommendationHistory(offset) {
  const token = ++historyRequestToken;
  const panel = document.getElementById('recommendationHistory');
  setRecommendationHistoryExpanded(true);
  panel.textContent = '正在加载选型记录…';
  try {
    const data = await fetchRecommendationHistory(offset);
    if (token !== historyRequestToken || panel.hidden) return;
    setSafeHtml(panel, `<h3>我的选型记录</h3>${data.runs.map((run) => `<article class="admin-list-item"><div><strong>${escapeHtml(run.query || '旧记录未保存任务输入')}</strong><p>${escapeHtml(new Date(run.createdAt).toLocaleString('zh-CN'))} · ${escapeHtml(run.items.map((i) => i.name).join(' / '))}</p><button type="button" class="comparison-share-btn" data-view-recommendation="${escapeHtml(run.recommendationId)}">查看当时快照</button></div></article>`).join('') || '<p>暂无记录。</p>'}<div><button type="button" data-history-offset="${Math.max(0, offset - 10)}" ${offset ? '' : 'disabled'}>上一页</button><span> ${offset + 1}–${Math.min(offset + data.runs.length, data.total)} / ${data.total} </span><button type="button" data-history-offset="${offset + 10}" ${offset + 10 < data.total ? '' : 'disabled'}>下一页</button></div>`);
    panel.querySelectorAll('[data-history-offset]').forEach((b) => b.addEventListener('click', () => loadRecommendationHistory(Number(b.dataset.historyOffset))));
    panel.querySelectorAll('[data-view-recommendation]').forEach((b) => b.addEventListener('click', async () => { try { latestRecommendation = await fetchRecommendationSnapshot(b.dataset.viewRecommendation); renderRecommendationResults(); } catch (e) { showToast(e.message); } }));
  } catch (e) { if (token === historyRequestToken && !panel.hidden) panel.textContent = e.message || '记录加载失败'; }
}
async function loadScoreView(run) {
  const token = ++scoreViewToken, panel = document.getElementById('evaluationScore'); panel.hidden = true;
  els.evaluationScoreButton.hidden = true;
  scoreRun = run.type === 'text' ? run : null;
  if (run.type !== 'text') return;
  try {
    const [config, data] = await Promise.all([fetchScoreConfiguration(), fetchEvaluationScore(run.id)]);
    if (token !== scoreViewToken) return;
    renderScoreView(run, config, data.jobs[0], token);
  } catch { if (token === scoreViewToken) panel.textContent = '辅助评分服务暂不可用'; }
}
function renderScoreView(run, config, job, token) {
  const panel = document.getElementById('evaluationScore'), result = job?.result;
  panel.hidden = !job;
  els.evaluationScoreButton.hidden = !(config.enabled && !job);
  const verdict = result ? ({ a: 'A 较好', b: 'B 较好', tie: '接近' })[result.decision] : null;
  const lowConfidence = Boolean(result && result.decision === 'abstain');
  setSafeHtml(panel, `<h3>Jev 文本辅助评分</h3><p>${job ? escapeHtml(({pending:'等待评分',running:'评分中',succeeded:'评分完成',failed:'评分失败',skipped:'已跳过'})[job.status] || job.status) : config.enabled ? '尚未评分' : '尚未开放，中文验证完成后启用'}</p>
    ${result ? `<p class="evaluation-score-summary">A ${result.results.a.score.toFixed(1)} · B ${result.results.b.score.toFixed(1)}${verdict ? ` · ${escapeHtml(verdict)}` : ''}${lowConfidence ? ' <span class="score-confidence-badge">低置信度</span>' : ''}<button class="score-detail-btn" type="button" id="viewScoreDetail">查看评分详情</button></p>` : ''}
    ${job?.errorCode ? `<p>${escapeHtml(job.errorCode)}；为避免重复计费，不自动重发已送达状态不明的任务。</p>` : ''}
    <p>人工结论：${escapeHtml(({a_better:'A 更好',b_better:'B 更好',both_good:'都好',both_bad:'都不好'})[run.judgment?.choice] || '尚未保存')}</p>`);
  panel.querySelector('#viewScoreDetail')?.addEventListener('click', () => openScoreDetailModal(job));
  if (job && ['pending','running'].includes(job.status)) setTimeout(async () => { if (token !== scoreViewToken || activePage !== 'evaluation') return; try { const data = await fetchEvaluationScore(run.id); if (token === scoreViewToken) renderScoreView(run, config, data.jobs[0], token); } catch { panel.textContent = '评分状态读取失败，请重新打开评测页查看'; } }, 1500);
}
