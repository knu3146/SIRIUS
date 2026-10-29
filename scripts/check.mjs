import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['server.js'];
for (const dir of ['api', 'js', 'scripts', 'test']) {
  for (const name of readdirSync(path.join(root, dir))) {
    if (/\.(js|mjs)$/.test(name)) files.push(`${dir}/${name}`);
  }
}
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [, src] of html.matchAll(/<script\s+src="([^"]+)"/g)) {
  readFileSync(path.join(root, src));
}
console.log(`JavaScript 문법 ${files.length}개 및 index.html 스크립트 경로 확인 완료`);
