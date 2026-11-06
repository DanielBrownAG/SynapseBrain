import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const checking = process.argv.includes('--check');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

function badge(label, value, color) {
  const left = label.length * 7 + 12;
  const right = value.length * 7 + 12;
  const width = left + right;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escape(label + ': ' + value)}">
  <title>${escape(label + ': ' + value)}</title>
  <rect width="${width}" height="20" rx="3" fill="#555"/>
  <path d="M${left} 0h${right - 3}q3 0 3 3v14q0 3-3 3H${left}z" fill="${color}"/>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
    <text x="${left / 2}" y="14">${escape(label)}</text>
    <text x="${left + right / 2}" y="14">${escape(value)}</text>
  </g>
</svg>
`;
}

if (!checking) mkdirSync(new URL('assets/badges/', root), { recursive: true });
for (const [name, contents] of [
  ['node', badge('Node.js', pkg.engines.node, '#287a28')],
  ['version', badge('version', `v${pkg.version}`, '#007ec6')],
  ['license', badge('license', pkg.license, '#007ec6')]
]) {
  const target = new URL(`assets/badges/${name}.svg`, root);
  if (checking) {
    let current;
    try { current = readFileSync(target, 'utf8').replace(/\r\n/g, '\n'); } catch { /* Report missing badges as stale. */ }
    if (current !== contents) throw new Error(`${name} badge is stale. Run npm run badges:update and commit the updated assets.`);
  } else writeFileSync(target, contents);
}
console.log(checking ? 'Repository badges match package.json.' : 'Repository badges updated.');
