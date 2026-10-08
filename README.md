# tsw-kit

Shared design tokens and web components for every TruSpokeWare site, including
our own. No build step. Plain ES modules, plain CSS, browser standards.

## The three rules

Everything else follows from these.

**1. Content lives in HTML. Components add behaviour, never content.**

A component must never be the only source of text on a page. If
`<tsw-button>Get started</tsw-button>` lost its label because the module failed
to load, that is a broken site, not a degraded one. Crawlers frequently do not
execute JavaScript, and Google requires indexable, non-JS-only content to be
eligible for AI Overviews and AI Mode. The correct pattern is to keep the words
in the markup and let JavaScript wrap or enhance them.

**2. Light DOM, not Shadow DOM.**

Components render into the light DOM. Global CSS reaches in, design tokens
inherited from `:root` cascade in, and page source stays readable. Shadow DOM is
the right tool for genuine encapsulation; this kit has no such case. The only
tradeoff is global namespace, managed by the `tsw-` prefix.

**3. Styles ship in CSS, behaviour ships in JS.**

`components.css` fully styles every component with JavaScript disabled. The
modules under `components/` add interactivity. If a component looks broken
without JS, the bug belongs in the CSS file.

## Consuming

```html
<script type="importmap">
{
  "imports": {
    "@tsw/kit": "https://cdn.jsdelivr.net/gh/truspokeware/tsw-kit@v0.1.0/index.js",
    "@tsw/kit/theme.css": "https://cdn.jsdelivr.net/gh/truspokeware/tsw-kit@v0.1.0/theme.css",
    "@tsw/kit/components.css": "https://cdn.jsdelivr.net/gh/truspokeware/tsw-kit@v0.1.0/components.css"
  }
}
</script>

<link rel="stylesheet" href="@tsw/kit/theme.css">
<link rel="stylesheet" href="@tsw/kit/components.css">
<script type="module">
  import '@tsw/kit';
</script>
```

Pin an exact tag for client builds so a future kit release cannot change a live
site. Use a floating minor tag only on sites you own end to end.

## Components

| Element | Purpose |
|---|---|
| `<tsw-icon name size label stroke>` | Inline SVG from the vendored Tabler set. Decorative and `aria-hidden` unless `label` is set. |
| `<tsw-button href type disabled loading>` | Wraps existing children in an `<a>` or `<button>`. `data-variant`, `data-size`, `data-block`, `data-loading`. |
| `<tsw-card interactive>` | Article container. Marks the first link so a CSS stretched-link makes the whole card clickable while keeping one tab stop. |
| `<tsw-section>` | Vertical rhythm, optional width, tone, alignment, and `[slot]` regions for eyebrow, heading, body, actions. |
| `<tsw-hero>` | Page-level opener with the same slot regions plus `[slot="meta"]`. |
| `<tsw-cta>` | Centred call-to-action panel. |
| `<tsw-nav>` | Sticky header, mobile panel with focus handling, Escape to close, active link via `IntersectionObserver`. |
| `<tsw-footer>` | Footer shell; fills `[data-tsw-year]`. |
| `<tsw-disclosure>` | `<details>` wrapper that builds a styled body region. |
| `<form is="tsw-form">` | Intake and contact form enhancement. See below. |

### Slot regions

Light DOM has no slots, so slots are `slot="name"` attributes plus attribute
selectors. `[slot="heading"]`, `[slot="body"]`, `[slot="actions"]` and friends are
styled from `components.css`. Author them in the HTML; the layout is identical
with and without JavaScript.

### Why the form uses `is=`

The form is a **customized built-in**, not an autonomous custom element:

```html
<form is="tsw-form" method="post" action="/api/intake">
```

Put this in `<head>`, before any markup:

```html
<script>document.documentElement.setAttribute('data-js','')</script>
```

Branch visibility is then decided by CSS from first paint, not by JavaScript
after load. Without the marker every branch fieldset stays visible, which is the
no-JavaScript behaviour and the safe default. With it, inactive branches are
hidden before the first frame, so nothing shifts while the page loads.

An autonomous `<tsw-form>` is not a form. A `<button type="submit">` inside it
submits nothing, and native constraint validation never runs. Extending
`HTMLFormElement` keeps every native behaviour, so without JavaScript the form
still posts to the server and still validates. JavaScript only adds branching,
inline error messages, and a fetch-based submit.

Behaviour it adds:

- **Branching.** A `<fieldset data-tsw-branch="key" data-tsw-branch-values="a,b">`
  is revealed when the radio group `key` holds one of those values. Hidden
  branches are `hidden` and their controls are `disabled`, so nothing invisible
  is ever submitted. With JavaScript off, every branch stays visible and the form
  is simply longer. Nothing is lost.
- **Validation.** Inline errors with `aria-invalid` and `aria-describedby`, and a
  live status region. Note that the browser blocks `submit` entirely when
  validation fails, so the status message is raised from the captured `invalid`
  event on the next animation frame rather than from the submit handler.
- **Bot resistance.** A honeypot field that must stay empty, and a floor on time
  since render. The floor is measured from render, never from the last
  keystroke, otherwise a fast legitimate submission gets silently discarded.

## Icons

53 icons from [Tabler Icons](https://tabler.io/icons) (MIT), vendored into
`icons/`. See `NOTICE.md` for the licence.

Icons are pinned, not fetched at runtime, so a client site has no third-party
dependency and cannot break when an upstream CDN changes. The pinned version is
recorded in `icons/.tabler-version`.

```bash
npm run vendor:icons                      # latest
npm run vendor:icons -- --version=3.50.0  # specific
```

`scripts/icon-list.txt` is the curated set and is grouped by purpose. Adding an
icon means adding a line to that file and re-running the script. Names come from
Tabler's outline set and occasionally get renamed upstream (`lightbulb` became
`bulb`), so check the script output for failures.

Icons are for interface chrome only. Client logos and photography never come
from an icon set.

## Theming

Override tokens on `:root` or any wrapper. Both light and dark are handled by
`light-dark()` with `color-scheme: light dark`.

```css
:root {
  --tsw-accent-bg: #2563eb;
  --tsw-accent-on: #ffffff;
  --tsw-radius-lg: 4px;
  --tsw-font-sans: "Your Font", system-ui, sans-serif;
}
```

The accent pair is the one to change most. `--tsw-accent-bg` is a filled
surface and `--tsw-accent-on` is the text on it; keep that pair above 4.5:1.
`--tsw-accent-ink` is accent-coloured text on a page background and needs 4.5:1
against `--tsw-bg`.

## Accessibility

Focus rings on every interactive element. `prefers-reduced-motion` disables
transitions and reveal animations. `prefers-contrast: more` and `forced-colors`
are both handled. Hidden labels use `.tsw-visually-hidden`, never
`display: none`.

## Verifying

`test/fixture.html` exercises every component. The kit's browser checks live in
the `site-starter` repository's `quality.yml` workflow and assert computed styles
as well as behaviour, because a component can be perfectly functional and
completely unstyled.

```bash
npm run check    # syntax
```
