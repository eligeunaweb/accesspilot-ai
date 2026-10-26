import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { summarize } from './report.js';

// Each audit owns an isolated browser context. Never share page state across projects.
export async function auditPage(url, { launch = () => chromium.launch({headless:true}),
  analyze = page => new AxeBuilder({page}).analyze() } = {}) {
  let browser;
  let context;
  let report;
  let failure;
  try {
    browser = await launch();
    context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto(url, {waitUntil:'domcontentloaded', timeout:30000});
    if (!response || !response.ok()) {
      throw new Error(`HTTP navigation failed: ${response?.status() ?? 'no response'}`);
    }
    report = summarize(await analyze(page), page.url());
  } catch (error) {
    failure = error;
  } finally {
    // A context cleanup failure must never prevent browser cleanup.
    for (const resource of [context, browser]) {
      if (!resource) continue;
      try { await resource.close(); }
      catch (error) { failure ??= error; }
    }
  }
  if (failure) throw failure;
  return report;
}
