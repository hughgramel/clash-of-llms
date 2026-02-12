import { test, expect } from './fixtures.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.join(__dirname, 'screenshots');

test('popup renders and opens arena in new tab', async ({ context, extensionId }) => {
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  // Verify popup content
  await expect(popupPage.locator('h1')).toContainText('Clash');
  await expect(popupPage.locator('#open-arena-btn')).toBeVisible();

  await popupPage.screenshot({ path: path.join(screenshotDir, '01-popup.png') });

  // Click button and wait for new tab
  const [arenaPage] = await Promise.all([
    context.waitForEvent('page'),
    popupPage.click('#open-arena-btn'),
  ]);

  await arenaPage.waitForLoadState();
  expect(arenaPage.url()).toContain('arena/arena.html');

  await arenaPage.screenshot({ path: path.join(screenshotDir, '02-arena-opened.png'), fullPage: true });
  await popupPage.close();
  await arenaPage.close();
});

test('arena page has correct default selections', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  // Check default LLM selections
  await expect(page.locator('#left-select')).toHaveValue('chatgpt');
  await expect(page.locator('#right-select')).toHaveValue('claude');

  // Check pane labels (in debate view, updated by JS)
  await expect(page.locator('#left-label')).toHaveText('ChatGPT');
  await expect(page.locator('#right-label')).toHaveText('Claude');

  // Landing page should be visible with start button
  await expect(page.locator('#landing')).toBeVisible();
  await expect(page.locator('#start-btn')).toBeVisible();

  await page.screenshot({ path: path.join(screenshotDir, '03-arena-defaults.png'), fullPage: true });
  await page.close();
});

test('dropdown changes update pane labels', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  // Change left pane to Grok
  await page.selectOption('#left-select', 'grok');
  await expect(page.locator('#left-label')).toHaveText('Grok');

  // Change right pane to Gemini
  await page.selectOption('#right-select', 'gemini');
  await expect(page.locator('#right-label')).toHaveText('Gemini');

  await page.screenshot({ path: path.join(screenshotDir, '04-dropdowns-changed.png'), fullPage: true });
  await page.close();
});

test('start button validates topic input', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  // Click start with empty topic
  await page.click('#start-btn');

  // Should not have transitioned to debate view
  await expect(page.locator('body')).not.toHaveClass(/debate-active/);

  // Topic input should get the error class briefly
  await expect(page.locator('#topic-input')).toHaveClass(/error/);

  await page.screenshot({ path: path.join(screenshotDir, '05-empty-topic-validation.png'), fullPage: true });
  await page.close();
});

test('transcript panel toggles open and closed', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  // Initially collapsed
  await expect(page.locator('#transcript-panel')).toHaveClass(/collapsed/);

  // Click to expand
  await page.click('#toggle-transcript');
  await expect(page.locator('#transcript-panel')).toHaveClass(/expanded/);
  await expect(page.locator('#toggle-transcript span')).toHaveText('Hide Transcript');

  await page.screenshot({ path: path.join(screenshotDir, '06-transcript-expanded.png'), fullPage: true });

  // Click to collapse
  await page.click('#toggle-transcript');
  await expect(page.locator('#transcript-panel')).toHaveClass(/collapsed/);
  await expect(page.locator('#toggle-transcript span')).toHaveText('Show Transcript');

  await page.close();
});

test('all five LLMs are available in dropdowns', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  const expectedOptions = ['chatgpt', 'claude', 'grok', 'gemini', 'perplexity'];

  // Check left dropdown
  const leftOptions = await page.locator('#left-select option').evaluateAll(
    (opts) => opts.map((o) => o.value)
  );
  expect(leftOptions).toEqual(expectedOptions);

  // Check right dropdown
  const rightOptions = await page.locator('#right-select option').evaluateAll(
    (opts) => opts.map((o) => o.value)
  );
  expect(rightOptions).toEqual(expectedOptions);

  await page.screenshot({ path: path.join(screenshotDir, '07-all-llms-available.png'), fullPage: true });
  await page.close();
});

test('iframes start as about:blank and load after debate starts', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  // Iframes should start as about:blank (invisible until debate starts)
  const leftSrc = await page.locator('#left-iframe').getAttribute('src');
  const rightSrc = await page.locator('#right-iframe').getAttribute('src');
  expect(leftSrc).toBe('about:blank');
  expect(rightSrc).toBe('about:blank');

  await page.screenshot({ path: path.join(screenshotDir, '08-iframes-blank.png'), fullPage: true });
  await page.close();
});

test('start button has proper styling and text', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  // Start button should display "Start Debate" text
  await expect(page.locator('#start-btn')).toContainText('Start Debate');

  // Start button should have the lightning bolt SVG
  await expect(page.locator('#start-btn svg')).toBeVisible();

  await page.screenshot({ path: path.join(screenshotDir, '09-start-button.png'), fullPage: true });
  await page.close();
});
