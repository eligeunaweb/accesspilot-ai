# Security

Do not publish credentials or private scan results in issues. Report security vulnerabilities privately through GitHub's security advisory feature if available. This tool visits and executes scripts from scanned pages; only audit trusted or authorized sites.


## Restricted crawling

Projects that enable `crawl` or `network` use an authenticated loopback egress
proxy and reject private/special destinations by default. Exact private-origin
exceptions are trusted local configuration. These controls do not turn the CLI
into a safe public service or replace an OS firewall and browser/OS updates.
Chromium sandbox support is required for restricted product runs; there is no
fallback switch. Legacy runs without these options retain operator network access.

See [network design and limitations](docs/NETWORK-CRAWLING.md), including the
explicit test-only launcher adapter used in a host that cannot nest Chromium's
sandbox. A passing adapted test is not proof of native sandbox availability.
The certificate/key in tests/fixtures is public test data, never a credential
or a production trust anchor. Proxy passwords are ephemeral and not exported.

Español: las excepciones de red privada solo deben configurarlas operadores de
confianza. No expongas la CLI como servicio para usuarios no confiables. El modo
restringido exige sandbox y falla si el sistema no lo admite. La interfaz/API
queda pendiente de revisión de seguridad y aislamiento de red independiente.
