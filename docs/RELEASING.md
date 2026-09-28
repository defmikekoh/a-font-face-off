# Signed test builds

Both release workflows remain manual (`workflow_dispatch`), with no version input.
They run on Ubuntu 24.04 with Node 24 and commit-pinned GitHub Actions.

| Target | Workflow | Rolling release | Signed filename |
| --- | --- | --- | --- |
| Firefox | `.github/workflows/xpi-prerelease.yml` | `firefox-test-latest` | `a-font-face-off-<version>.xpi` |
| Chromium | `.github/workflows/chromium-crx-prerelease.yml` | `chromium-test-latest` | `a-font-face-off-chromium-mv3-<version>.crx` |

Required secrets are checked before dependency installation. Both workflows need
`GDRIVE_CLIENT_ID` and `GDRIVE_CLIENT_SECRET`; Firefox also needs `AMO_JWT_ISSUER`
and `AMO_JWT_SECRET`, while Chromium needs `CHROMIUM_CRX_PRIVATE_KEY_PEM`.
The Drive configuration is generated with JSON escaping. The CRX key retains the
extension ID and is removed in an always-run cleanup step.

Both workflows run ESLint, actionlint, and Node tests before packaging. Firefox
builds `web-ext-artifacts/affo-firefox.zip`, extracts it to the known
`ztemp/firefox-signing-source` directory, validates with pinned web-ext 10.6.0,
and submits it to Mozilla for unlisted signing. Chromium uses the hosted runner's
Google Chrome native CRX packer. Signing output is saved as a 30-day Actions
artifact before publication, so it remains recoverable if publishing fails.

## Version reservation and retention

`.github/scripts/prepare-release.cjs` reserves a version before signing using a
`firefox-build/<version>` or `chromium-build/<version>` tag at the source commit.
Each target has an independent counter. It increments beyond the source revision
and retained reservations for the same three-part base. `GITHUB_RUN_NUMBER + 100`
remains a minimum fourth component to preserve historical workflow numbering.
Only the staged manifest changes; there is no version-bump commit.

A rerun reserves a fresh version, including after a signing timeout or failed
publish. Only the five highest reservation tags per target are retained. The new
reservation is created before old tags are pruned, so the highest reserved version
always survives. Do not manually delete retained reservations. Failed attempts
can leave gaps. Release jobs are serialized per target across branches, and older
version bases are rejected after a newer base has been reserved. Chromium versions
are checked against its 65535-per-component limit before reserving.

The rolling prereleases retain their five newest signed packages. Cleanup uses
paginated asset listing and leaves unrelated files alone. Each release has one
`download-qr.png` image, generated locally with the locked `qrcode` dependency.
The release body and Actions summary show the version, source commit, exact package
download link, and QR image. The rolling source tag moves after package publication
succeeds. No external QR service or base64 log dump is used.

## Local workflow validation

- `npm run lint` includes `.github/scripts/*.cjs` as Node scripts.
- `npm run lint:workflows` runs actionlint 1.7.12 against both workflow files.
  Its platform-specific archive is cached under `ztemp/`, checked against a pinned
  SHA-256 digest, and extracted before each run. First use requires network access.
  Supported hosts are Linux x64 and macOS arm64/x64; ShellCheck is also used when
  available on PATH (as it is on the hosted Ubuntu runner).
- `npm test` includes version reservation, retention, configuration escaping, and
  publishing failure-path tests. These tests mock GitHub mutations and never sign
  or publish a release.
