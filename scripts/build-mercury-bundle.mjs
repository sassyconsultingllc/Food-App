#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'audits', 'mercury_foodie_bundle.txt');

const SOURCE_DIRS = [
  'app',
  'components',
  'constants',
  'contexts',
  'context',
  'hooks',
  'lib',
  'server',
  'shared',
  'types',
  'utils',
  'worker',
  'scripts',
  '__tests__',
  'tests',
];

const ROOT_CONFIGS = [
  '.env.example',
  'app.config.ts',
  'eas.json',
  'package.json',
  'tsconfig.json',
  'wrangler.toml',
  'eslint.config.js',
  'drizzle.config.ts',
  'metro.config.cjs',
  'vitest.config.ts',
  'vitest.setup.tsx',
  'expo-env.d.ts',
  'obfuscator.config.js',
  'docker-compose.yml',
  'assetlinks.json',
];

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.d.ts']);

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.expo',
  '.expo-shared',
  'build',
  'dist',
  'coverage',
  '__snapshots__',
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (SKIP_DIR_NAMES.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, out);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name);
      if (SOURCE_EXTS.has(ext) || ent.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p).split('/').join('\\');
}

function readText(p) {
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

const parts = [];
const stats = { configs: 0, mds: 0, source: 0 };

// CONFIGURATION SECTION
parts.push('# CONFIGURATION');
parts.push('');
parts.push('');
for (const cfg of ROOT_CONFIGS) {
  const full = path.join(ROOT, cfg);
  if (!fs.existsSync(full)) continue;
  parts.push(`===== FILE: ${cfg} =====`);
  parts.push(readText(full));
  parts.push('');
  stats.configs++;
}

// MARKDOWN SECTION
parts.push('');
parts.push('# MARKDOWN DOCS');
parts.push('');
parts.push('');
const rootMds = fs
  .readdirSync(ROOT)
  .filter((f) => f.toLowerCase().endsWith('.md'))
  .sort();
for (const md of rootMds) {
  const full = path.join(ROOT, md);
  parts.push(`===== FILE: ${md} =====`);
  parts.push(readText(full));
  parts.push('');
  stats.mds++;
}
// docs/ folder MDs
const docsDir = path.join(ROOT, 'docs');
if (fs.existsSync(docsDir)) {
  const collect = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) collect(full);
      else if (ent.name.toLowerCase().endsWith('.md')) {
        parts.push(`===== FILE: ${rel(full)} =====`);
        parts.push(readText(full));
        parts.push('');
        stats.mds++;
      }
    }
  };
  collect(docsDir);
}

// SOURCE SECTION
parts.push('');
parts.push('# TYPESCRIPT SOURCE');
parts.push('');
parts.push('');
const sourceFiles = [];
for (const d of SOURCE_DIRS) {
  const full = path.join(ROOT, d);
  if (!fs.existsSync(full)) continue;
  walk(full, sourceFiles);
}
sourceFiles.sort((a, b) => rel(a).localeCompare(rel(b)));
for (const f of sourceFiles) {
  parts.push(`===== FILE: ${rel(f)} =====`);
  parts.push(readText(f));
  parts.push('');
  stats.source++;
}

const final = parts.join('\n');
fs.writeFileSync(OUT, final, 'utf8');

const sizeKb = (Buffer.byteLength(final, 'utf8') / 1024).toFixed(1);
console.log(`Wrote ${OUT}`);
console.log(`  configs: ${stats.configs}`);
console.log(`  mds:     ${stats.mds}`);
console.log(`  source:  ${stats.source}`);
console.log(`  total:   ${stats.configs + stats.mds + stats.source} files`);
console.log(`  size:    ${sizeKb} KB`);
console.log(`  lines:   ${final.split('\n').length}`);
