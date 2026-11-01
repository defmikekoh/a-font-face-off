# Cloud Sync Architecture (background.js)

## Overview

Cloud sync covers `custom-fonts.css`, domain settings (`affoApplyMap` + per-origin metadata, including per-domain Sroulette on/off intent), favorites (`affoFavorites`, `affoFavoritesOrder`), aggressive domains, ignore-comments domains, Block JavaScript domains, Substack Roulette beige disabled domains, preserved fonts, and Substack roulette settings (enabled flag, serif/sans pools, brightness/beige behavior).

## Backend Interface

- `gdriveBackend` / `webdavBackend` objects with `init()`, `isConfigured()`, `get()`, `put()`, `remove()`
- One active at a time: `affoSyncBackend` storage key = `'gdrive'` | `'webdav'`
- `runSync({ mode })` is backend-agnostic, uses `getActiveBackend()` to select, and supports one-shot `merge`, `push`, and `pull` modes.
- `syncPush()` helper wraps revision checks for both backends (GDrive remote revision, WebDAV ETag when available). Normal merge sync uses optimistic checks; one-shot push intentionally bypasses them to overwrite remote.
- Local revision/content baselines are scoped to the destination in `affoSyncMeta.remoteScope`. Changing the active server/account/folder clears those baselines while preserving local settings and their modification times. An in-flight run cannot save its old destination's metadata after a reset.

## Google Drive

- OAuth uses a tab-based flow with PKCE and a loopback redirect, rather than `identity.launchWebAuthFlow`. Firefox intercepts and cancels the redirect with blocking `webRequest`; Chromium observes it through non-blocking `webRequest` and `tabs.onUpdated`, captures the code, and closes the auth tab. Tokens are stored in `affoGDriveTokens`.
- Quick Pick includes a `Connect Google Drive` action for mobile access. This is useful when a browser does not expose extension options in its menu, as observed in earlier Chromium Canary Android testing.
- If Google rejects the refresh token with `invalid_grant`, the extension clears local tokens, preserves `affoSyncBackend = 'gdrive'`, and stores a local-only reconnect-required state in `affoGDriveAuthStatus` so the Options UI can offer an explicit reconnect flow instead of looking fully disconnected.
- Files stored in a visible "A Font Face-off{suffix}" folder in the user's Google Drive. All synced items are single files in the root folder (no subfolders): `domains.json`, `domains-meta.json`, `favorites.json`, `custom-fonts.css`, `known-serif.json`, `known-sans.json`, `fontface-only-domains.json`, `fontface-only-domains-meta.json`, `inline-apply-domains.json`, `inline-apply-domains-meta.json`, `aggressive-domains.json`, `aggressive-domains-meta.json`, `waitforit-domains.json`, `waitforit-domains-meta.json`, `ignore-comments-domains.json`, `ignore-comments-domains-meta.json`, `block-javascript-domains.json`, `block-javascript-domains-meta.json`, `substack-beige-disabled-domains.json`, `substack-beige-disabled-domains-meta.json`, `preserved-fonts.json`, `substack-roulette.json`.
- `remoteRev` checks via `ensureRemoteRevisionUnchanged`. Version-based revisions are checked strictly, but the current Drive API field selections return timestamp-based revisions, which are treated as weak hints. Drive writes do not provide WebDAV's atomic `If-Match` protection.

## WebDAV

- Basic auth or anonymous, `credentials: 'omit'`, MKCOL for folder
- Uses `affoWebDavFolderSuffix` to choose the remote folder name independently from Google Drive (`A Font Face-off` or `A Font Face-off {suffix}`)
- Set the server URL to the DAV root that answers an authorized `PROPFIND` with `207 Multi-Status`. A human-browsable WebDAVNav URL can return HTML for GET while returning 404 for `PROPFIND`; GET success alone does not validate the sync path. A folder suffix such as `Chrome` creates `A Font Face-off Chrome` when a separate browser namespace is desired.
- Uses a quoted strong `ETag` as `remoteRev` when the server provides one. Weak (`W/`) and malformed ETags are ignored because they cannot satisfy `If-Match` strong comparison.
- WebDAV GETs use `cache: 'no-store'` so revision checks cannot consume a fresh-but-stale browser cache entry.
- Sends `If-Match` on `PUT` when an existing item has a stored strong WebDAV ETag (optimistic concurrency).
- Creates files observed missing using `If-None-Match: *`, including the manifest and per-origin sidecars, so another device's concurrent creation is not overwritten.
- If a successful PUT omits a usable strong ETag, sync performs a cache-bypassing GET. It adopts the returned revision only after verifying that the contents match the uploaded payload. Different contents or a missing file cause conflict recovery. If the server still provides no strong ETag, updates lack atomic revision protection; whole-file content baselines still detect changes visible before an update.
- Whole-file uploads record local-only SHA-256 content baselines (`remoteHash`). On a revision conflict, an already matching desired payload is acknowledged without another PUT; an unchanged baseline permits retry with its freshly read ETag. Changed contents that differ from both are left intact and remain a conflict unless a fresh manifest selects a safe incoming update. Explicit push still intentionally overwrites.

