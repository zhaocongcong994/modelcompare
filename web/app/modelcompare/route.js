import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const source = await readFile(path.join(process.cwd(), '..', 'prototype', 'index.html'), 'utf8');
  const html = source.replace('<head>', '<head><base href="/modelcompare/" />');
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
