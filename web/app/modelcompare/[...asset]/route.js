import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png' };

export async function GET(_request, { params }) {
  const { asset } = await params;
  const relativePath = asset.join('/');
  if (!['styles.css', 'app.js', 'api.js', 'assets/dreamy-fluid-background.png', 'assets/pricing-divider-bg.png', 'assets/dreamy-fluid-clouds-wide.png', 'assets/invite-gate-clouds-original.png', 'annotation.html'].includes(relativePath)) return new Response('Not found', { status: 404 });
  const sourcePath = relativePath === 'annotation.html' ? path.join(process.cwd(), '..', 'validation', 'jev', 'annotation.html') : path.join(process.cwd(), '..', 'prototype', relativePath);
  const body = await readFile(sourcePath);
  return new Response(body, { headers: { 'content-type': contentTypes[path.extname(sourcePath)] || 'application/octet-stream', 'cache-control': 'no-store' } });
}