## Bidirectional Merge

- A `sync-manifest.json` tracks modification timestamps for all synced items. The manifest write itself uses optimistic concurrency (`writeRemoteManifest`): on a revision conflict it re-fetches, merges its per-item entries with the latest remote manifest (newest entry wins via `mergeSyncMeta`), and retries. When no expected revision is available, it rechecks existence first. WebDAV additionally guards actual creation with `If-None-Match: *`; an existing file with a weak/missing ETag is not mistaken for an absent file. Drive retains a first-write race. Explicit push/pull force the manifest write.
- Normal sync retries a failed merge at most twice (three attempts total) when all errors permit recovery, re-reading both the manifest and data. Per-origin merges are recomputed using the latest remote state. Whole-file revision conflicts are resolved only when the content baseline or newer remote metadata permits it; otherwise both copies are retained. A local edit during an incoming whole-file write stops recovery for that run, so an ahead-of-local remote clock cannot cause a retry to overwrite the preserved edit. Only the final failure emits a user-facing notification. Push/pull run once rather than reapplying a forced direction over edits made during the request.
- Compares local vs remote timestamps per item; newer version wins for most items.
- If the manifest is missing (`firstSync`), the non-merged "simple" items (favorites, custom-fonts CSS, known serif/sans, preserved fonts, custom-font axes, Substack roulette) only pull remote when local has never been modified (`localModified === 0`). If local has tracked modifications, local is preserved and re-pushed instead of being silently overwritten by a possibly-stale remote file. (Domains and per-origin domain-array settings always merge, so they are unaffected.)
- Domain settings are merged per origin using `domains.json` + `domains-meta.json`. Explicit Sroulette stores only the target (`body`, `serif`, `sans`, or `mono`) and source pool in `affoApplyMap[origin].sroulette`; the random resolved font is intentionally not synced. On Substack, any saved Sroulette intent is a domain setting and suppresses the automatic serif/sans/background/brightness Roulette path.
- `domains-meta.json` stores per-origin `modified` timestamps and deletion tombstones (`deletedAt`); newer origin entry wins.
- Domain-list settings (`fontface-only-domains`, `inline-apply-domains`, `aggressive-domains`, `waitforit-domains`, `ignore-comments-domains`, `block-javascript-domains`, `substack-beige-disabled-domains`) also use per-origin metadata sidecar files with the same tombstone merge strategy.
- Tie-breaker for equal per-origin timestamps prefers remote state to ensure deterministic convergence across devices.
- Whole-file settings share `syncWholeFile()`: favorites, custom CSS, known serif/sans, preserved fonts, custom axes, and Substack Roulette. Values and their local timestamps are read in one storage snapshot. Incoming writes compare the current local values with the snapshot taken before networking; changed values abort that item so edits made during a download are preserved. Domain maps/lists use the same snapshot guard before applying merged values.
- Successful remote revisions and content baselines are saved independently of the local modification timestamp, so a local edit during an upload retains its newer timestamp along with the uploaded revision. Subsequent normal sync can upload that edit without an artificial revision conflict.

## Auto-Sync Triggers

- Domain settings auto-sync from `background.js` when `affoApplyMap` changes; listener updates per-origin metadata in `affoApplyMapMeta` and marks both `domains.json` and `domains-meta.json` modified.
- Domain-list settings auto-sync on list changes by updating per-origin local metadata keys and marking both list file and sidecar metadata file modified.
- Favorites auto-sync when `affoFavorites` or `affoFavoritesOrder` changes. All other synced settings auto-sync on storage change.
- Storage change listener compares `oldValue` vs `newValue` before marking modified (avoids unnecessary syncs).
- Sync's own writes go through `setStorageDuringSync`, which records each changed key's value signature in `syncWrittenSignatures`. The `storage.onChanged` listener consumes matching signatures (`consumeSyncWrite`) and skips those keys, so sync writes are never echoed back as user edits. This is value-matching rather than a "currently writing" flag because the ordering between `storage.local.set()` resolving and `onChanged` firing is not guaranteed.
- Manual sync actions in Advanced Options are `Sync` (normal merge), `Push once to remote` (local wins for one run), and `Pull once to local` (remote wins for one run). The sync source selector can disable sync without deleting stored backend configuration; Google Drive additionally exposes explicit `Authorize` and `Revoke` buttons, while WebDAV is saved/edited through its config form.
- `Pull once to local` replaces pre-pull item timestamps and remote revisions with the pulled metadata so the next normal sync does not re-upload pulled values. Sync metadata mutations caused by concurrent local edits during the pull are preserved.
- `self.addEventListener('online', ...)` triggers sync when connectivity returns (covers wake-from-sleep). `gdriveFetch()` throws when offline to prevent futile requests mid-sync.
- Auto-sync failures emit `affoSyncFailed` runtime messages consumed by the Options page modal. When the stored Google Drive refresh token has been rejected, the modal switches from retry to reconnect.

## Key Functions

`runSync()` (core merge and one-shot direction modes), `gdriveFetch()` (auth + retry wrapper), `ensureAppFolder()`, `scheduleAutoSync()`, `markLocalItemModified()`.
