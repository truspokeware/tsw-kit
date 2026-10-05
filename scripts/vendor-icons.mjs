#!/usr/bin/env node
import { writeFile, readFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = join(HERE, '..');
const ICON_DIR = join(KIT_ROOT, 'icons');
const ICON_LIST = join(HERE, 'icon-list.txt');
const VERTS_FILE = join(ICON_DIR, '.tabler-version');

const PACKAGE = '@tabler/icons';

async function pinnedVersion() {
  const explicit = process.argv.find((a) => a.startsWith('--version='));
  if (explicit) return explicit.split('=')[1];
  const res = await fetch(`https://registry.npmjs.org/${PACKAGE}/latest`);
  if (!res.ok) throw new Error(`Could not resolve ${PACKAGE}/latest: HTTP ${res.status}`);
  return (await res.json()).version;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchIcon(name, version) {
  const url = `https://unpkg.com/${PACKAGE}@${version}/icons/outline/${name}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} from ${url}`);
  let svg = await res.text();
  svg = svg.replace(/\r\n/g, '\n').trimEnd() + '\n';
  if (!svg.startsWith('<svg')) throw new Error(`${name}: unexpected payload`);
  return svg;
}

function normalize(svg) {
  return svg
    .replace(/<\?xml[^>]*\?>\s*/g, '')
    .replace(/\s+width="[^"]*"/g, '')
    .replace(/\s+height="[^"]*"/g, '')
    .replace(/\s+class="[^"]*"/g, '')
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none" \/>/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}


async function main() {
  const version = await pinnedVersion();
  const list = (await readFile(ICON_LIST, 'utf8'))
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);

  await mkdir(ICON_DIR, { recursive: true });

  const failures = [];
  const svgByName = new Map();
  const seen = new Set();

  for (const name of list) {
    if (seen.has(name)) continue;
    seen.add(name);
    try {
      svgByName.set(name, await fetchIcon(name, version));
    } catch (err) {
      failures.push(`${name} (${err.message})`);
    }
  }

  for (const name of svgByName.keys()) {
    await writeFile(join(ICON_DIR, `${name}.svg`), svgByName.get(name), 'utf8');
  }

  const banner =
    `/* Vendored from ${PACKAGE}@${version} (MIT). Do not edit by hand.\n` +
    `   Regenerate: npm run vendor:icons\n` +
    `   License: see ../NOTICE.md\n */\n\n`;

  const parts = [banner];

  for (const name of list) {
    const svg = svgByName.get(name);
    if (!svg) continue;
    parts.push(
      `const _${name.replace(/[-_](\w)/g, (_, c) => c.toUpperCase())} = ${JSON.stringify(
        normalize(svg)
      )};\n`
    );
  }

  parts.push(`\nexport const ICON_NAMES = Object.freeze([\n`);
  parts.push(list.filter((n) => svgByName.has(n)).map((n) => `  '${n}',`).join('\n'));
  parts.push(`]);\n\nexport const ICONS = Object.freeze({\n`);
  parts.push(
    list
      .filter((n) => svgByName.has(n))
      .map((n) => `  '${n}': _${n.replace(/[-_](\w)/g, (_, c) => c.toUpperCase())},`)
      .join('\n')
  );
  parts.push(`\n});\n`);

  await writeFile(join(ICON_DIR, 'icons.js'), parts.join(''), 'utf8');
  await writeFile(VERTS_FILE, `${version}\n`, 'utf8');

  console.log(`Vendored ${svgByName.size}/${seen.size} icons from ${PACKAGE}@${version}`);
  if (failures.length) {
    console.error('\nFailed:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
  if (!(await exists(join(ICON_DIR, 'icons.js')))) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
