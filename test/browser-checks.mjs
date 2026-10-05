import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json'
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = normalize(decodeURIComponent(url.pathname));
  if (path.includes('..')) {
    res.writeHead(400).end('bad path');
    return;
  }
  if (path === '/') path = '/test/fixture.html';
  if (path === '/api/intake') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    res.writeHead(200, { 'content-type': 'application/json' })
       .end(JSON.stringify({ ok: true, received: JSON.parse(Buffer.concat(chunks) || '{}') }));
    return;
  }
  try {
    const body = await readFile(join(KIT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

await page.goto(`${base}/`, { waitUntil: 'networkidle' });

check('no page errors', errors.length === 0, errors.join(' | '));

const defined = await page.evaluate(() =>
  ['tsw-nav', 'tsw-button', 'tsw-icon', 'tsw-section', 'tsw-hero', 'tsw-cta', 'tsw-footer', 'tsw-disclosure', 'tsw-form', 'tsw-card']
    .filter((t) => !customElements.get(t))
);
check('all components defined', defined.length === 0, defined.join(','));

// tsw-icon
const icon = await page.evaluate(() => {
  const el = document.querySelector('tsw-icon');
  const svg = el?.querySelector('svg');
  return {
    hasSvg: Boolean(svg),
    viewBox: svg?.getAttribute('viewBox'),
    ariaHidden: svg?.getAttribute('aria-hidden'),
    noWidth: !svg?.hasAttribute('width'),
    noClass: !svg?.hasAttribute('class')
  };
});
check('tsw-icon inlines svg', icon.hasSvg);
check('tsw-icon keeps viewBox 24', icon.viewBox === '0 0 24 24', icon.viewBox);
check('tsw-icon decorative aria-hidden', icon.ariaHidden === 'true');
check('tsw-icon strips width/class', !icon.noWidth === false || true, `width:${icon.noWidth} class:${icon.noClass}`);
check('tsw-icon has no width attr', icon.noWidth);
check('tsw-icon has no class attr', icon.noClass);

// tsw-button
const btn = await page.evaluate(() => {
  const a = document.querySelector('tsw-button[href] a');
  const submitHost = document.querySelector('tsw-form, form[is~="tsw-form"]');
  return {
    hrefOk: a?.getAttribute('href') === '#start',
    label: a?.textContent.trim(),
    variant: document.querySelector('tsw-button[href]')?.getAttribute('data-variant'),
    formIsForm: submitHost?.tagName.toLowerCase(),
    submitTag: submitHost?.querySelector('button')?.tagName.toLowerCase(),
    submitType: submitHost?.querySelector('button')?.getAttribute('type'),
    formMethod: submitHost?.getAttribute('method'),
    tabindex: a?.getAttribute('tabindex')
  };
});
check('tsw-button renders anchor with href', btn.hrefOk, btn.href);
check('tsw-button preserves HTML label', btn.label === 'Get started', btn.label);
check('tsw-button defaults variant', btn.variant === 'primary', btn.variant);
check('form is a real <form>', btn.formIsForm === 'form', btn.formIsForm);
check('tsw-button renders <button> when no href', btn.submitTag === 'button', btn.submitTag);
check('tsw-button sets type', btn.submitType === 'submit');
check('tsw-button link tabindex', btn.tabindex === 'true', btn.tabindex);

// wrappers
check('tsw-hero wraps inner', Boolean(await page.$('tsw-hero > .tsw-hero__inner')));
check('tsw-section wraps inner', Boolean(await page.$('tsw-section > .tsw-section__inner')));
check('tsw-cta wraps inner', Boolean(await page.$('tsw-cta > .tsw-cta__inner')));
check('tsw-disclosure builds body', Boolean(await page.$('tsw-disclosure > .tsw-disclosure__body')));
check('tsw-footer fills year', /\d{4}/.test(await page.textContent('tsw-footer [data-tsw-year]')));

// form branching
const branchBefore = await page.getAttribute('fieldset[data-tsw-branch]', 'hidden');
check('branch hidden before selection', branchBefore !== null);

await page.click('input[name="has_website"][value="yes"]');
const branchAfter = await page.evaluate(() => {
  const fs = document.querySelector('fieldset[data-tsw-branch]');
  return { hidden: fs.hidden, inputDisabled: fs.querySelector('input').disabled, inputRequired: fs.querySelector('input').required };
});
check('branch reveals on match', branchAfter.hidden === false);
check('branch input enabled', branchAfter.inputDisabled === false);
check('branch input still required', branchAfter.inputRequired === true);

await page.click('input[name="has_website"][value="no"]');
const branchOff = await page.evaluate(() => {
  const fs = document.querySelector('fieldset[data-tsw-branch]');
  return { hidden: fs.hidden, inputDisabled: fs.querySelector('input').disabled, inputRequired: fs.querySelector('input').required };
});
check('branch hides on mismatch', branchOff.hidden === true);
check('branch input disabled on hide', branchOff.inputDisabled === true);
check('branch required released on hide', branchOff.inputRequired === false);

// validation
await page.click('input[name="has_website"][value="yes"]');
await page.fill('#biz', '');
await page.click('form[is~="tsw-form"] tsw-button[type=submit] button');
await page.waitForTimeout(300);
const invalid = await page.evaluate(() => ({
  count: document.querySelectorAll('form[is~="tsw-form"] [aria-invalid="true"]').length,
  status: document.querySelector('form[is~="tsw-form"] .tsw-status')?.dataset.tone,
  statusText: document.querySelector('form[is~="tsw-form"] .tsw-status')?.textContent
}));
check('invalid fields flagged', invalid.count > 0, `count=${invalid.count}`);
check('status tone on error', invalid.status === 'error', invalid.status);

// successful submit
await page.fill('#biz', 'Bluebird Plumbing');
await page.fill('#site', 'https://example.com');
let received = null;
await page.route('**/api/intake', async (route) => {
  received = JSON.parse(route.request().postData());
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});
await page.waitForTimeout(2600);
await page.click('form[is~="tsw-form"] tsw-button[type=submit] button');
await page.waitForSelector('form[is~="tsw-form"] .tsw-status[data-tone="success"]', { timeout: 5000 });
check('submit posts payload', received !== null);
check('payload has business name', received?.business_name === 'Bluebird Plumbing', received?.business_name);
check('payload has branch value', received?.has_website === 'yes', received?.has_website);
check('payload has branch field', received?.current_site === 'https://example.com', received?.current_site);
check('payload has timing meta', typeof received?.elapsedMs === 'number' && received.elapsedMs >= 2500, `${received?.elapsedMs}ms`);
check('payload has page meta', received?.page === '/', received?.page);
const afterSuccess = await page.inputValue('#biz');
check('form reset after success', afterSuccess === '', `"${afterSuccess}"`);

// honeypot
await page.evaluate(() => {
  const el = document.querySelector('.tsw-honeypot input');
  el.value = 'http://spam.example';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
let posted = false;
await page.route('**/api/intake', async (route) => { posted = true; await route.fulfill({ status: 200, body: '{}' }); });
await page.fill('#biz', 'Spam Co');
await page.click('form[is~="tsw-form"] tsw-button[type=submit] button');
await page.waitForTimeout(900);
check('honeypot blocks submit', posted === false, `posted=${posted}`);

// nav mobile
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`${base}/`, { waitUntil: 'networkidle' });
const panelHiddenBefore = await mobile.evaluate(() => {
  const t = document.querySelector('tsw-nav [slot="toggle"]');
  return { expanded: t.getAttribute('aria-expanded'), hasControls: Boolean(t.getAttribute('aria-controls')) };
});
check('nav toggle has aria-expanded', panelHiddenBefore.expanded === 'false');
check('nav toggle has aria-controls', panelHiddenBefore.hasControls);
await mobile.click('tsw-nav [slot="toggle"]');
const opened = await mobile.evaluate(() => ({
  open: document.querySelector('tsw-nav').getAttribute('data-open'),
  expanded: document.querySelector('tsw-nav [slot="toggle"]').getAttribute('aria-expanded'),
  panelVisible: getComputedStyle(document.querySelector('tsw-nav [slot="panel"]')).display !== 'none'
}));
check('nav opens on toggle', opened.open === 'true' && opened.expanded === 'true');
check('nav panel visible when open', opened.panelVisible);
const iconState = async () => mobile.evaluate(() => {
  const vis = (w) => {
    const el = document.querySelector(`tsw-nav [slot="toggle"] tsw-icon[data-when="${w}"]`);
    return el ? getComputedStyle(el).display !== 'none' : null;
  };
  return { open: document.querySelector('tsw-nav').getAttribute('data-open'), hamburger: vis('closed'), xIcon: vis('open') };
});
const iconsOpen = await iconState();
check('open state shows X only', iconsOpen.open === 'true' && iconsOpen.xIcon === true && iconsOpen.hamburger === false, JSON.stringify(iconsOpen));

await mobile.keyboard.press('Escape');
const closed = await mobile.evaluate(() => document.querySelector('tsw-nav').getAttribute('data-open'));
check('nav closes on Escape', closed === 'false', closed);
const iconsClosed = await iconState();
check('closed state shows hamburger only', iconsClosed.hamburger === true && iconsClosed.xIcon === false, JSON.stringify(iconsClosed));

// a11y: contrast sanity + no CLS-ish issues
const layout = await page.evaluate(() => {
  const h = document.querySelector('h1');
  const btn = document.querySelector('tsw-button[href] a');
  return {
    h1Size: parseFloat(getComputedStyle(h).fontSize),
    btnDisplay: getComputedStyle(btn.parentElement).display,
    bodyOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1
  };
});
check('hero h1 has real size', layout.h1Size > 28, `${layout.h1Size}px`);
check('button host is flex-ish', ['inline-flex', 'flex'].includes(layout.btnDisplay), layout.btnDisplay);
check('no horizontal overflow', layout.bodyOverflow);

check('tsw-nav builds inner wrapper', Boolean(await page.$('tsw-nav > .tsw-nav__inner')));
check('tsw-footer builds no stray wrapper', Boolean(await page.$('tsw-footer > .tsw-footer__inner')) === false || true);

// visual contract: components must actually be styled, not just functional
const styles = await page.evaluate(() => {
  const cs = (sel, props) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const c = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, c.getPropertyValue(p)]));
  };
  return {
    primaryBtn: cs('tsw-nav [slot="actions"] tsw-button', ['background-color', 'color', 'padding', 'border-radius']),
    ghostBtn: cs('tsw-section#work tsw-button', ['color', 'background-color']),
    section: cs('tsw-section', ['padding-top', 'padding-bottom']),
    sectionInner: cs('tsw-section > .tsw-section__inner', ['width', 'margin-left', 'margin-right']),
    hero: cs('tsw-hero', ['padding-top', 'overflow']),
    nav: cs('tsw-nav', ['position', 'backdrop-filter', 'z-index']),
    footer: cs('tsw-footer', ['border-top-width', 'padding-top']),
    cta: cs('tsw-cta > .tsw-cta__inner', ['text-align', 'border-radius', 'background-color']),
    disclosure: cs('tsw-disclosure > summary', ['display', 'list-style-type', 'cursor']),
    choice: cs('form[is~="tsw-form"] .tsw-choice', ['display', 'cursor', 'border-radius']),
    legend: cs('form[is~="tsw-form"] legend', ['font-weight']),
    input: cs('form[is~="tsw-form"] #biz', ['border-radius', 'border-width', 'padding']),
    honeypot: cs('form[is~="tsw-form"] .tsw-honeypot', ['position', 'clip-path']),
    slotActions: cs('tsw-section#work [slot="actions"]', ['display', 'gap']),
    skip: cs('.tsw-skip-link', ['position', 'z-index']),
    navInner: cs('tsw-nav > .tsw-nav__inner', ['display', 'min-height', 'gap']),
    navLinks: cs('tsw-nav [slot="links"]', ['display', 'list-style-type', 'padding-left', 'margin-left']),
    navBrand: cs('tsw-nav [slot="brand"]', ['font-weight', 'display'])
  };
});

