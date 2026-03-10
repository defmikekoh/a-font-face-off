# Cloud Sync Architecture (background.js)

## Overview

Cloud sync covers `custom-fonts.css`, domain settings (`affoApplyMap` + per-origin metadata), favorites (`affoFavorites`, `affoFavoritesOrder`), aggressive domains, ignore-comments domains, preserved fonts, and Substack roulette settings (enabled flag, serif/sans pools, brightness).

## Backend Interface

- `gdriveBackend` / `webdavBackend` objects with `init()`, `isConfigured()`, `get()`, `put()`, `remove()`
- One active at a time: `affoSyncBackend` storage key = `'gdrive'` | `'webdav'`
- `runSync()` is backend-agnostic, uses `getActiveBackend()` to select
- `syncPush()` helper wraps revision checks for both backends (GDrive remote revision, WebDAV ETag when available)

## Google Drive

- OAuth via tab-based flow with PKCE (opens tab + intercepts redirect via webRequest; works on both desktop and Android Firefox). Tokens stored in `affoGDriveTokens`.
- Files stored in a visible "A Font Face-off{suffix}" folder in the user's Google Drive. All synced items are single files in the root folder (no subfolders): `domains.json`, `domains-meta.json`, `favorites.json`, `custom-fonts.css`, `known-serif.json`, `known-sans.json`, `fontface-only-domains.json`, `fontface-only-domains-meta.json`, `inline-apply-domains.json`, `inline-apply-domains-meta.json`, `aggressive-domains.json`, `aggressive-domains-meta.json`, `waitforit-domains.json`, `waitforit-domains-meta.json`, `ignore-comments-domains.json`, `ignore-comments-domains-meta.json`, `preserved-fonts.json`, `substack-roulette.json`.
- `remoteRev` optimistic concurrency via `ensureRemoteRevisionUnchanged`

## WebDAV

- Basic auth or anonymous, `credentials: 'omit'`, MKCOL for folder
- Uses `ETag` as `remoteRev` when server provides it
- Sends `If-Match` on `PUT` when an existing item has a stored WebDAV ETag (optimistic concurrency)
- If server omits `ETag`, writes continue without optimistic revision protection for that item

## Bidirectional Merge

- A `sync-manifest.json` tracks modification timestamps for all synced items.
- Compares local vs remote timestamps per item; newer version wins for most items.
- Domain settings are merged per origin using `domains.json` + `domains-meta.json`.
- `domains-meta.json` stores per-origin `modified` timestamps and deletion tombstones (`deletedAt`); newer origin entry wins.
- Domain-list settings (`fontface-only-domains`, `inline-apply-domains`, `aggressive-domains`, `waitforit-domains`, `ignore-comments-domains`) also use per-origin metadata sidecar files with the same tombstone merge strategy.
- Tie-breaker for equal per-origin timestamps prefers remote state to ensure deterministic convergence across devices.

## Auto-Sync Triggers

- Domain settings auto-sync from `background.js` when `affoApplyMap` changes; listener updates per-origin metadata in `affoApplyMapMeta` and marks both `domains.json` and `domains-meta.json` modified.
- Domain-list settings auto-sync on list changes by updating per-origin local metadata keys and marking both list file and sidecar metadata file modified.
- Favorites auto-sync when `affoFavorites` or `affoFavoritesOrder` changes. All other synced settings auto-sync on storage change.
- Storage change listener compares `oldValue` vs `newValue` before marking modified (avoids unnecessary syncs).
- Manual sync via "Sync Now" button in Advanced Options. "Clear Local Sync" button resets local sync metadata without disconnecting OAuth.
- `self.addEventListener('online', ...)` triggers sync when connectivity returns (covers wake-from-sleep). `gdriveFetch()` throws when offline to prevent futile requests mid-sync.
- Auto-sync failures emit `affoSyncFailed` runtime messages consumed by Options page modal retry UX.

## Key Functions

`runSync()` (core bidirectional merge), `gdriveFetch()` (auth + retry wrapper), `ensureAppFolder()`, `scheduleAutoSync()`, `markLocalItemModified()`.
