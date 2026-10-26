# Restricted crawling and egress / Rastreo y salida de red

This phase adds optional bounded discovery and a restricted HTTP(S) transport.
It does not complete the product or authorize a public job API. Existing explicit
URL/project behavior is preserved unless `crawl` or `network` is configured.

## Design and boundaries

1. Validate the project before launching browsers. Seeds define exact navigation
   origins; resource origins are explicit. Credentials in URLs are rejected.
2. Create an authenticated proxy on a random loopback port per page audit. Its
   random credential is never forwarded to target servers or saved in reports.
3. Resolve all DNS answers. Reject mixed/special/private answers by default, then
   connect to a selected **numeric IP**, not the hostname. A later lookup that
   rebinds to a private address is rejected. Exact private-origin exceptions are
   trusted operator configuration, never appropriate as arbitrary remote input.
4. Check HTTP and HTTPS CONNECT destinations at this socket boundary. Chromium
   uses the proxy even for loopback; QUIC and non-proxied WebRTC UDP are disabled.
5. Enforce page/request/redirect/transfer/deadline budgets. HTTP redirect responses
   are checked by the proxy. Chromium Fetch response interception checks HTTPS
   redirect responses before following them; relying only on Playwright route
   callbacks was insufficient and a real redirect-loop test caught that error.
6. Context request routing handles origin/method limits; service workers,
   WebSockets, additional-page traffic and observed dedicated workers cannot
   silently yield a clean audit. The final navigation origin is checked again.
7. A blocked resource fails that page audit. Successful pages remain visible and
   failure/truncation returns exit 2. No missing page is reported resolved.

IPv4 special ranges are conservatively denied; IPv6 is limited to global unicast
2000::/3 minus special/transition/documentation ranges. This intentionally denies
some special-purpose addresses even if publicly reachable. Review registries as
part of maintenance. Explicit exceptions can permit private test/intranet origins.
TLS verification remains enabled; no project field disables certificate checks.

The proxy protects the configured HTTP(S) socket paths; it is not a kernel
firewall, proof against Chromium/OS vulnerabilities or a full process/network
sandbox. Resolver infrastructure itself must be trusted. Keep the future UI/API
gated on independent security review and OS-level egress isolation. Protocols not
covered by this implementation, shared-worker/iframe edge cases and hostile-browser
escape scenarios need further adversarial evaluation before that gate is closed.
No broad claim of complete SSRF protection or hostile-page containment is made.

## Limits and coverage

Default crawl: 20 pages (up to 100), depth 2 (0–5), 200 links and 200 requests per
page, 5 redirects per page, 16 MiB of proxied body/TLS payload, 120-second run
deadline and a 30-second page budget. Limits are strictly typed. Redirect controls
include subresources visible to the page interception session and HTTP proxy;
unsupported execution contexts are not a supported coverage claim.

Transfer counts include encrypted tunnel data/handshakes and plain HTTP response
body bytes, not decompressed DOM memory or exact wire overhead. They are not a
process-memory cap. Browser launch/cleanup can add time beyond a page deadline.
Busy pages must reach network idle before their results are accepted.

Breadth-first expansion happens after each complete depth layer, so input/link
order remains deterministic under concurrency. `depth` and `sourceUrl` are saved.
Duplicates, out-of-origin links, unsupported protocols and excluded decoded path
prefixes are counted. Default exclusions cover /logout, /signout and /delete.
Explicit seeds are operator-authorized even if their paths match an exclusion.
GET/HEAD and path exclusions do not guarantee absence of application side effects.

Discovered hash fragments are ignored unless `followFragments` is true; explicit
seed fragments are always preserved. Reaching a declared depth boundary is not
whole-site coverage. Page/link caps and deadlines record truncation, return 2 and
add a CSV coverage warning. JSON is the canonical full record. Snapshots validate
crawl depths and seed/origin scope. Changed crawl/network policy makes pages
incomparable rather than declaring improvements.

## Test environment / Entorno de pruebas

The Codex Windows execution host cannot nest Chromium's internal sandbox (observed
launch failure, exit 2147483651). Production restricted mode requests that sandbox
and does not retry with it disabled. Local browser transport/crawl tests therefore
use **tests/helpers/outer-sandbox.js** only when the test environment explicitly
sets ACCESSPILOT_TEST_OUTER_SANDBOX=1. Production code never reads this variable.
That adapter changes the test launch; it is not evidence that production sandbox
startup passed on this host. A separate test checks the production launch contract
and failure-without-retry behavior.

Reproduce transport tests inside this same already-isolated host:
```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '..\browsers'
$env:ACCESSPILOT_TEST_OUTER_SANDBOX = '1'
npm test
```
Normal machines and CI run `npm test` **without** that test marker, exercising the
actual Chromium sandbox. Any unsupported OS must fail visibly; there is no product
switch or automatic unsafe fallback. Check the new CI commit before claiming full
platform support for restricted mode.

The public TLS fixture certificate/key in tests/fixtures is not secret and is
trusted only inside the explicit TLS tests. It is never a product trust anchor.
No external site is needed for the controlled tests.

## Primary references (consulted 2026-10-26)

- [Playwright networking](https://playwright.dev/docs/network) and
  [BrowserContext routing](https://playwright.dev/docs/api/class-browsercontext):
  context-level routing, proxies and service-worker caveats.
- [Chrome DevTools Fetch protocol](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/):
  pausing and failing a redirect response before continuation.
- [Node net](https://nodejs.org/api/net.html): numeric socket destinations, address
  validation and subnet checks; implementation uses APIs present in Node 22.12+.
- [IANA IPv4 special registry](https://www.iana.org/assignments/iana-ipv4-special-registry/)
  and [IPv6 special registry](https://www.iana.org/assignments/iana-ipv6-special-registry/):
  conservative range classification, not a claim that every special address is private.

Español: se han implementado límites y controles de salida, con pruebas locales
controladas. El adaptador de pruebas no demuestra que el sandbox interno arranque
en este entorno. El modo de producto conserva ese requisito. No se expone ninguna
API ni interfaz de trabajos hasta cerrar los controles de aislamiento y revisión
que siguen pendientes.


## Ubuntu CI namespace policy

The first native Ubuntu 24.04 CI run failed with `No usable sandbox` because
AppArmor blocked Chromium's user namespaces (132 passing, 13 failing tests).
The CI workflow now loads a generated AppArmor profile for the **exact installed
Chromium executable paths**, permitting `userns` for those paths only. It does not
disable Chromium sandboxing or change the system-wide namespace restriction.
This follows the selective profile approach in
[Chromium's AppArmor guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md).
The generator rejects out-of-cache paths, wildcards and policy-injection characters.
It runs only on Linux GitHub Actions and requires the runner's administrator to
load the profile. A user-writable browser executable still needs supply-chain
trust: this is CI setup, not a new containment proof or an automatic installation
step on user machines. The rerun must establish whether it works in that runner.
