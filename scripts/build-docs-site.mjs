#!/usr/bin/env node
/**
 * Builds the public Monograph documentation site from documentation/*.md
 * and release-notes.md into a folder of static HTML pages for GitHub Pages.
 *
 * Usage:
 *   node scripts/build-docs-site.mjs [output-dir]
 *
 * The output dir defaults to ../monograph-docs (a separate, public repo, so
 * this theme repo can stay private). Existing .html files there are replaced;
 * .git and anything else is left alone.
 *
 * Markdown is converted with the `marked` CLI through npx, so the theme repo
 * needs no package.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(process.argv[2] ?? join(root, '..', 'monograph-docs'));
const docsDir = join(root, 'documentation');
const MARKED = 'marked@15.0.12';

// Page order and sidebar labels. README.md becomes index.html.
const pages = [
  ['README.md', 'Overview'],
  ['getting-started.md', 'Getting started'],
  ['theme-settings.md', 'Theme settings'],
  ['header-and-menus.md', 'Header and menus'],
  ['home-page-sections.md', 'Home page sections'],
  ['product-page.md', 'Product page'],
  ['collections-and-search.md', 'Collections and search'],
  ['cart.md', 'Cart'],
  ['blog-and-pages.md', 'Blog and pages'],
  ['footer.md', 'Footer'],
  ['faq.md', 'FAQ'],
  ['support.md', 'Support'],
  ['../release-notes.md', 'Release notes'],
];

const htmlName = (md) => (basename(md) === 'README.md' ? 'index.html' : basename(md).replace(/\.md$/, '.html'));

const missing = readdirSync(docsDir).filter((f) => f.endsWith('.md') && !pages.some(([p]) => p === f));
if (missing.length) throw new Error(`Add these pages to the page list: ${missing.join(', ')}`);

function toHtml(markdown) {
  return execFileSync('npx', ['-y', MARKED, '--gfm'], { input: markdown, encoding: 'utf8' });
}

function rewriteLinks(html) {
  // foo.md, foo.md#bar, ../release-notes.md -> foo.html, foo.html#bar, release-notes.html
  return html
    .replace(/href="(?:\.\.\/)?([a-z0-9-]+|README)\.md(#[^"]*)?"/gi, (_, name, hash = '') => {
      const file = name === 'README' ? 'index' : name;
      return `href="${file}.html${hash}"`;
    })
    .replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" rel="noopener"');
}

function slug(text) {
  return text.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

function addHeadingIds(html) {
  return html.replace(/<h([2-4])>(.*?)<\/h\1>/g, (_, level, inner) => `<h${level} id="${slug(inner)}">${inner}</h${level}>`);
}

function page({ title, body, current }) {
  const nav = pages
    .map(([md, label]) => {
      const href = htmlName(md);
      const active = href === current ? ' aria-current="page"' : '';
      return `<li><a href="${href}"${active}>${label}</a></li>`;
    })
    .join('\n          ');
  const docTitle = current === 'index.html' ? 'Monograph theme documentation' : `${title} · Monograph theme documentation`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${docTitle}</title>
  <meta name="description" content="How to set up and customize Monograph, an editorial Shopify theme.">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  <div class="layout">
    <aside class="sidebar">
      <a class="brand" href="index.html">Monograph <span>Documentation</span></a>
      <details class="toc" open>
        <summary>Contents</summary>
        <nav aria-label="Documentation">
          <ol>
            ${nav}
          </ol>
        </nav>
      </details>
    </aside>
    <main id="content" class="content">
${body}
      <footer class="page-footer">Monograph is a Shopify theme by Matat. Need help? <a href="support.html">Contact support</a>.</footer>
    </main>
  </div>
  <script>
    // Contents start folded on phones, open on wider screens.
    var toc = document.querySelector('.toc');
    if (window.matchMedia('(max-width: 760px)').matches) toc.removeAttribute('open');
  </script>
</body>
</html>
`;
}

const css = `:root {
  --bg: #fbfaf7;
  --fg: #1d1c1a;
  --muted: #5f5b54;
  --rule: #d9d4ca;
  --accent: #7a5c2e;
  --code-bg: #f0ece4;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161513;
    --fg: #ece8e1;
    --muted: #a9a399;
    --rule: #3a3731;
    --accent: #d4b07a;
    --code-bg: #24221e;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 17px/1.65 Georgia, 'Iowan Old Style', 'Times New Roman', serif;
}
a { color: var(--accent); text-underline-offset: 0.18em; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 1rem; top: 1rem; background: var(--bg); padding: 0.5rem 1rem; z-index: 10; }
.layout { display: grid; grid-template-columns: 17rem minmax(0, 1fr); min-height: 100vh; }
.sidebar {
  border-right: 1px solid var(--fg);
  padding: 2rem 1.5rem;
  position: sticky; top: 0; height: 100vh; overflow-y: auto;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
}
.brand { display: block; color: var(--fg); text-decoration: none; font: 600 1.4rem/1.2 Georgia, serif; margin-bottom: 2rem; }
.brand span { display: block; font: 500 0.7rem/1.4 ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin-top: 0.35rem; }
.sidebar ol { list-style: none; margin: 0; padding: 0; counter-reset: idx; }
.sidebar li { counter-increment: idx; border-top: 1px solid var(--rule); }
.sidebar li:last-child { border-bottom: 1px solid var(--rule); }
.sidebar nav a { display: flex; gap: 0.75rem; padding: 0.55rem 0; color: var(--fg); text-decoration: none; font-size: 0.875rem; }
.sidebar nav a::before { content: counter(idx, decimal-leading-zero); color: var(--muted); font-variant-numeric: tabular-nums; }
.sidebar nav a:hover, .sidebar nav a[aria-current='page'] { color: var(--accent); }
.content { padding: 3rem clamp(1rem, 5vw, 4.5rem) 4rem; max-width: 52rem; }
h1, h2, h3, h4 { line-height: 1.25; font-weight: 600; }
h1 { font-size: clamp(2rem, 4vw, 2.75rem); margin: 0 0 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid var(--fg); }
h2 { font-size: 1.5rem; margin: 2.75rem 0 0.75rem; padding-top: 1rem; border-top: 1px solid var(--rule); }
h3 { font-size: 1.15rem; margin: 2rem 0 0.5rem; }
h4 { font-size: 1rem; margin: 1.5rem 0 0.5rem; }
p, ul, ol { margin: 0 0 1rem; }
li { margin-bottom: 0.3rem; }
code { font: 0.85em ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 3px; overflow-wrap: anywhere; }
pre { background: var(--code-bg); padding: 1rem; overflow-x: auto; border-radius: 4px; }
pre code { padding: 0; background: none; }
.table-wrap { overflow-x: auto; margin: 0 0 1.25rem; }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { text-align: left; vertical-align: top; padding: 0.55rem 0.75rem 0.55rem 0; border-bottom: 1px solid var(--rule); }
th { border-bottom: 1px solid var(--fg); font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; }
blockquote { margin: 0 0 1rem; padding: 0.25rem 0 0.25rem 1rem; border-left: 3px solid var(--accent); color: var(--muted); }
.toc summary { display: none; }
.page-footer { margin-top: 4rem; padding-top: 1rem; border-top: 1px solid var(--rule); color: var(--muted); font: 0.85rem/1.5 ui-sans-serif, system-ui, sans-serif; }
@media (max-width: 760px) {
  .layout { display: block; }
  .sidebar { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--fg); padding: 1.25rem 1rem; }
  .brand { margin-bottom: 1rem; }
  .toc summary { display: block; cursor: pointer; padding: 0.6rem 0; border-top: 1px solid var(--rule); font-size: 0.8rem; letter-spacing: 0.12em; text-transform: uppercase; }
  .toc[open] summary { margin-bottom: 0.25rem; }
  .content { padding: 2rem 1rem 3rem; }
  body { font-size: 16px; }
}
`;

mkdirSync(outDir, { recursive: true });
if (existsSync(outDir)) {
  for (const f of readdirSync(outDir)) if (f.endsWith('.html')) rmSync(join(outDir, f));
}

for (const [md] of pages) {
  const src = readFileSync(join(docsDir, md), 'utf8').replace(/<!--[\s\S]*?-->\s*/g, '');
  const leftover = src.match(/\[[A-Z][A-Z ,]{6,}[^\]]*\]/);
  if (leftover) console.warn(`Warning: ${md} still has a placeholder: ${leftover[0].slice(0, 60)}`);
  const title = (src.match(/^#\s+(.+)$/m) ?? [, 'Monograph'])[1].trim();
  let body = addHeadingIds(rewriteLinks(toHtml(src)));
  body = body.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  const current = htmlName(md);
  writeFileSync(join(outDir, current), page({ title, body, current }));
}

writeFileSync(join(outDir, 'style.css'), css);
writeFileSync(join(outDir, '.nojekyll'), '');
console.log(`Built ${pages.length} pages in ${outDir}`);
