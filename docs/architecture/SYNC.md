# Cloud Sync Architecture (background.js)

## Overview

Cloud sync covers `custom-fonts.css`, domain settings (`affoApplyMap`), favorites (`affoFavorites`, `affoFavoritesOrder`), aggressive domains, preserved fonts, and Substack roulette settings.

## Backend Interface

- `gdriveBackend` / `webdavBackend` objects with `init()`, `isConfigured()`, `get()`, `put()`, `remove()`
- One active at a time: `affoSyncBackend` storage key = `'gdrive'` | `'webdav'`
- `runSync()` is backend-agnostic, uses `getActiveBackend()` to select
- `syncPush()` helper wraps revision check (GDrive) or direct put (WebDAV)

## Google Drive

- OAuth via tab-based flow with PKCE (opens tab + intercepts redirect via webRequest; works on both desktop and Android Firefox). Tokens stored in `affoGDriveTokens`.
- Files stored in a visible "A Font Face-off{suffix}" folder in the user's Google Drive. All synced items are single files in the root folder (no subfolders): `domains.json`, `favorites.json`, `custom-fonts.css`, `known-serif.json`, `known-sans.json`, `fontface-only-domains.json`, `inline-apply-domains.json`, `aggressive-domains.json`, `preserved-fonts.json`, `substack-roulette.json`.
- `remoteRev` optimistic concurrency via `ensureRemoteRevisionUnchanged`

## WebDAV

- Basic auth or anonymous, no ETags/remoteRev, `credentials: 'omit'`, MKCOL for folder

## Bidirectional Merge

- A `sync-manifest.json` tracks modification timestamps for all synced items.
- Compares local vs remote timestamps per item; newer version wins. Entire file is atomic (no per-entry merge within a file).
- Domain settings (`affoApplyMap`) are stored as a single `domains.json` file. Any change to any domain marks the whole file as modified.

## Auto-Sync Triggers

- Domain settings auto-sync from `background.js` when `affoApplyMap` changes. Favorites auto-sync when `affoFavorites` or `affoFavoritesOrder` changes. All other synced settings auto-sync on storage change.
- Storage change listener compares `oldValue` vs `newValue` before marking modified (avoids unnecessary syncs).
- Manual sync via "Sync Now" button in Advanced Options. "Clear Local Sync" button resets local sync metadata without disconnecting OAuth.
- `self.addEventListener('online', ...)` triggers sync when connectivity returns (covers wake-from-sleep). `gdriveFetch()` throws when offline to prevent futile requests mid-sync.
- Auto-sync failures emit `affoSyncFailed` runtime messages consumed by Options page modal retry UX.

## Key Functions

`runSync()` (core bidirectional merge), `gdriveFetch()` (auth + retry wrapper), `ensureAppFolder()`, `scheduleAutoSync()`, `markLocalItemModified()`.
