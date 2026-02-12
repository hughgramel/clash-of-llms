import { test, expect } from './fixtures.js';
import { createMockLLMServer } from './helpers/mock-llm-server.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.join(__dirname, 'screenshots');

let mockServer;

test.beforeAll(async () => {
  mockServer = await createMockLLMServer(3457);
});

test.afterAll(async () => {
  if (mockServer) {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test('mock LLM pages load in iframes', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  // Override iframe sources to mock server
  await page.evaluate(() => {
    document.getElementById('left-iframe').src = 'http://localhost:3457/mock-chatgpt';
    document.getElementById('right-iframe').src = 'http://localhost:3457/mock-claude';
  });

  // Wait for iframes to load
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(screenshotDir, '10-mock-iframes-loaded.png'), fullPage: true });

  // Verify left iframe loaded ChatGPT mock
  const leftFrame = page.frameLocator('#left-iframe');
  await expect(leftFrame.locator('#prompt-textarea')).toBeVisible({ timeout: 10000 });

  // Verify right iframe loaded Claude mock
  const rightFrame = page.frameLocator('#right-iframe');
  await expect(rightFrame.locator('.ProseMirror')).toBeVisible({ timeout: 10000 });

  await page.screenshot({ path: path.join(screenshotDir, '11-mock-inputs-visible.png'), fullPage: true });
  await page.close();
});

test('can type and send message in mock ChatGPT iframe', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  // Load mock
  await page.evaluate(() => {
    document.getElementById('left-iframe').src = 'http://localhost:3457/mock-chatgpt';
  });
  await page.waitForTimeout(2000);

  const frame = page.frameLocator('#left-iframe');

  // Type into input
  const input = frame.locator('#prompt-textarea');
  await input.click();
  await input.fill('Test message about AI');

  await page.screenshot({ path: path.join(screenshotDir, '12-chatgpt-typed.png'), fullPage: true });

  // Click send
  await frame.locator('[data-testid="send-button"]').click();

  // Wait for response
  await page.waitForTimeout(3000);

  // Verify response appeared
  const responses = frame.locator('[data-message-author-role="assistant"]');
  await expect(responses.first()).toBeVisible({ timeout: 10000 });

  const responseText = await responses.first().innerText();
  expect(responseText.length).toBeGreaterThan(0);

  await page.screenshot({ path: path.join(screenshotDir, '13-chatgpt-response.png'), fullPage: true });
  await page.close();
});

test('can type and send message in mock Claude iframe', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  // Load mock
  await page.evaluate(() => {
    document.getElementById('right-iframe').src = 'http://localhost:3457/mock-claude';
  });
  await page.waitForTimeout(2000);

  const frame = page.frameLocator('#right-iframe');

  // Type into ProseMirror input
  const input = frame.locator('.ProseMirror');
  await input.click();
  await input.fill('Test debate argument');

  await page.screenshot({ path: path.join(screenshotDir, '14-claude-typed.png'), fullPage: true });

  // Click send
  await frame.locator('[aria-label="Send Message"]').click();

  // Wait for response
  await page.waitForTimeout(3000);

  // Verify response appeared in proper .font-claude-response structure
  const responseContainer = frame.locator('div[data-is-streaming]');
  await expect(responseContainer.first()).toBeVisible({ timeout: 10000 });

  // Verify the .font-claude-response-body has content
  const responseBody = frame.locator('.font-claude-response-body');
  await expect(responseBody.first()).toBeVisible({ timeout: 10000 });

  const responseText = await responseBody.first().innerText();
  expect(responseText.length).toBeGreaterThan(0);

  await page.screenshot({ path: path.join(screenshotDir, '15-claude-response.png'), fullPage: true });
  await page.close();
});

