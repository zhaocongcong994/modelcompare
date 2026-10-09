import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const assetDirectory = process.env.EVALUATION_ASSET_DIR || path.join(serverDir, 'data', 'evaluation-assets');
const publicPath = '/api/evaluation-assets/';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function evaluationAssetDirectory() {
  return assetDirectory;
}

export function isArchivedEvaluationImage(value) {
  if (typeof value !== 'string' || !value.startsWith(publicPath)) return false;
  const fileName = value.slice(publicPath.length);
  return /^[a-z0-9-]+\.(?:jpg|png|webp)$/i.test(fileName);
}

export function evaluationAssetFileName(value) {
  return isArchivedEvaluationImage(value) ? value.slice(publicPath.length) : null;
}

export async function archiveEvaluationImage(sourceUrl) {
  const response = await fetch(sourceUrl, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`生成图片归档失败（HTTP ${response.status}）`);

  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const extension = EXTENSIONS[contentType];
  if (!extension) throw new Error('生成图片归档失败（返回内容不是支持的图片格式）');

  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) throw new Error('生成图片超过 12 MB，无法归档');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('生成图片为空或超过 12 MB，无法归档');

  await mkdir(assetDirectory, { recursive: true });
  const fileName = `${randomUUID()}.${extension}`;
  const finalPath = path.join(assetDirectory, fileName);
  const temporaryPath = `${finalPath}.tmp`;
  await writeFile(temporaryPath, bytes, { flag: 'wx' });
  await rename(temporaryPath, finalPath);
  return `${publicPath}${fileName}`;
}
