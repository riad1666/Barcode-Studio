import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { app } from '../server.js';

const CHROME_CANDIDATE_PATHS = [
  process.env.CHROME_BIN,
  process.env.EDGE_BIN,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function findBrowserExecutable() {
  for (const p of CHROME_CANDIDATE_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

class CdpRunner {
  constructor(browserPath) {
    this.browserPath = browserPath;
    this.proc = null;
    this.tmpDir = null;
    this.browserWs = null;
    this.msgId = 1;
    this.callbacks = new Map();
    this.eventListeners = new Map();
    this.sessionId = null;
    this.exceptions = [];
  }

  async start() {
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-challenge-suite-'));
    this.proc = spawn(this.browserPath, [
      '--headless=new',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      `--user-data-dir=${this.tmpDir}`,
      'about:blank',
    ]);

    const wsUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for DevTools listening on ws://')), 10000);
      this.proc.stderr.on('data', (d) => {
        const match = d.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      this.proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    this.browserWs = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      this.browserWs.onopen = resolve;
      this.browserWs.onerror = reject;
    });

    this.browserWs.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && this.callbacks.has(data.id)) {
        const cb = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        cb(data);
      } else if (data.method) {
        if (data.method === 'Runtime.exceptionThrown') {
          this.exceptions.push(data.params);
        }
        if (this.eventListeners.has(data.method)) {
          this.eventListeners.get(data.method)(data.params);
        }
      }
    };

    const target = await this.send('Target.createTarget', { url: 'about:blank' });
    const attach = await this.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    this.sessionId = attach.sessionId;

    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, (res) => {
        if (res.error) {
          reject(new Error(`${method} failed: ${res.error.message}`));
        } else {
          resolve(res.result);
        }
      });
      const payload = { id, method, params };
      if (this.sessionId) payload.sessionId = this.sessionId;
      this.browserWs.send(JSON.stringify(payload));
    });
  }

  async setViewport(width, height, isMobile = false, deviceScaleFactor = 1) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile: isMobile,
    });
  }

  async navigate(url) {
    const loadPromise = new Promise((resolve) => {
      this.eventListeners.set('Page.loadEventFired', resolve);
    });
    await this.send('Page.navigate', { url });
    await loadPromise;
    await new Promise((r) => setTimeout(r, 200));
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result ? res.result.value : undefined;
  }

  async close() {
    if (this.browserWs) {
      try { this.browserWs.close(); } catch {}
    }
    if (this.proc) {
      try { this.proc.kill(); } catch {}
    }
    await new Promise((r) => setTimeout(r, 200));
    if (this.tmpDir) {
      try { fs.rmSync(this.tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
}

async function runAdversarialFrontendChallenge() {
  console.log('=== STARTING EMPIRICAL ADVERSARIAL FRONTEND CHALLENGE ===\n');

  // Start HTTP Server
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at: ${baseUrl}`);

  const browserPath = findBrowserExecutable();
  console.log(`Browser executable: ${browserPath}`);
  assert.ok(browserPath, 'Chromium browser not found');

  const cdp = new CdpRunner(browserPath);
  await cdp.start();

  const findings = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: 1440x900 Desktop 3-Column Layout & Overflow across all 4 modules
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing 1440x900 Desktop 3-Column Layout & Viewport Overflow ---');
    await cdp.setViewport(1440, 900, false, 1);
    await cdp.navigate(baseUrl);

    const desktopLayoutTest = await cdp.evaluate(`(() => {
      const results = {};

      // 1. Check Module 1 layout
      const sidebar = document.querySelector('.category-sidebar');
      const editor = document.querySelector('.generator-editor');
      const stage = document.querySelector('.generator-stage-panel');
      const layout = document.querySelector('.generator-layout');

      const sRect = sidebar ? sidebar.getBoundingClientRect() : null;
      const eRect = editor ? editor.getBoundingClientRect() : null;
      const stRect = stage ? stage.getBoundingClientRect() : null;

      results.module1 = {
        hasSidebar: Boolean(sidebar),
        hasEditor: Boolean(editor),
        hasStage: Boolean(stage),
        sidebarWidth: sRect ? sRect.width : 0,
        editorWidth: eRect ? eRect.width : 0,
        stageWidth: stRect ? stRect.width : 0,
        is3Column: sRect && eRect && stRect && (sRect.right <= eRect.left + 2) && (eRect.right <= stRect.left + 2),
        docScrollWidth: document.documentElement.scrollWidth,
        windowWidth: window.innerWidth,
        hasOverflow: document.documentElement.scrollWidth > window.innerWidth
      };

      // Check overflow on each module
      const modules = ['generator', 'qr-studio', 'business-cards', 'labels'];
      results.moduleOverflows = {};

      modules.forEach(mod => {
        // Switch module
        const tab = document.querySelector(\`.nav-tab[data-module="\${mod}"]\`);
        if (tab) tab.click();
        results.moduleOverflows[mod] = {
          scrollWidth: document.documentElement.scrollWidth,
          hasOverflow: document.documentElement.scrollWidth > window.innerWidth
        };
      });

      // Switch back to generator
      const genTab = document.querySelector('.nav-tab[data-module="generator"]');
      if (genTab) genTab.click();

      return results;
    })()`);

    console.log('Desktop 1440x900 results:', JSON.stringify(desktopLayoutTest, null, 2));

    if (!desktopLayoutTest.module1.is3Column) {
      findings.push({
        area: '1440x900 Desktop Layout',
        issue: 'Columns are not laid out horizontally in 3 distinct columns (Sidebar -> Editor -> Stage)',
        details: desktopLayoutTest.module1
      });
    }

    for (const [mod, ov] of Object.entries(desktopLayoutTest.moduleOverflows)) {
      if (ov.hasOverflow) {
        findings.push({
          area: `1440x900 Desktop Overflow (${mod})`,
          issue: `Horizontal overflow detected in module ${mod} (scrollWidth=${ov.scrollWidth} > innerWidth=1440)`,
          details: ov
        });
      }
    }

    // -------------------------------------------------------------------------
    // TEST 2: 375x812 Mobile Viewport & Horizontal Overflow
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing 375x812 Mobile Viewport & Horizontal Overflow across modules & modals ---');
    await cdp.setViewport(375, 812, true, 2);
    await cdp.navigate(baseUrl);

    const mobileOverflowTest = await cdp.evaluate(`(() => {
      const results = {};
      const modules = ['generator', 'qr-studio', 'business-cards', 'labels'];

      // Function to find any element overflowing the viewport width
      function findOverflowingElements() {
        const docW = 375;
        const all = Array.from(document.querySelectorAll('*'));
        const overflowing = [];
        for (const el of all) {
          const rect = el.getBoundingClientRect();
          // Check if right edge exceeds viewport significantly
          if (rect.right > docW + 1 && rect.width > 0 && rect.height > 0) {
            overflowing.push({
              tag: el.tagName,
              id: el.id,
              className: el.className,
              rect: { left: rect.left, right: rect.right, width: rect.width }
            });
          }
        }
        return overflowing;
      }

      results.modules = {};
      modules.forEach(mod => {
        const tab = document.querySelector(\`.nav-tab[data-module="\${mod}"]\`);
        if (tab) tab.click();
        results.modules[mod] = {
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          hasOverflow: document.documentElement.scrollWidth > 375,
          overflowingElements: findOverflowingElements().slice(0, 10)
        };
      });

      // Switch back to generator
      const genTab = document.querySelector('.nav-tab[data-module="generator"]');
      if (genTab) genTab.click();

      // Check with search modal open
      const searchBtn = document.querySelector('[data-open-search]');
      if (searchBtn) searchBtn.click();
      results.searchModal = {
        scrollWidth: document.documentElement.scrollWidth,
        hasOverflow: document.documentElement.scrollWidth > 375,
        overflowingElements: findOverflowingElements().slice(0, 5)
      };
      // Close search modal
      const closeSearch = document.querySelector('#searchPaletteModal [data-modal-close]');
      if (closeSearch) closeSearch.click();

      // Check with sequence modal open
      const seqBtn = document.querySelector('#openSequenceModalBtn');
      if (seqBtn) seqBtn.click();
      results.sequenceModal = {
        scrollWidth: document.documentElement.scrollWidth,
        hasOverflow: document.documentElement.scrollWidth > 375,
        overflowingElements: findOverflowingElements().slice(0, 5)
      };
      const closeSeq = document.querySelector('#sequenceModal [data-modal-close]');
      if (closeSeq) closeSeq.click();

      return results;
    })()`);

    console.log('Mobile 375x812 overflow test results:', JSON.stringify(mobileOverflowTest, null, 2));

    for (const [mod, data] of Object.entries(mobileOverflowTest.modules)) {
      if (data.hasOverflow || data.overflowingElements.length > 0) {
        findings.push({
          area: `Mobile 375x812 Layout (${mod})`,
          issue: `Horizontal overflow or elements exceeding viewport detected in ${mod}`,
          details: data
        });
      }
    }
    if (mobileOverflowTest.searchModal.hasOverflow || mobileOverflowTest.searchModal.overflowingElements.length > 0) {
      findings.push({
        area: 'Mobile 375x812 Modal (Search)',
        issue: 'Search modal causes overflow or elements exceed viewport width',
        details: mobileOverflowTest.searchModal
      });
    }
    if (mobileOverflowTest.sequenceModal.hasOverflow || mobileOverflowTest.sequenceModal.overflowingElements.length > 0) {
      findings.push({
        area: 'Mobile 375x812 Modal (Sequence)',
        issue: 'Sequence modal causes overflow or elements exceed viewport width',
        details: mobileOverflowTest.sequenceModal
      });
    }

    // -------------------------------------------------------------------------
    // TEST 3: Touch Targets (>= 44px) on Mobile Viewport (375x812)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Touch Targets (>= 44px) across all interactive elements ---');
    await cdp.setViewport(375, 812, true, 2);
    await cdp.navigate(baseUrl);

    const touchAudit = await cdp.evaluate(`(() => {
      const results = {
        failingElements: [],
        totalChecked: 0,
        byCategory: {}
      };

      const modules = ['generator', 'qr-studio', 'business-cards', 'labels'];

      modules.forEach(mod => {
        const modTab = document.querySelector(\`.nav-tab[data-module="\${mod}"]\`);
        if (modTab) modTab.click();

        // Query all interactive elements visible in this module + global header
        const selector = 'button, a, input, select, textarea, [role="button"], [role="tab"], .pill-item, .category-item, .category-header, .segmented-btn, .template-card-choice, .qr-preset-card, .label-template-option, .checkbox-item';
        const elements = Array.from(document.querySelectorAll(selector));

        elements.forEach(el => {
          // Check if element is visible and displayed
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          results.totalChecked++;

          // Check if width or height is below 44px
          // Note: for inline text links, width might be small, but buttons/controls must meet 44px
          const isButtonOrControl = el.tagName === 'BUTTON' ||
                                    el.tagName === 'INPUT' ||
                                    el.tagName === 'SELECT' ||
                                    el.classList.contains('pill-item') ||
                                    el.classList.contains('segmented-btn') ||
                                    el.classList.contains('nav-tab') ||
                                    el.classList.contains('tab-trigger') ||
                                    el.classList.contains('category-item') ||
                                    el.classList.contains('category-header') ||
                                    el.classList.contains('checkbox-item');

          if (isButtonOrControl) {
            // Check height and width
            const heightFail = rect.height < 43.5;
            const widthFail = rect.width < 43.5;

            if (heightFail || widthFail) {
              const info = {
                module: mod,
                tag: el.tagName,
                id: el.id || null,
                className: el.className || null,
                text: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30),
                width: Math.round(rect.width * 10) / 10,
                height: Math.round(rect.height * 10) / 10,
                reason: heightFail && widthFail ? 'both height and width < 44px' : heightFail ? 'height < 44px' : 'width < 44px'
              };

              // Avoid duplicate reporting if already found in header
              const key = \`\${el.id}_\${el.className}_\${info.text}\`;
              if (!results.byCategory[key]) {
                results.byCategory[key] = info;
                results.failingElements.push(info);
              }
            }
          }
        });
      });

      return results;
    })()`);

    console.log(`Touch targets checked: ${touchAudit.totalChecked}, failing: ${touchAudit.failingElements.length}`);
    if (touchAudit.failingElements.length > 0) {
      console.log('Sample failing elements:', JSON.stringify(touchAudit.failingElements.slice(0, 15), null, 2));
      findings.push({
        area: 'Touch Targets (< 44px)',
        issue: `${touchAudit.failingElements.length} interactive elements have tap target dimensions below 44px on mobile`,
        failingCount: touchAudit.failingElements.length,
        samples: touchAudit.failingElements
      });
    }

    // -------------------------------------------------------------------------
    // TEST 4: Keyboard Focus Rings & Accessibility Obscuration
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Keyboard Focus Rings & Accessibility ---');
    await cdp.setViewport(1440, 900, false, 1);
    await cdp.navigate(baseUrl);

    const a11yTest = await cdp.evaluate(`(() => {
      const results = {
        focusVisibleTest: [],
        skipLinkTest: null,
        validationSummaryTest: null,
        reducedMotionTest: null
      };

      // 1. Skip link
      const skipLink = document.querySelector('.skip-link');
      if (skipLink) {
        skipLink.focus();
        const rect = skipLink.getBoundingClientRect();
        results.skipLinkTest = {
          exists: true,
          top: rect.top,
          isVisibleOnFocus: rect.top >= 0
        };
      }

      // 2. Sample interactive elements focus ring check
      const focusTargets = [
        document.querySelector('.brand-logo'),
        document.querySelector('.nav-tab'),
        document.querySelector('#themeToggleBtn'),
        document.querySelector('[data-open-search]'),
        document.querySelector('#barcodePayload'),
        document.querySelector('#copyBarcodeImgBtn')
      ].filter(Boolean);

      focusTargets.forEach(el => {
        el.focus();
        const style = window.getComputedStyle(el);
        results.focusVisibleTest.push({
          tag: el.tagName,
          id: el.id,
          outline: style.outline,
          outlineWidth: style.outlineWidth,
          outlineStyle: style.outlineStyle,
          boxShadow: style.boxShadow
        });
      });

      // 3. Validation Summary test
      const valSummary = document.querySelector('#validationSummary');
      results.validationSummaryTest = {
        exists: Boolean(valSummary),
        role: valSummary ? valSummary.getAttribute('role') : null,
        tabindex: valSummary ? valSummary.getAttribute('tabindex') : null
      };

      return results;
    })()`);

    console.log('A11y & Focus rings results:', JSON.stringify(a11yTest, null, 2));

    // -------------------------------------------------------------------------
    // TEST 5: WCAG AA Color Contrast Audit in Both Themes
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing WCAG AA Contrast Ratios (>= 4.5:1 text, >= 3:1 UI) in Both Themes ---');

    const contrastAudit = await cdp.evaluate(`(() => {
      // Relative luminance calculation
      function getLuminance(r, g, b) {
        const a = [r, g, b].map(v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
      }

      function parseColor(str) {
        if (!str) return null;
        str = str.trim();
        if (str.startsWith('#')) {
          if (str.length === 4) {
            const r = parseInt(str[1] + str[1], 16);
            const g = parseInt(str[2] + str[2], 16);
            const b = parseInt(str[3] + str[3], 16);
            return { r, g, b };
          } else if (str.length === 7) {
            const r = parseInt(str.slice(1, 3), 16);
            const g = parseInt(str.slice(3, 5), 16);
            const b = parseInt(str.slice(5, 7), 16);
            return { r, g, b };
          }
        }
        const rgbMatch = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (rgbMatch) {
          return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
        }
        return null;
      }

      function getContrastRatio(rgb1, rgb2) {
        const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
        const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
        const brightest = Math.max(lum1, lum2);
        const darkest = Math.min(lum1, lum2);
        return (brightest + 0.05) / (darkest + 0.05);
      }

      const results = {};
      const themes = ['paper', 'oled'];

      themes.forEach(theme => {
        document.documentElement.setAttribute('data-theme', theme);
        const computed = window.getComputedStyle(document.documentElement);

        // Core token pairs
        const pairs = [
          { name: 'main text on bg-surface', fg: computed.getPropertyValue('--color-text-main'), bg: computed.getPropertyValue('--color-bg-surface'), req: 4.5 },
          { name: 'main text on bg-app', fg: computed.getPropertyValue('--color-text-main'), bg: computed.getPropertyValue('--color-bg-app'), req: 4.5 },
          { name: 'muted text on bg-surface', fg: computed.getPropertyValue('--color-text-muted'), bg: computed.getPropertyValue('--color-bg-surface'), req: 4.5 },
          { name: 'muted text on bg-app', fg: computed.getPropertyValue('--color-text-muted'), bg: computed.getPropertyValue('--color-bg-app'), req: 4.5 },
          { name: 'subtle text on bg-surface', fg: computed.getPropertyValue('--color-text-subtle'), bg: computed.getPropertyValue('--color-bg-surface'), req: 4.5 },
          { name: 'subtle text on bg-app', fg: computed.getPropertyValue('--color-text-subtle'), bg: computed.getPropertyValue('--color-bg-app'), req: 4.5 },
          { name: 'primary button text on primary bg', fg: computed.getPropertyValue('--color-primary-text'), bg: computed.getPropertyValue('--color-primary'), req: 4.5 },
          { name: 'accent button text on accent bg', fg: computed.getPropertyValue('--color-accent-text'), bg: computed.getPropertyValue('--color-accent'), req: 4.5 },
          { name: 'destructive button text on destructive bg', fg: computed.getPropertyValue('--color-destructive-text'), bg: computed.getPropertyValue('--color-destructive'), req: 4.5 },
          { name: 'primary color as text on surface', fg: computed.getPropertyValue('--color-primary'), bg: computed.getPropertyValue('--color-bg-surface'), req: 4.5 },
          { name: 'primary color as text on bg-subtle', fg: computed.getPropertyValue('--color-primary'), bg: computed.getPropertyValue('--color-bg-subtle'), req: 4.5 },
        ];

        const themeRes = [];
        pairs.forEach(p => {
          const c1 = parseColor(p.fg);
          const c2 = parseColor(p.bg);
          if (c1 && c2) {
            const ratio = Math.round(getContrastRatio(c1, c2) * 100) / 100;
            const pass = ratio >= p.req;
            themeRes.push({
              name: p.name,
              fg: p.fg.trim(),
              bg: p.bg.trim(),
              ratio,
              required: p.req,
              pass
            });
          }
        });

        // Also check actual rendered elements on page
        const elementChecks = [];
        const checkEls = [
          { name: 'btn-primary', el: document.querySelector('.btn-primary') },
          { name: 'btn-secondary', el: document.querySelector('.btn-secondary') },
          { name: 'nav-tab active', el: document.querySelector('.nav-tab.active') },
          { name: 'pill-item active', el: document.querySelector('.pill-item.active') },
          { name: 'tab-trigger active', el: document.querySelector('.tab-trigger.active') },
          { name: 'pills-label', el: document.querySelector('.pills-label') },
          { name: 'subgroup-header', el: document.querySelector('.subgroup-header') },
        ].filter(i => Boolean(i.el));

        checkEls.forEach(item => {
          const style = window.getComputedStyle(item.el);
          const fg = parseColor(style.color);
          let bg = parseColor(style.backgroundColor);
          if (!bg || (style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent')) {
            // Find parent bg
            let parent = item.el.parentElement;
            while (parent) {
              const pStyle = window.getComputedStyle(parent);
              if (pStyle.backgroundColor && pStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && pStyle.backgroundColor !== 'transparent') {
                bg = parseColor(pStyle.backgroundColor);
                break;
              }
              parent = parent.parentElement;
            }
          }
          if (fg && bg) {
            const ratio = Math.round(getContrastRatio(fg, bg) * 100) / 100;
            elementChecks.push({
              name: item.name,
              color: style.color,
              bgColor: style.backgroundColor,
              ratio,
              pass: ratio >= 4.5
            });
          }
        });

        results[theme] = {
          tokens: themeRes,
          elements: elementChecks
        };
      });

      return results;
    })()`);

    console.log('Contrast audit results:', JSON.stringify(contrastAudit, null, 2));

    // Analyze contrast failures
    for (const [theme, data] of Object.entries(contrastAudit)) {
      const failingTokens = data.tokens.filter(t => !t.pass);
      const failingElements = data.elements.filter(e => !e.pass);
      if (failingTokens.length > 0 || failingElements.length > 0) {
        findings.push({
          area: `WCAG Contrast in ${theme.toUpperCase()} theme`,
          issue: `Found contrast failures below 4.5:1 in ${theme} theme`,
          failingTokens,
          failingElements
        });
      }
    }

    // -------------------------------------------------------------------------
    // TEST 6: Dual Theme Toggle Functional Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing Dual Theme Toggle Functional Integration ---');
    await cdp.navigate(baseUrl);

    const themeToggleTest = await cdp.evaluate(`(() => {
      const results = {};
      const btn = document.getElementById('themeToggleBtn');
      if (!btn) return { hasBtn: false };

      // Read initial theme
      results.initialTheme = document.documentElement.getAttribute('data-theme');
      results.initialStorage = localStorage.getItem('studio_theme');

      // Click button
      btn.click();
      results.after1ClickTheme = document.documentElement.getAttribute('data-theme');
      results.after1ClickStorage = localStorage.getItem('studio_theme');
      results.after1ClickIcon = btn.innerHTML.includes('svg');

      // Click button again
      btn.click();
      results.after2ClickTheme = document.documentElement.getAttribute('data-theme');
      results.after2ClickStorage = localStorage.getItem('studio_theme');

      // Stage scannability check in both themes
      document.documentElement.setAttribute('data-theme', 'paper');
      const stagePaper = window.getComputedStyle(document.getElementById('barcodeStage'));
      results.stagePaper = { bg: stagePaper.backgroundColor };

      document.documentElement.setAttribute('data-theme', 'oled');
      const stageOled = window.getComputedStyle(document.getElementById('barcodeStage'));
      results.stageOled = { bg: stageOled.backgroundColor };

      return results;
    })()`);

    console.log('Theme toggle test results:', JSON.stringify(themeToggleTest, null, 2));

  } finally {
    await cdp.close();
    await new Promise(r => server.close(r));
  }

  console.log('\n=== SUMMARY OF FINDINGS ===');
  console.log(JSON.stringify(findings, null, 2));
  return findings;
}

runAdversarialFrontendChallenge()
  .then((findings) => {
    console.log(`\nAdversarial challenge completed with ${findings.length} findings.`);
    process.exit(findings.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(2);
  });
