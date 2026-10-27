# Third-party notices

`seccomp-profile.json` is copied unchanged from Microsoft Playwright v1.64.1,
https://github.com/microsoft/playwright/blob/v1.64.1/utils/docker/seccomp_profile.json .
Copyright Microsoft Corporation; Apache License 2.0, reproduced in LICENSE-APACHE-2.0.
SHA-256: cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849.
It permits Chromium namespace syscalls on top of the upstream Docker profile.

`apparmor.profile` derives from Moby v28.0.0 profiles/apparmor/template.go,
https://github.com/moby/moby/blob/v28.0.0/profiles/apparmor/template.go .
Copyright 2013-2018 Docker, Inc.; Apache License 2.0 (LICENSE-APACHE-2.0).
Changes: fixed profile name, explicit base imports/daemon peers, added userns.
It retains upstream proc/sys/mount restrictions and does not disable AppArmor globally.

The worker image contains upstream Playwright/browser and operating system packages
under their own licenses, plus axe-core/@axe-core/playwright (MPL-2.0) and
Playwright/playwright-core (Apache-2.0). This is a development acceptance image,
not a published release or a completed redistribution/SBOM review. Preserve upstream
licenses/notices before any redistribution. No proprietary competitor code is used.
