#!/usr/bin/env node
/**
 * Builds the Theme Store submission zip from a cleaned copy of the theme.
 *
 * The repo's templates mirror the demo store, so they reference that store's
 * own images, collections and pages (`shopify://...`). Those don't exist in a
 * merchant's store, and Shopify asks that submitted JSON files don't contain
 * them. This script copies the theme to a temporary folder and:
 *   - includes the listings/ folder when there is one (one kebab-case folder
 *     per preset), which the Theme Store requires when a theme has more than
 *     one preset; a single-preset theme doesn't need it
 *   - removes every `shopify://` setting value from templates and section
 *     groups, including the preset copies under listings/
 *   - removes the same values and the placeholder social media links from
 *     the `current` settings in config/settings_data.json
 *   - points header mega menu blocks back at "Catalog", the top-level menu
 *     item in a new store's main menu (the demo store's menu uses "Shop")
 *   - checks that settings_data.json still has a preset named after the theme
 * then runs `shopify theme package` on the copy and saves the zip to dist/.
 * The theme files in the repo aren't changed.
 *
 * Usage: node scripts/package-for-theme-store.mjs
 */
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const themeDirs = ['assets', 'blocks', 'config', 'layout', 'listings', 'locales', 'sections', 'snippets', 'templates'];
const work = mkdtempSync(join(tmpdir(), 'theme-package-'));
const removed = [];
const DEFAULT_MEGA_MENU_ITEM = 'Catalog';

/** Splits Shopify's leading comment banner from the JSON body. */
function readJson(path) {
  const text = readFileSync(path, 'utf8');
  const match = text.match(/^\s*\/\*[\s\S]*?\*\/\s*/);
  const banner = match ? match[0] : '';
  return { banner, data: JSON.parse(text.slice(banner.length)) };
}

function writeJson(path, banner, data) {
  writeFileSync(path, banner + JSON.stringify(data, null, 2) + '\n');
}

/** Deletes `shopify://` values from every `settings` object, recursively. */
function stripStoreReferences(node, file, trail = '') {
  if (Array.isArray(node)) {
    node.forEach((item, index) => stripStoreReferences(item, file, `${trail}[${index}]`));
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string' && value.startsWith('shopify://')) {
      delete node[key];
      removed.push(`${file}: ${trail}.${key} (${value})`);
    } else if (Array.isArray(value) && value.some((item) => typeof item === 'string' && item.startsWith('shopify://'))) {
      delete node[key];
      removed.push(`${file}: ${trail}.${key} (list)`);
    } else {
      stripStoreReferences(value, file, `${trail}.${key}`);
    }
  }
}

/** New stores' main menu has "Catalog", not the demo store's menu items. */
function resetMegaMenus(group, file) {
  for (const [sectionKey, section] of Object.entries(group.sections || {})) {
    for (const [blockKey, block] of Object.entries(section.blocks || {})) {
      if (block.type !== 'mega_menu' || !block.settings) continue;
      if (block.settings.menu_item !== DEFAULT_MEGA_MENU_ITEM) {
        removed.push(`${file}: ${sectionKey}.${blockKey}.menu_item (${block.settings.menu_item} -> ${DEFAULT_MEGA_MENU_ITEM})`);
        block.settings.menu_item = DEFAULT_MEGA_MENU_ITEM;
      }
    }
  }
}

try {
  // listings/ is only needed (and only present) when the theme has more than one preset
  for (const dir of themeDirs) {
    if (existsSync(join(root, dir))) cpSync(join(root, dir), join(work, dir), { recursive: true });
  }

  // Templates and section groups, at the root and in each preset's listings folder
  const presetFolders = existsSync(join(work, 'listings')) ? readdirSync(join(work, 'listings')) : [];
  const jsonDirs = ['templates', 'sections'];
  for (const preset of presetFolders) {
    for (const dir of ['templates', 'sections']) {
      if (existsSync(join(work, 'listings', preset, dir))) jsonDirs.push(join('listings', preset, dir));
    }
  }
  for (const dir of jsonDirs) {
    for (const name of readdirSync(join(work, dir)).filter((file) => file.endsWith('.json'))) {
      const path = join(work, dir, name);
      const { banner, data } = readJson(path);
      stripStoreReferences(data, `${dir}/${name}`);
      if (dir.endsWith('sections') && name === 'header-group.json') resetMegaMenus(data, `${dir}/${name}`);
      writeJson(path, banner, data);
    }
  }

  // Global settings
  const settingsPath = join(work, 'config', 'settings_data.json');
  const { banner, data: settings } = readJson(settingsPath);
  const themeName = readJson(join(work, 'config', 'settings_schema.json')).data.find((group) => group.name === 'theme_info')?.theme_name;
  if (!settings.presets || !settings.presets[themeName]) {
    throw new Error(`settings_data.json has no preset named "${themeName}". Add it back before packaging.`);
  }
  // With more than one preset, each needs a kebab-case listings folder (and no strays)
  const presetNames = Object.keys(settings.presets);
  if (presetNames.length > 1) {
    const expected = presetNames.map((name) => name.toLowerCase().replace(/\s+/g, '-'));
    const missing = expected.filter((folder) => !presetFolders.includes(folder));
    const extra = presetFolders.filter((folder) => !expected.includes(folder));
    if (missing.length || extra.length) {
      throw new Error(`listings/ doesn't match the presets. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${extra.join(', ') || 'none'}.`);
    }
  }
  if (settings.current && typeof settings.current === 'object') {
    for (const key of Object.keys(settings.current)) {
      if (key.startsWith('social_') && key.endsWith('_link')) {
        removed.push(`config/settings_data.json: current.${key} (${settings.current[key]})`);
        delete settings.current[key];
      }
    }
    stripStoreReferences(settings.current, 'config/settings_data.json');
  }
  writeJson(settingsPath, banner, settings);

  console.log(`Removed or reset ${removed.length} store-specific values:`);
  for (const line of removed) console.log(`  - ${line}`);

  execFileSync('shopify', ['theme', 'package', '--path', work], { cwd: root, stdio: 'inherit' });

  // The CLI writes the zip inside the packaged folder; keep it in dist/
  const zip = readdirSync(work).find((file) => file.endsWith('.zip'));
  if (!zip) throw new Error('shopify theme package did not produce a zip.');
  mkdirSync(join(root, 'dist'), { recursive: true });
  copyFileSync(join(work, zip), join(root, 'dist', zip));
  console.log(`Saved dist/${zip}`);
} finally {
  if (existsSync(work)) rmSync(work, { recursive: true, force: true });
}
