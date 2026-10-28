import {responseForChromium} from './mediated-response.js';
import { validateJourney, runJourney } from './journey.js';
import { validateSessionState, validateAuthentication } from './session.js';
import { validateNetwork } from './network-policy.js';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { summarize } from './report.js';
import { normalizeUrl } from './url.js';
import { createNetworkPolicy } from './network-policy.js';
import { startEgressProxy } from './egress-proxy.js';
import { validateViewport } from './viewport.js';

export async function auditPage(url, { launch = options => chromium.launch(options),
  analyze = page => new AxeBuilder({page}).analyze(), signal, timeoutMs = 30000, language = 'en', network, scopeUrls = [url], crawl, viewport, authentication, sessionState, journey, mediate } = {}) {
  url = normalizeUrl(url);
  if(mediate!==undefined) {if(typeof mediate!=='function')throw new Error('Invalid request mediator');network=validateNetwork(network);}
  if(journey!==undefined) {journey=validateJourney(journey);network=validateNetwork(network);}
  if(authentication!==undefined) {
    network=validateNetwork(network);
    authentication=validateAuthentication(authentication,scopeUrls,network);
    sessionState=validateSessionState(sessionState,{authentication,urls:scopeUrls,network});
  } else if(sessionState!==undefined) throw new Error('Session state requires authentication');
  if(viewport!==undefined) viewport=validateViewport(viewport);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('Invalid audit timeout');
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('Audit cancelled'));
  signal?.addEventListener('abort', cancel, {once:true});
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new Error(`Audit timed out after ${timeoutMs} ms`)), timeoutMs);
  let browser, context, proxy, report, failure, stopWaiting;
  let requestCount=0,auditPageRef;const blocked=[];
  const deny=reason=>{if(blocked.length<20) blocked.push(reason);};
  try {
    controller.signal.throwIfAborted();
    // Acquire ownership before checking cancellation so late launch/context results are closed.
    const launchOptions={headless:true,timeout:timeoutMs};
    let policy;
    if(network) {
      policy=createNetworkPolicy(scopeUrls,network);
      policy.check(url,true);
      if(!mediate) {proxy=await startEgressProxy(policy,{maxBytes:crawl?.maxBytesPerPage,timeoutMs:Math.min(timeoutMs,10000),maxRedirects:crawl?.maxRedirects,maxRequests:crawl?.maxRequestsPerPage,maxDurationMs:timeoutMs});
      launchOptions.proxy={server:proxy.server,username:proxy.username,password:proxy.password,bypass:'<-loopback>'};}
      launchOptions.chromiumSandbox=true;
      launchOptions.args=['--disable-quic','--dns-prefetch-disable','--force-webrtc-ip-handling-policy=disable_non_proxied_udp'];
    }
    controller.signal.throwIfAborted();
    browser = await launch(launchOptions);
    controller.signal.throwIfAborted();
    context = await browser.newContext({acceptDownloads:false, serviceWorkers:'block',...(sessionState?{storageState:sessionState}:{}),...(viewport?{viewport:{width:viewport.width,height:viewport.height}}:{})});
    controller.signal.throwIfAborted();
    if(policy&&!mediate) {
      await context.route('**/*',async route=>{
        const request=route.request();
        try {
          controller.signal.throwIfAborted();
          if(++requestCount>(crawl?.maxRequestsPerPage ?? 200)) throw new Error('Request budget exceeded');
          if(!['GET','HEAD'].includes(request.method())) throw new Error('Only GET/HEAD requests are allowed');
          policy.check(request.url(),request.isNavigationRequest());
          if(request.frame().page()!==auditPageRef) throw new Error('Additional page traffic is blocked');
          let redirects=0;for(let previous=request.redirectedFrom();previous;previous=previous.redirectedFrom()) redirects++;
          if(redirects>(crawl?.maxRedirects ?? 5)) throw new Error('Redirect budget exceeded');
          await route.continue();
        } catch(error) {deny(error.message);await route.abort().catch(()=>{});}
      });
    }
    if(policy)await context.routeWebSocket('**/*',socket=>{deny('WebSockets are blocked');socket.close();});
    const aborted = new Promise((_, reject) => {
      stopWaiting = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', stopWaiting, {once:true});
      if (controller.signal.aborted) stopWaiting();
    });
    report = await Promise.race([aborted, (async () => {
      const page = await context.newPage();auditPageRef=page;
      if(policy) page.on('worker',()=>{deny('Dedicated workers are not supported in restricted audits');page.close().catch(()=>{});});
      if(mediate) {
        context.on('request',request=>{
          try {
            if(request.frame().page()!==page) {deny('Additional page traffic is blocked');request.frame().page().close().catch(()=>{});}
          } catch {deny('Unattributed page traffic is blocked');}
        });
        page.on('requestfailed',()=>deny('Mediated page resource failed'));
        page.on('framenavigated',frame=>{
          if(frame===page.mainFrame()||frame.url()==='about:blank')return;
          try {if(new URL(frame.url()).origin!==new URL(page.url()).origin)throw new Error('Cross-origin frames are not supported');}
          catch {deny('Unsupported mediated frame');page.close().catch(()=>{});}
        });
        const session=await context.newCDPSession(page),tree=await session.send('Page.getFrameTree');
        const mainFrameId=tree.frameTree.frame.id;let decodedBytes=0;
        await session.send('Network.enable');await session.send('Network.setCacheDisabled',{cacheDisabled:true});
        session.on('Fetch.requestPaused',async event=>{
          try {
            controller.signal.throwIfAborted();
            if(++requestCount>(crawl?.maxRequestsPerPage??200))throw new Error('Request budget exceeded');
            const navigation=event.resourceType==='Document';
            policy.check(event.request.url,navigation);
            if(navigation&&event.frameId!==mainFrameId&&new URL(event.request.url).origin!==new URL(page.url()).origin)throw new Error('Cross-origin frames are not supported');
            const response=await mediate({url:event.request.url,method:event.request.method,headers:event.request.headers,navigation});
            const fulfilled=responseForChromium(response,(crawl?.maxBytesPerPage??16*1024*1024)-decodedBytes);decodedBytes+=fulfilled.decodedBytes;
            const {decodedBytes:unused,...payload}=fulfilled;
            await session.send('Fetch.fulfillRequest',{requestId:event.requestId,...payload});
          } catch(error) {
            deny(error.message);await session.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
          }
        });
        // Fetch request-stage interception includes redirect hops; Playwright route handlers do not.
        await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
      }
      if(policy&&!mediate) {
        const session=await context.newCDPSession(page);let redirects=0;
        session.on('Fetch.requestPaused',async event=>{
          try {
            const location=event.responseHeaders?.find(header=>header.name.toLowerCase()==='location')?.value;
            if(event.responseStatusCode>=300&&event.responseStatusCode<400&&location) {
              if(++redirects>(crawl?.maxRedirects ?? 5)) throw new Error('Redirect budget exceeded');
              policy.check(new URL(location,event.request.url).href,event.resourceType==='Document');
            }
            await session.send('Fetch.continueRequest',{requestId:event.requestId});
          } catch(error) {
            deny(error.message);
            await session.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
          }
        });
        await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Response'}]});
      }
      const response = await page.goto(url, {waitUntil:network?'load':'domcontentloaded', timeout:timeoutMs});
      if (!response || !response.ok()) throw new Error(`HTTP navigation failed: ${response?.status() ?? 'no response'}`);
      if(authentication) {
        try {await page.locator(authentication.readySelector).waitFor({state:'visible',timeout:Math.min(timeoutMs,5000)});}
        catch {throw new Error('Authenticated access marker missing');}
      }
      if(journey) await runJourney(page,journey,{signal:controller.signal,timeoutMs});
      const result=await analyze(page);
      if(network) await page.waitForLoadState('networkidle',{timeout:timeoutMs});
      if(policy) policy.check(page.url(),true);
      if(journey&&!await page.locator(journey.readySelector).isVisible()) throw new Error('Journey checkpoint changed during audit');
      if(authentication&&!await page.locator(authentication.readySelector).isVisible()) throw new Error('Authenticated access changed during audit');
      const evidence=summarize(result,page.url(),{language});
      if(viewport) evidence.viewport=viewport;
      if(journey) evidence.journey=journey;
      if(authentication) evidence.authentication={...authentication};
      if(crawl) evidence.discovery=await page.evaluate(limit=>{
        const elements=document.querySelectorAll('a[href]');const links=[];
        for(let i=0;i<Math.min(elements.length,limit);i++) links.push(elements[i].href);
        return {links,truncated:elements.length>limit};
      },crawl.maxLinksPerPage);
      if(policy) {
        if(blocked.length||proxy?.failures.length) throw new Error('Restricted audit incomplete: '+[...blocked,...(proxy?.failures??[])].join('; '));
        evidence.network={policyVersion:mediate?3:2,requests:requestCount,...(proxy?{transferBytes:proxy.bytes}:{})};
        await page.close();
      }
      return evidence;
    })()]);
  } catch (error) { failure = network&&(blocked.length||proxy?.failures.length) ? new Error('Restricted audit incomplete: '+[...blocked,...(proxy?.failures ?? [])].join('; '),{cause:error}) : error; }
  finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    if (stopWaiting) controller.signal.removeEventListener('abort', stopWaiting);
    for (const resource of [context, browser, proxy]) {
      if (!resource) continue;
      try { await resource.close(); } catch (error) { failure ??= error; }
    }
  }
  if (failure) throw authentication?new Error('Authenticated audit failed; session may be expired, access marker missing or network scope blocked'):failure;
  return report;
}