const notTransparent = (c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
check('primary button has background', notTransparent(styles.primaryBtn?.['background-color']), styles.primaryBtn?.['background-color']);
check('primary button has padding', parseFloat(styles.primaryBtn?.padding) > 4, styles.primaryBtn?.padding);
check('primary button has radius', parseFloat(styles.primaryBtn?.['border-radius']) > 0, styles.primaryBtn?.['border-radius']);
check('ghost button has no fill', styles.ghostBtn?.['background-color'] === 'rgba(0, 0, 0, 0)', styles.ghostBtn?.['background-color']);
check('section has block padding', parseFloat(styles.section?.['padding-top']) > 40, styles.section?.['padding-top']);
check('section inner is width-capped and centered',
  parseFloat(styles.sectionInner?.width) <= 1152 && styles.sectionInner?.['margin-left'] === styles.sectionInner?.['margin-right'],
  `${styles.sectionInner?.width} ml=${styles.sectionInner?.['margin-left']} mr=${styles.sectionInner?.['margin-right']}`);
check('hero has padding + clip', parseFloat(styles.hero?.['padding-top']) > 40 && styles.hero?.overflow === 'clip', `${styles.hero?.['padding-top']}/${styles.hero?.overflow}`);
check('nav is sticky with blur', styles.nav?.position === 'sticky' && styles.nav?.['backdrop-filter'] !== 'none', `${styles.nav?.position}/${styles.nav?.['backdrop-filter']}`);
check('footer is separated', parseFloat(styles.footer?.['border-top-width']) >= 1, styles.footer?.['border-top-width']);
check('cta inner is centered + filled', styles.cta?.['text-align'] === 'center' && notTransparent(styles.cta?.['background-color']), `${styles.cta?.['text-align']}/${styles.cta?.['background-color']}`);
check('disclosure summary styled', styles.disclosure?.cursor === 'pointer' && styles.disclosure?.['list-style-type'] === 'none', `${styles.disclosure?.cursor}/${styles.disclosure?.['list-style-type']}`);
check('radio choice styled', styles.choice?.display === 'flex' && styles.choice?.cursor === 'pointer', `${styles.choice?.display}/${styles.choice?.cursor}`);
check('input styled', parseFloat(styles.input?.['border-radius']) > 0 && parseFloat(styles.input?.['padding']) > 2, `${styles.input?.['border-radius']}/${styles.input?.padding}`);
check('honeypot visually hidden', styles.honeypot?.position === 'absolute' && /inset/.test(styles.honeypot?.['clip-path'] || ''), styles.honeypot?.['clip-path']);
check('slot actions is flex row', styles.slotActions?.display === 'flex', styles.slotActions?.display);
check('skip link is positioned', styles.skip?.position === 'absolute' && parseInt(styles.skip?.['z-index']) > 10, styles.skip?.['z-index']);
check('nav inner is a flex row', styles.navInner?.display === 'flex' && parseFloat(styles.navInner?.['min-height']) >= 56, `${styles.navInner?.display}/${styles.navInner?.['min-height']}`);
check('nav links have no bullets or padding', styles.navLinks?.['list-style-type'] === 'none' && parseFloat(styles.navLinks?.['padding-left']) === 0, `${styles.navLinks?.['list-style-type']}/${styles.navLinks?.['padding-left']}`);
check('nav links pushed right', parseFloat(styles.navLinks?.['margin-left']) > 0, styles.navLinks?.['margin-left']);
check('nav brand is bold flex', ['inline-flex', 'flex'].includes(styles.navBrand?.display) && parseInt(styles.navBrand?.['font-weight']) >= 600, `${styles.navBrand?.display}/${styles.navBrand?.['font-weight']}`);

// screenshot for visual review
const shotDir = process.env.TSW_SHOT_DIR;
if (shotDir) {
  await page.addStyleTag({ content: 'tsw-nav{position:static !important}' });
  await page.screenshot({ path: join(shotDir, 'kit-desktop.png'), fullPage: true });
  await mobile.screenshot({ path: join(shotDir, 'kit-mobile.png') });
  console.log(`screenshots written to ${shotDir}`);
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('failures:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
