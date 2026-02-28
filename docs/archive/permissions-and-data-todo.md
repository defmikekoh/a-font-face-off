# AMO Permissions and Data TODO

Last updated: February 28, 2026

## Draft text for AMO listing

### Data collected or processed

This extension processes browsing activity context (current tab URL/origin) to apply user-configured font settings per site.

It also processes user-provided configuration data, including favorite fonts, per-domain settings, and custom font CSS.

If optional cloud sync is enabled, the extension processes sync data and connection credentials/settings needed for the selected backend (Google Drive or WebDAV).

### Why this data is needed

- Apply and restore font settings on a per-site basis
- Save and manage extension configuration
- Synchronize settings across devices when the user explicitly enables sync

### Where data is stored

- Local browser storage (`browser.storage.local`)
- Optional user-selected sync backend:
  - Google Drive (user account)
  - User-configured WebDAV server

### Data sharing

Data is shared only with services required for requested functionality:
- Google Fonts (font/metadata retrieval)
- Google OAuth/Google Drive APIs (only when Google Drive sync is enabled)
- User-configured WebDAV endpoint (only when WebDAV sync is enabled)

No data is sold to data brokers.
No data is used for advertising.

### User controls

Users can:
- Use the extension without enabling sync
- Disconnect sync backends at any time
- Clear local extension data from options
- Uninstall the extension to stop processing

## Internal checklist before submit

- [ ] Ensure AMO "Permissions and Data" answers match `src/manifest.json` `data_collection_permissions`
- [ ] Current manifest intent: `required: ["none"]`, `optional: ["browsingActivity", "authenticationInfo", "technicalAndInteraction"]`
- [ ] Verify sync UI requests optional data consent before connect/test/sync actions
- [ ] Verify older Firefox fallback consent prompt is shown before sync/auth actions when built-in data consent API is unavailable
- [ ] Ensure wording matches `PRIVACY.md` exactly (no contradictory claims)
- [ ] Confirm permission rationale text is provided for: `tabs`, `storage`, `alarms`, `webRequest`, `webRequestBlocking`, `http://*/*`, `https://*/*`
- [ ] Re-check screenshots/listing copy for privacy claims

## Paste-ready variants

### Short (~50 words)

This extension processes browsing activity context (URL/origin) to apply per-site font settings. It stores configuration locally (favorites, domain settings, custom font CSS). Optional sync sends this settings data to a user-enabled backend (Google Drive or WebDAV). No advertising SDKs. No sale of personal data.

### Medium (~120 words)

A Font Face-off processes browsing activity context (current tab URL/origin) so it can apply and restore user-selected font settings per site. It stores extension configuration in local browser storage, including favorites, per-domain font settings, and custom font CSS.

Cloud sync is optional. If enabled by the user, sync-related settings/configuration data is transmitted only to the selected sync backend (Google Drive or a user-configured WebDAV server). Google OAuth/Drive APIs are used only for Google Drive sync, and WebDAV requests are sent only to the configured WebDAV endpoint.

The extension does not include advertising SDKs, does not use collected data for advertising, and does not sell personal data to data brokers.

## AMO field-by-field answer map (draft)

Use this as a draft when filling AMO "Permissions and Data." Wording/options can change, so verify the final form labels during submission.

1. Does the extension collect or transmit user data?
- Suggested answer: Yes.
- Suggested note: It processes browsing activity context (URL/origin) for per-site font behavior and may transmit settings data only if optional sync is enabled.

2. What categories of data are collected/processed?
- Suggested categories:
  - Browsing activity (current page URL/origin context)
  - User-provided content/settings (favorites, domain configs, custom CSS, options)
  - Authentication/connection info for optional sync (OAuth tokens or WebDAV config)

3. Is data collection required for core functionality?
- Suggested answer: Core local behavior requires browsing context + local settings storage.
- Suggested note: Cloud transmission is optional and only happens if user enables sync.

4. Is data sold to data brokers?
- Suggested answer: No.

5. Is data used for advertising?
- Suggested answer: No.

6. Is data used for creditworthiness, lending, housing, insurance, education admissions, criminal justice, employment, or healthcare decisions?
- Suggested answer: No.

7. Where is data stored/transmitted?
- Suggested answer:
  - Local: `browser.storage.local`
  - Optional remote: user-selected Google Drive or user-configured WebDAV server
  - Functional resource fetches: Google Fonts endpoints for font/metadata loading

8. Permission rationale text (reviewer-facing)
- `tabs`: identify active tab context and run tab operations used for apply/unapply flows, popup fallback tab creation, and per-tab messaging/CSS injection.
- `storage`: persist user settings/favorites/cache and sync metadata locally.
- `alarms`: periodic optional sync scheduling.
- `webRequest` / `webRequestBlocking`: handle OAuth loopback redirect interception used by Google Drive sync flow.
- `http://*/*` + `https://*/*`: enable site font replacement on normal web pages and allow network access needed for runtime font loading and optional HTTP(S) sync endpoints.
