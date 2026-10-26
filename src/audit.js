import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { summarize } from './report.js';
import { normalizeUrl } from './project.js';

export async function auditPage(url, { launch = () => chromium.launch({headless:true, timeout:timeoutMs}),
  analyze = page => new AxeBuilder({page}).analyze(), signal, timeoutMs = 30000 } = {}) {
  url = normalizeUrl(url);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('Invalid audit timeout');
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('Audit cancelled'));
  signal?.addEventListener('abort', cancel, {once:true});
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new Error(`Audit timed out after ${timeoutMs} ms`)), timeoutMs);
  let browser, context, report, failure, stopWaiting;
  try {
    controller.signal.throwIfAborted();
    // Acquire ownership before checking cancellation so late launch/context results are closed.
    browser = await launch();
    controller.signal.throwIfAborted();
    context = await browser.newContext({acceptDownloads:false, serviceWorkers:'block'});
    controller.signal.throwIfAborted();
    const aborted = new Promise((_, reject) => {
      stopWaiting = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', stopWaiting, {once:true});
      if (controller.signal.aborted) stopWaiting();
    });
    report = await Promise.race([aborted, (async () => {
      const page = await context.newPage();
      const response = await page.goto(url, {waitUntil:'domcontentloaded', timeout:timeoutMs});
      if (!response || !response.ok()) throw new Error(`HTTP navigation failed: ${response?.status() ?? 'no response'}`);
      return summarize(await analyze(page), page.url());
    })()]);
  } catch (error) { failure = error; }
  finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    if (stopWaiting) controller.signal.removeEventListener('abort', stopWaiting);
    for (const resource of [context, browser]) {
      if (!resource) continue;
      try { await resource.close(); } catch (error) { failure ??= error; }
    }
  }
  if (failure) throw failure;
  return report;
}
