import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import { formatNumber, getCatalog } from './catalog.js';
import { getPersistedCatalog } from './catalog-store.js';

const app = express();
const PORT = process.env.SHARE_PORT || 3457;

const defaultCorsOrigins = [
  'http://localhost:8765',
  'http://127.0.0.1:8765',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
const allowedCorsOrigins = new Set(
  String(process.env.SHARE_CORS_ORIGINS || process.env.CORS_ORIGINS || defaultCorsOrigins.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const isAllowedCorsOrigin = (origin) => !origin || allowedCorsOrigins.has(origin);

app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) { callback(null, isAllowedCorsOrigin(origin)); },
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 600,
}));
app.use(express.json({ limit: '1mb' }));

const SHARE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { margin: 0; background: #0A0A0F; }
  .share-card {
    background: #0A0A0F;
    color: #FFFFFF;
    font-family: 'Inter', sans-serif;
    padding: 48px;
    display: flex;
    flex-direction: column;
  }
  .share-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 40px;
  }
  .share-card-logo { display: flex; align-items: center; gap: 12px; }
  .share-card-logo-mark {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    font-size: 14px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #00D4FF;
    color: #00D4FF;
  }
  .share-card-logo-text { font-weight: 600; font-size: 18px; }
  .share-card-date { font-size: 12px; color: #6B7280; font-family: 'JetBrains Mono', monospace; }
  .share-card-title { font-size: 48px; font-weight: 600; margin-bottom: 40px; line-height: 1.2; }
  .share-card-models { display: flex; gap: 24px; margin-bottom: 40px; }
  .share-card-model {
    flex: 1;
    border: 1px solid #27272F;
    padding: 24px;
  }
  .share-card-model-vendor {
    font-size: 11px;
    color: #9CA3AF;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8px;
  }
  .share-card-model-name { font-size: 22px; font-weight: 600; line-height: 1.3; }
  .share-card-fields { display: flex; flex-direction: column; gap: 16px; flex: 1; }
  .share-card-field { border: 1px solid #27272F; padding: 20px; }
  .share-card-field-label {
    font-size: 11px;
    color: #9CA3AF;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 12px;
  }
  .share-card-field-values { display: flex; gap: 20px; }
  .share-card-field-value {
    flex: 1;
    font-size: 16px;
    line-height: 1.4;
    word-break: break-word;
  }
  .share-card-field-value.mono { font-family: 'JetBrains Mono', monospace; }
  .share-card-field-value.update-content { max-width: 100%; }
  .share-card-link {
    color: #00D4FF;
    text-decoration: none;
    border-bottom: 1px solid rgba(0, 212, 255, 0.4);
    word-break: break-all;
  }
  .share-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 40px;
    padding-top: 24px;
    border-top: 1px solid #27272F;
  }
  .share-card-qr {
    width: 100px;
    height: 100px;
    background: #FFFFFF;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #0A0A0F;
    font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
    text-align: center;
  }
  .share-card-url { font-size: 13px; color: #6B7280; font-family: 'JetBrains Mono', monospace; }
  .share-card.ratio-9-16 { width: 1080px; height: 1920px; }
  .share-card.ratio-1-1 {
    width: 1080px;
    height: 1080px;
    padding: 32px;
  }
  .share-card.ratio-1-1 .share-card-header { margin-bottom: 20px; }
  .share-card.ratio-1-1 .share-card-title { font-size: 34px; margin-bottom: 20px; }
  .share-card.ratio-1-1 .share-card-models { gap: 16px; margin-bottom: 20px; }
  .share-card.ratio-1-1 .share-card-model { padding: 14px; }
  .share-card.ratio-1-1 .share-card-model-name { font-size: 17px; }
  .share-card.ratio-1-1 .share-card-fields { gap: 10px; }
  .share-card.ratio-1-1 .share-card-field { padding: 12px; }
  .share-card.ratio-1-1 .share-card-field-label { margin-bottom: 6px; font-size: 10px; }
  .share-card.ratio-1-1 .share-card-field-value { font-size: 13px; }
  .share-card.ratio-1-1 .share-card-footer { margin-top: 16px; padding-top: 12px; }
  .share-card.ratio-1-1 .share-card-qr { width: 80px; height: 80px; }
  .share-card.ratio-1-1 .share-card-url { font-size: 12px; }

  .share-card.ratio-16-9 {
    width: 1920px;
    height: 1080px;
    padding: 32px;
  }
  .share-card.ratio-16-9 .share-card-header { margin-bottom: 20px; }
  .share-card.ratio-16-9 .share-card-title { font-size: 32px; margin-bottom: 20px; }
  .share-card.ratio-16-9 .share-card-models { gap: 16px; margin-bottom: 20px; }
  .share-card.ratio-16-9 .share-card-model { padding: 14px; }
  .share-card.ratio-16-9 .share-card-model-name { font-size: 16px; }
  .share-card.ratio-16-9 .share-card-fields {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 12px;
  }
  .share-card.ratio-16-9 .share-card-field {
    flex: 1 1 calc(50% - 6px);
    padding: 12px;
  }
  .share-card.ratio-16-9 .share-card-field-label { margin-bottom: 6px; font-size: 10px; }
  .share-card.ratio-16-9 .share-card-field-value { font-size: 13px; }
  .share-card.ratio-16-9 .share-card-footer { margin-top: 20px; padding-top: 16px; }

  .share-card.ratio-3-4 {
    width: 1080px;
    height: 1440px;
    padding: 40px;
  }
  .share-card.ratio-3-4 .share-card-header { margin-bottom: 28px; }
  .share-card.ratio-3-4 .share-card-title { font-size: 40px; margin-bottom: 28px; }
  .share-card.ratio-3-4 .share-card-models { gap: 20px; margin-bottom: 28px; }
  .share-card.ratio-3-4 .share-card-model { padding: 18px; }
  .share-card.ratio-3-4 .share-card-model-name { font-size: 19px; }
  .share-card.ratio-3-4 .share-card-fields { gap: 12px; }
  .share-card.ratio-3-4 .share-card-field { padding: 14px; }
  .share-card.ratio-3-4 .share-card-field-label { margin-bottom: 8px; font-size: 11px; }
  .share-card.ratio-3-4 .share-card-field-value { font-size: 14px; }
  .share-card.ratio-3-4 .share-card-footer { margin-top: 28px; padding-top: 18px; }
  .share-card.ratio-3-4 .share-card-qr { width: 90px; height: 90px; }

  .share-card.ratio-4-3 {
    width: 1440px;
    height: 1080px;
    padding: 32px;
  }
  .share-card.ratio-4-3 .share-card-header { margin-bottom: 20px; }
  .share-card.ratio-4-3 .share-card-title { font-size: 32px; margin-bottom: 20px; }
  .share-card.ratio-4-3 .share-card-models { gap: 16px; margin-bottom: 20px; }
  .share-card.ratio-4-3 .share-card-model { padding: 14px; }
  .share-card.ratio-4-3 .share-card-model-name { font-size: 16px; }
  .share-card.ratio-4-3 .share-card-fields {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 12px;
  }
  .share-card.ratio-4-3 .share-card-field {
    flex: 1 1 calc(50% - 6px);
    padding: 12px;
  }
  .share-card.ratio-4-3 .share-card-field-label { margin-bottom: 6px; font-size: 10px; }
  .share-card.ratio-4-3 .share-card-field-value { font-size: 13px; }
  .share-card.ratio-4-3 .share-card-footer { margin-top: 20px; padding-top: 16px; }

  /* Compact layout for 4–5 models */
  .share-card.models-4 .share-card-models,
  .share-card.models-5 .share-card-models { gap: 12px; }
  .share-card.models-4 .share-card-model,
  .share-card.models-5 .share-card-model { padding: 14px; }
  .share-card.models-4 .share-card-model-name,
  .share-card.models-5 .share-card-model-name { font-size: 15px; }
  .share-card.models-4 .share-card-field-values,
  .share-card.models-5 .share-card-field-values { gap: 12px; }
  .share-card.models-4 .share-card-field-value,
  .share-card.models-5 .share-card-field-value { font-size: 13px; }

  .share-card.ratio-9-16.models-5 .share-card-models { margin-bottom: 24px; }
  .share-card.ratio-9-16.models-5 .share-card-fields { gap: 12px; }
  .share-card.ratio-9-16.models-5 .share-card-field { padding: 14px; }

  .share-card.ratio-1-1.models-5 .share-card-models { margin-bottom: 16px; }
  .share-card.ratio-1-1.models-5 .share-card-model { padding: 10px; }
  .share-card.ratio-1-1.models-5 .share-card-model-name { font-size: 13px; }
  .share-card.ratio-1-1.models-5 .share-card-fields { gap: 8px; }
  .share-card.ratio-1-1.models-5 .share-card-field { padding: 10px; }
  .share-card.ratio-1-1.models-5 .share-card-field-value { font-size: 11px; }
  .share-card.ratio-1-1.models-5 .share-card-qr { width: 64px; height: 64px; }

  .share-card.ratio-16-9.models-5 .share-card-models,
  .share-card.ratio-4-3.models-5 .share-card-models { gap: 10px; margin-bottom: 16px; }
  .share-card.ratio-16-9.models-5 .share-card-model,
  .share-card.ratio-4-3.models-5 .share-card-model { padding: 10px; }
  .share-card.ratio-16-9.models-5 .share-card-model-name,
  .share-card.ratio-4-3.models-5 .share-card-model-name { font-size: 12px; }
  .share-card.ratio-16-9.models-5 .share-card-fields,
  .share-card.ratio-4-3.models-5 .share-card-fields { gap: 10px; }
  .share-card.ratio-16-9.models-5 .share-card-field,
  .share-card.ratio-4-3.models-5 .share-card-field { padding: 10px; flex: 1 1 calc(50% - 5px); }
  .share-card.ratio-16-9.models-5 .share-card-field-value,
  .share-card.ratio-4-3.models-5 .share-card-field-value { font-size: 11px; }

  .share-card.ratio-3-4.models-5 .share-card-models { margin-bottom: 20px; }
  .share-card.ratio-3-4.models-5 .share-card-model { padding: 12px; }
  .share-card.ratio-3-4.models-5 .share-card-model-name { font-size: 14px; }
  .share-card.ratio-3-4.models-5 .share-card-fields { gap: 10px; }
  .share-card.ratio-3-4.models-5 .share-card-field { padding: 12px; }
  .share-card.ratio-3-4.models-5 .share-card-field-value { font-size: 12px; }
`;


const SIZE_VIEWPORT = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
  '3:4': { width: 1080, height: 1440 },
  '4:3': { width: 1440, height: 1080 },
};

function formatDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '-';
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function modelToJson(model, catalog) {
  const vendor = catalog.vendorById.get(model.vendorId);
  return {
    id: model.id,
    displayName: model.displayName,
    category: model.category,
    contextSize: model.contextSize,
    openSource: model.openSource || '未披露',
    releaseDate: model.releaseDate,
    pricing: model.pricing,
    sourceUrl: model.sourceUrl,
    sourceDomain: formatDomain(model.sourceUrl),
    vendor: { name: vendor?.name || '' },
    latestUpdate: {
      title: model.updateTitle,
      feature: model.updateFeature,
    },
  };
}

function renderShareHtml(models, fields, size) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

  const modelsHtml = models
    .map(
      (m) => `
        <div class="share-card-model">
          <div class="share-card-model-vendor">${escapeHtml(m.vendor.name)}</div>
          <div class="share-card-model-name">${escapeHtml(m.displayName)}</div>
        </div>
      `
    )
    .join('');

  const fieldsHtml = fields
    .map((field) => {
      const valuesHtml = models
        .map((m) => {
          let value = '-';
          if (field.key === 'vendor') value = m.vendor?.name || '-';
          else if (field.key === 'contextSize') value = formatNumber(m.contextSize);
          else if (field.key === 'displayName') value = m.displayName;
          else if (field.key === 'category') value = m.category;
          else if (field.key === 'openSource') value = m.openSource || '未披露';
          else if (field.key === 'releaseDate') value = m.releaseDate;
          else if (field.key === 'sourceUrl') {
            const sourceUrl = safeExternalUrl(m.sourceUrl);
            value = sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" class="share-card-link">${escapeHtml(m.sourceDomain)}</a>` : '-';
          }
          else if (field.key === 'pricing') value = m.pricing?.summary || '-';
          const mono = field.key === 'contextSize' || field.key === 'releaseDate';
          const renderedValue = field.key === 'sourceUrl' ? value : escapeHtml(value);
          return `<div class="share-card-field-value ${mono ? 'mono' : ''}">${renderedValue}</div>`;
        })
        .join('');

      return `
        <div class="share-card-field">
          <div class="share-card-field-label">${field.label}</div>
          <div class="share-card-field-values">${valuesHtml}</div>
        </div>
      `;
    })
    .join('');

  const ratioClass = `ratio-${size.replace(':', '-')}`;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>${SHARE_CSS}</style>
      </head>
      <body>
        <div class="share-card ${ratioClass} models-${models.length}">
          <div class="share-card-header">
            <div class="share-card-logo">
              <div class="share-card-logo-mark">MC</div>
              <div class="share-card-logo-text">ModelCompare</div>
            </div>
            <div class="share-card-date">${dateStr}</div>
          </div>
          <div class="share-card-title">模型对比</div>
          <div class="share-card-models">${modelsHtml}</div>
          <div class="share-card-fields">${fieldsHtml}</div>
          <div class="share-card-footer">
            <div class="share-card-qr">QR CODE<br/>PLACEHOLDER</div>
            <div class="share-card-url">modelcompare.app/c/abc123</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

