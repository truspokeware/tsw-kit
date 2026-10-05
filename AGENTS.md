# tsw-kit contributor rules

Read `README.md` first. It explains the three rules this kit is built on:
content in HTML, Light DOM, styles in CSS and behaviour in JS.

## When adding a component

1. Author all layout and appearance in `components.css`, keyed on the element
   name and `[slot]` attributes. It must look correct with JS disabled.
2. Add `components/<name>.js` for behaviour only. Never generate user-visible
   text.
3. Prefix every element and class with `tsw-`.
4. Mirror author-facing attributes to `data-*` so CSS has one contract. See
   `tsw-button.js#mirror`.
5. Extend `HTMLFormElement`, never `HTMLElement`, for anything that must submit.
6. Decorative icons stay `aria-hidden`. Use `label` for meaningful ones.
7. Honour `prefers-reduced-motion` for anything animated.
8. Add computed-style assertions to the browser checks in `site-starter/.github/workflows/quality.yml`.
   A component can be functional and unstyled; only computed styles catch that.

## Never

- Use Shadow DOM.
- Hide content in CSS and reveal it from JS.
- Add a runtime dependency or a build step.
- Fetch icons or assets from a third party at runtime.
- Add a comment explaining what the code does. Name things instead.

## Release

1. Update `package.json` version.
2. Tag: `git tag v0.x.y && git push --tags`.
3. Consumers pin the tag. Never move a published tag.
4. For an icon refresh: `npm run vendor:icons -- --version=<x>`, review the diff,
   confirm `NOTICE.md` is still accurate, commit separately.
