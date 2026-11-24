# Catalogue system design

## Why
A friend's theme was rejected from the Shopify Theme Store for not being
unique. Shopify measures uniqueness by structure: "clear systems for header
and navigation, product cards, media treatments, and page structure". It
says spacing, colour, typography, blurs and animation don't count. The
glass header, parallax and transitions in this theme are effects, so they
don't make it unique on their own.

## Concept
The theme reads like a fine-jewelry auction or atelier catalogue: pieces are
numbered, information sits on ruled lines, and pages are laid out as
catalogue entries. The same idea runs through all four systems Shopify
names:

| System | Catalogue treatment | Where |
|---|---|---|
| Header and navigation | Index rail: fixed vertical, numbered menu (01, 02…) on desktop; submenus open as a full-height panel beside the rail; plain sticky bar on mobile | `sections/header.liquid` layout `header--rail` |
| Product cards | Ledger: ruled cell, catalogue number, material line (Metal/Material option, else product type), title and price on one row | `snippets/product-card.liquid` style `card--ledger` |
| Page structure | Plates/Index view toggle on collections; the index is a numbered list with a photo that follows the cursor | `sections/collection.liquid` |
| Media treatment | Catalogue product page: numbered figure labels, type and SKU reference line, product details as numbered notes | `snippets/product-info.liquid`, `snippets/product-gallery.liquid`, style `product--catalogue` |

## Presets
- **Matat**: index rail, ledger cards, catalogue product page, classic footer.
- **Apparel**: glass header with logo on the left, modern cards and product page, floating card footer.

The presets differ in structure, not only in colour and type.

## Approaches considered
- **Catalogue** (chosen): changes all four systems Shopify names, suits
  fine jewelry, and can't be recreated in another theme with settings.
- Vitrine (display-case grid with a loupe zoom): mostly visual; the zoom
  is an effect.
- On-body scale (every piece shown at real size): depends on merchant
  photos and metafields, so it's fragile in review.

## Rules for future work
- New grids pass `number` to `product-card` so ledger numbering stays consistent.
- New overlays pinned to the page edge must leave room for the rail
  (`body:has(.header--rail)` offsets by `--rail-width` at 990px and up).
- The rail publishes `--header-height: 0px` on desktop; sticky elements
  rely on that.
