import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, disconnectDb } from './db.js';
import { PROMPT_SEEDS } from './evaluation.js';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(serverDir, 'prompts', 'evaluation-prompts-export.md');
const category = { text: '文本生成', image: '图片生成', video: '视频生成', voice: '语音生成' };

function normalizeImagePrompt(content) {
  content = content.trim().replace(/[。；;，,]+$/, '');
  if (!/\b(?:png|jpe?g|webp)\b/i.test(content)) content = `${content}。输出 PNG 格式`;
  if (!/(?:分辨率\s*[：:]?\s*1\s*K|\b1\s*K\b)/i.test(content)) content = `${content}，分辨率 1K（最高）`;
  return content.endsWith('。') ? content : `${content}。`;
}

const db = await getDb();
const prompts = db
  ? await db.evaluationPrompt.findMany({ orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }] })
  : PROMPT_SEEDS.map(([type, title, content], sortOrder) => ({ type, title, content, sortOrder }));

const normalizedPrompts = prompts.map((prompt) => ({ ...prompt, content: prompt.type === 'image' ? normalizeImagePrompt(prompt.content) : prompt.content }));

if (process.argv.includes('--sync') && db) {
  await Promise.all(normalizedPrompts.filter((prompt) => prompt.type === 'image').map((prompt) => db.evaluationPrompt.update({ where: { id: prompt.id }, data: { content: prompt.content } })));
}

const markdown = [
  '# ModelCompare 提示词导出',
  '',
  '可直接复制以下「提示词」字段给任意 Agent 使用。图片生成提示词要求输出格式，并将分辨率最高限制为 1K。',
  '',
  ...normalizedPrompts.map((prompt, index) => [
    `## ${index + 1}. ${prompt.title}`,
    '',
    `- 分类：${category[prompt.type] || prompt.type}`,
    '- 提示词：',
    '',
    '```text',
    prompt.content,
    '```',
    '',
  ].join('\n')),
].join('\n');

await writeFile(outputPath, markdown, 'utf8').finally(() => disconnectDb());
console.log(`${process.argv.includes('--sync') ? 'Synchronized and e' : 'E'}xported ${prompts.length} prompts to ${outputPath}`);