test('Claude mock does not return early - waits for streaming to complete', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  // Load mock
  await page.evaluate(() => {
    document.getElementById('right-iframe').src = 'http://localhost:3457/mock-claude';
  });
  await page.waitForTimeout(2000);

  const frame = page.frameLocator('#right-iframe');

  // Send first message
  const input = frame.locator('.ProseMirror');
  await input.click();
  await input.fill('First argument');
  await frame.locator('[aria-label="Send Message"]').click();

  // Wait for first response to complete (streaming="false")
  await expect(frame.locator('div[data-is-streaming="false"]').first()).toBeVisible({ timeout: 15000 });
  const firstResponseText = await frame.locator('.font-claude-response-body').first().innerText();
  expect(firstResponseText).toContain('compelling counter-argument');

  // Send second message
  await input.click();
  await input.fill('Second argument');
  await frame.locator('[aria-label="Send Message"]').click();

  // While second message is streaming, verify streaming state
  // The new response should appear with data-is-streaming="true"
  await expect(frame.locator('div[data-is-streaming="true"]')).toBeVisible({ timeout: 10000 });

  // Wait for second response to complete
  const streamingDivs = frame.locator('div[data-is-streaming]');
  await expect(streamingDivs).toHaveCount(2, { timeout: 15000 });

  // Wait for the second one to finish streaming
  await expect(frame.locator('div[data-is-streaming="true"]')).toHaveCount(0, { timeout: 15000 });

  // Verify we now have TWO complete response containers
  const allStreamingDivs = frame.locator('div[data-is-streaming="false"]');
  await expect(allStreamingDivs).toHaveCount(2, { timeout: 5000 });

  // Verify the second response body has content
  const responseBodies = frame.locator('.font-claude-response-body');
  const secondResponseText = await responseBodies.nth(1).innerText();
  expect(secondResponseText).toContain('compelling counter-argument');
  expect(secondResponseText.length).toBeGreaterThan(50);

  await page.screenshot({ path: path.join(screenshotDir, '19-claude-multi-response.png'), fullPage: true });
  await page.close();
});

test('ChatGPT mock does not return early with multiple messages', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  // Load mock
  await page.evaluate(() => {
    document.getElementById('left-iframe').src = 'http://localhost:3457/mock-chatgpt';
  });
  await page.waitForTimeout(2000);

  const frame = page.frameLocator('#left-iframe');

  // Send first message
  const input = frame.locator('#prompt-textarea');
  await input.click();
  await input.fill('First ChatGPT argument');
  await frame.locator('[data-testid="send-button"]').click();

  // Wait for first response to complete (stop button removed)
  await expect(frame.locator('[data-testid="stop-button"]')).toHaveCount(0, { timeout: 15000 });
  const firstResponses = frame.locator('[data-message-author-role="assistant"]');
  await expect(firstResponses).toHaveCount(1, { timeout: 5000 });

  // Send second message
  await input.click();
  await input.fill('Second ChatGPT argument');
  await frame.locator('[data-testid="send-button"]').click();

  // Wait for second response
  await expect(frame.locator('[data-testid="stop-button"]')).toHaveCount(0, { timeout: 15000 });
  const allResponses = frame.locator('[data-message-author-role="assistant"]');
  await expect(allResponses).toHaveCount(2, { timeout: 5000 });

  // Verify both responses have distinct content
  const firstText = await allResponses.nth(0).innerText();
  const secondText = await allResponses.nth(1).innerText();
  expect(firstText.length).toBeGreaterThan(50);
  expect(secondText.length).toBeGreaterThan(50);

  await page.screenshot({ path: path.join(screenshotDir, '20-chatgpt-multi-response.png'), fullPage: true });
  await page.close();
});

test('landing page shows start button and transitions to debate view', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/arena/arena.html`);
  await page.waitForLoadState();

  // Verify landing page is visible
  await expect(page.locator('#landing')).toBeVisible();
  await expect(page.locator('#start-btn')).toBeVisible();
  await expect(page.locator('#start-btn')).toContainText('Start Debate');

  // Verify iframes are blank initially
  const leftSrc = await page.locator('#left-iframe').getAttribute('src');
  expect(leftSrc).toBe('about:blank');

  await page.screenshot({ path: path.join(screenshotDir, '16-landing-page.png'), fullPage: true });

  // Enter a topic
  await page.fill('#topic-input', 'Should AI be regulated?');
  await page.fill('#round-limit', '2');

  // Click start - triggers transition
  await page.click('#start-btn');

  // Debate view should become active
  await expect(page.locator('body')).toHaveClass(/debate-active/);

  await page.screenshot({ path: path.join(screenshotDir, '17-debate-started.png'), fullPage: true });
  await page.close();
});