app.post('/share-image', async (req, res) => {
  const { ids, size = '9:16' } = req.body || {};

  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 5) {
    return res.status(400).json({
      error: {
        code: 'INVALID_COMPARISON_COUNT',
        message: '对比模型数量必须在 2–5 个之间',
      },
    });
  }

  if (!['9:16', '16:9', '3:4', '4:3'].includes(size)) {
    return res.status(400).json({
      error: { code: 'INVALID_SIZE', message: '不支持的分享图尺寸' },
    });
  }

  let catalog;
  try {
    catalog = await getPersistedCatalog() || await getCatalog();
  } catch (err) {
    console.error('Catalog refresh failed:', err);
    return res.status(503).json({ error: { code: 'CATALOG_UNAVAILABLE', message: '实时模型目录暂时不可用，请稍后重试' } });
  }

  const selectedModels = ids.map((id) => catalog.byId.get(id)).filter(Boolean);
  if (selectedModels.length !== ids.length) {
    return res.status(404).json({
      error: { code: 'MODEL_NOT_FOUND', message: '部分模型不存在' },
    });
  }

  const fields = [
    { key: 'category', label: '模型分类' },
    { key: 'vendor', label: '模型厂商' },
    { key: 'displayName', label: '模型名称' },
    { key: 'contextSize', label: '上下文大小' },
    { key: 'openSource', label: '开源状态' },
    { key: 'releaseDate', label: '发布日期' },
    { key: 'sourceUrl', label: '获取渠道' },
    { key: 'pricing', label: '定价' },
  ];

  const html = renderShareHtml(
    selectedModels.map((model) => modelToJson(model, catalog)),
    fields,
    size
  );

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: SIZE_VIEWPORT[size],
      deviceScaleFactor: 2,
    });

    await page.setContent(html, { waitUntil: 'networkidle' });

    // Wait for fonts to load
    await page.waitForTimeout(500);

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', screenshot.length);
    res.send(screenshot);
  } catch (err) {
    console.error('Share image generation failed:', err);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '生成分享图失败' },
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`ModelCompare share server running at http://localhost:${PORT}`);
});
