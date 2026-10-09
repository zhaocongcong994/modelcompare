import fs from 'node:fs/promises';
import { readKnowledge, mutateKnowledge, knowledgeSourceId } from './knowledge-store.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve4, resolve6 } from 'node:dns/promises';
import { isIP } from 'node:net';
import { VENDOR_SOURCES } from './source-registry.js';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_PATH = path.join(SERVER_DIR, 'knowledge-sources.json');
const EMBEDDING_URL = process.env.RAG_EMBEDDING_URL || 'http://127.0.0.1:8091';
const MAX_SOURCE_BYTES = Number(process.env.KNOWLEDGE_MAX_SOURCE_BYTES || 2_000_000);
const MAX_REDIRECTS = 3;
const DEFAULT_KNOWLEDGE_HOSTS = ['platform.openai.com'];

function configuredAllowedHosts() {
  const defaults = [...DEFAULT_KNOWLEDGE_HOSTS, ...VENDOR_SOURCES.map(([, , url]) => new URL(url).hostname.toLowerCase())];
  return new Set(String(process.env.KNOWLEDGE_ALLOWED_HOSTS || defaults.join(','))
    .split(',')
    .map((host) => host.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean));
}

function isAllowedHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return [...configuredAllowedHosts()].some((allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`));
}

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || a >= 224;
}

function isPrivateIp(address) {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family !== 6) return true;
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return Boolean(mapped && isPrivateIpv4(mapped[1]));
}

async function resolvePublicAddresses(hostname) {
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('知识来源不能指向内网或保留地址');
    return;
  }
  const results = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const addresses = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (!addresses.length) throw new Error('知识来源域名无法解析');
  if (addresses.some(isPrivateIp)) throw new Error('知识来源不能解析到内网或保留地址');
}

export async function validateKnowledgeSourceUrl(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || '').trim()); }
  catch { throw new Error('知识来源 URL 无效'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('知识来源必须是无账号、无端口的 HTTPS 官方地址');
  if (!isAllowedHost(url.hostname)) throw new Error('知识来源域名不在官方白名单中');
  await resolvePublicAddresses(url.hostname);
  return url;
}

async function readLimitedText(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!/^(text\/html|text\/plain|application\/xhtml\+xml)(?:;|$)/.test(contentType)) throw new Error('知识来源必须返回 HTML 或纯文本');
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) throw new Error('知识来源内容超过大小限制');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SOURCE_BYTES) {
      await reader.cancel();
      throw new Error('知识来源内容超过大小限制');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function fetchTrustedDocument(sourceUrl) {
  let url = await validateKnowledgeSourceUrl(sourceUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ModelCompare knowledge ingestion/1.0', Accept: 'text/html,text/plain;q=0.9' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('知识来源重定向缺少目标地址');
      url = await validateKnowledgeSourceUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return { url: url.toString(), text: await readLimitedText(response) };
  }
  throw new Error('知识来源重定向次数超过限制');
}

function htmlToText(html) {
  return String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function splitChunks(text, chunkSize = 2200, overlap = 280) {
  const chunks = []; let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + chunkSize, text.length);
    if (end < text.length) end = Math.max(text.lastIndexOf('。', end), text.lastIndexOf('. ', end), text.lastIndexOf(' ', end));
    if (end <= cursor) end = Math.min(cursor + chunkSize, text.length);
    const chunk = text.slice(cursor, end).trim(); if (chunk.length > 80) chunks.push(chunk);
    cursor = Math.max(end - overlap, cursor + 1);
  }
  return chunks;
}

async function embed(texts) {
  const response = await fetch(`${EMBEDDING_URL}/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts }), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`BGE-M3 embedding unavailable (${response.status})`);
  return (await response.json()).embeddings;
}

async function loadStore() { return (await readKnowledge()).fragments; }

export async function listKnowledgeSources() {
  const fragments = await loadStore();
  const grouped = new Map();
  for (const item of fragments) {
    const current = grouped.get(item.sourceUrl) || {
      id: knowledgeSourceId(item.sourceUrl), status: item.status,
      sourceUrl: item.sourceUrl,
      title: item.title,
      vendor: item.vendor || null,
      sourceType: item.sourceType || 'official_document',
      fragmentCount: 0,
      sourceUpdatedAt: item.sourceUpdatedAt,
    };
    current.fragmentCount += 1;
    if (String(item.sourceUpdatedAt || '') > String(current.sourceUpdatedAt || '')) current.sourceUpdatedAt = item.sourceUpdatedAt;
    grouped.set(item.sourceUrl, current);
  }
  return [...grouped.values()].sort((a, b) => String(b.sourceUpdatedAt || '').localeCompare(String(a.sourceUpdatedAt || '')));
}

export async function ingestSource(source) {
  const document = await fetchTrustedDocument(source.url);
  const text = htmlToText(document.text);
  const chunks = splitChunks(text).slice(0, 80);
  if (!chunks.length) throw new Error('知识来源没有可用正文内容');
  const embeddings = await embed(chunks);
  const now = new Date().toISOString();
  return chunks.map((chunk, index) => ({ id: `${document.url}#${index}`, title: source.title, vendor: source.vendor || null, text: chunk, sourceUrl: document.url, sourceType: 'official_document', sourceUpdatedAt: now, status: 'active', embedding: embeddings[index] }));
}

export async function ingestAll(sources) {
  const validatedSources = await Promise.all(sources.map(async (source) => ({ ...source, url: (await validateKnowledgeSourceUrl(source.url)).toString() })));
  const results = [];
  for (const source of validatedSources) results.push(...await ingestSource(source));
  await mutateKnowledge((current) => {
    const statusByUrl = new Map(current.map((f) => [f.sourceUrl, f.status]));
    return [...current.filter((f) => !validatedSources.some((source) => f.sourceUrl === source.url) && !results.some((r) => r.sourceUrl === f.sourceUrl)), ...results.map((f) => ({ ...f, status: statusByUrl.get(f.sourceUrl) || 'active' }))];
  });
  return { sourceCount: validatedSources.length, chunkCount: results.length };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const sources = JSON.parse(await fs.readFile(SOURCES_PATH, 'utf8'));
  console.log(JSON.stringify(await ingestAll(sources)));
}
