# Monograph

An editorial Shopify theme for brands whose products and photography should
do the talking. Monograph is built for the Shopify Theme Store on Online
Store 2.0, using theme blocks throughout, and ships with two presets.

| Preset | Made for | Look |
|---|---|---|
| **Monograph** | Jewelry and accessories | Laid out like a printed catalogue: a numbered index down the left edge, ledger product cards with a material line and ruled price row, an index view on collection pages and a catalogue product page |
| **Linen** | Clothing and slow fashion | Soft and modern: Archivo headings with DM Sans body text, rounded buttons, a frosted glass header, modern product cards and a card-style footer |

Version 1.0.0. See [release notes](./release-notes.md) for the full feature list.

## Highlights

- **Catalogue system:** plates and index views on collection pages, numbered figure labels and product notes on the product page
- **Storytelling sections:** slideshow, hero, video, collage, image with text, timeline, testimonials, press logos, before/after slider and comparison table
- **Shoppable imagery:** shop the look and shoppable gallery with product hotspots
- **Product page details:** size guide, engraving and gift notes, delivery estimate, pickup availability, product tabs, bundles and a sticky add to cart bar
- **Cart and discovery:** cart drawer with a free shipping bar and suggestions, predictive search, quick view, product recommendations and recently viewed products
- **Theme Store essentials:** country and currency selector, Shop Pay Installments, Custom Liquid section and block, app blocks and accessible markup (Lighthouse accessibility 100 on tested pages)

## Getting started

### Requirements

- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) 3.x
- Node.js 18 or later, for the packaging script
- Optional: the [Shopify Liquid VS Code extension](https://shopify.dev/docs/storefronts/themes/tools/shopify-liquid-vscode)

### Run locally

The dev store is set in `shopify.theme.toml` as the `dev` environment.

```bash
shopify theme dev -e dev     # live preview at http://127.0.0.1:9292
shopify theme check          # lint Liquid, JSON and translations
```

## Project structure

```text
.
├── assets          # critical.css, shared JS (product-components.js) and icons
├── blocks          # Theme blocks: product page parts, text, media, groups
├── config          # Global settings schema and the Monograph and Linen presets
├── layout          # theme.liquid and password.liquid
├── listings        # Per-preset templates and section groups (required for multi-preset themes)
│   ├── monograph
│   └── linen
├── locales         # en.default.json and en.default.schema.json
├── sections        # Page sections and the header and footer groups
├── snippets        # Reusable fragments: product card, price, icons, forms
├── templates       # Base JSON templates (Monograph demo content)
├── listing         # Theme Store listing copy and images (not part of the theme)
├── scripts         # Build tooling
└── dist            # Packaged zips (git-ignored)
```

## Conventions

- Write CSS and JavaScript with `{% stylesheet %}` and `{% javascript %}` in the
  section, block or snippet that uses them. `assets/critical.css` holds only the
  styles every page needs.
- JavaScript shared by several components lives in `assets/product-components.js`.
  A `{% javascript %}` tag only loads on pages where its file renders, so shared
  custom elements can't depend on it.
- Every user-facing string goes through a translation key in `locales/`. Use
  sentence case.
- Snippets, and blocks that are rendered statically, start with a `{% doc %}`
  header.
- Settings that map to one CSS property use a CSS variable. Settings that change
  several properties use a class.

## Presets and listings

Preset settings live in `config/settings_data.json` under `presets`. Each
preset also has a folder in `listings/` (kebab-case of the preset name) with
the templates and section groups from its demo store. Files there override the
root `templates/` and `sections/` JSON on install.

When you change a demo store's home page or header, pull its JSON back into
the matching `listings/` folder so the installed preset still matches the demo.

## Packaging for the Theme Store

```bash
node scripts/package-for-theme-store.mjs
```

The script copies the theme to a temporary folder and cleans it for
submission:

- removes demo-store references (`shopify://` images, collections and pages)
  from templates, section groups and `listings/`
- removes placeholder social links from the current settings
- points mega menus at "Catalog", the menu item a new store has
- checks that a preset is named after the theme and that `listings/` matches
  the presets

It then runs `shopify theme package` and saves `dist/Monograph-<version>.zip`.
The files in the repo aren't changed.

Before each submission, bump `theme_version` in `config/settings_schema.json`
and add an entry to `release-notes.md`.

## License

Monograph is a commercial theme, © 2026 Matat. All rights reserved. It includes
code from Shopify's Skeleton Theme; see [LICENSE.md](./LICENSE.md) for both
notices.
