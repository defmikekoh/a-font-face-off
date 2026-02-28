# Privacy Policy for A Font Face-off

Last updated: February 28, 2026

## Summary

A Font Face-off is a Firefox extension that changes page fonts and offers optional cloud sync.

The extension does not include advertising SDKs, does not profile users for ads, and does not sell personal data.

## Data the extension processes

1. Browsing activity data (URL/origin context)
- Purpose: Apply, save, and restore font settings per site/domain.
- Stored locally: Yes (`browser.storage.local` keys such as `affoApplyMap` and related settings).
- Transmitted off-device: Only when optional sync is enabled by the user.

2. User-provided configuration data
- Examples: Favorite fonts, per-domain font settings, custom font CSS, known serif/sans lists, and related extension options.
- Stored locally: Yes.
- Transmitted off-device: Only when optional sync is enabled.

3. Optional sync credentials and connection settings
- Google Drive OAuth tokens, or WebDAV server URL/credentials entered by the user.
- Stored locally: Yes, for maintaining the sync connection.
- Transmitted off-device: Yes, only to the user-selected sync provider as required for sync operations.

## Optional network requests

The extension can request remote resources needed for functionality:
- Google Fonts CSS/font files
- Google Fonts metadata endpoint
- Google OAuth/Google Drive APIs (if Google Drive sync is enabled)
- User-configured WebDAV endpoint (if WebDAV sync is enabled)

## Data sharing

Data is shared only with services required by user-enabled features:
- Google Fonts for runtime font delivery/metadata
- Google APIs for optional Google Drive sync
- The user's configured WebDAV server for optional WebDAV sync

No data is sold to data brokers. No data is shared for advertising.

## User control

Users can:
- Disable or avoid cloud sync entirely
- Grant or deny optional sync data consent when prompted
- On Firefox versions without built-in data consent APIs, grant or deny a one-time in-extension sync consent prompt
- Disconnect sync backends
- Clear local cache/settings from extension options
- Remove the extension to stop all processing by the extension

## Security and retention

Data is retained in the browser profile until changed/cleared by the user or removed with extension uninstall/profile cleanup. Sync retention is controlled by the user-selected sync backend.
