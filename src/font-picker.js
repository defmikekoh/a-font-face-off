/* font-picker.js — Font picker modal, Google Fonts select initialization,
 * and family resolution.
 *
 * Depends on:
 *   favorites.js      (loadFavoritesFromStorage, savedFavorites)
 *   popup.js globals   (gfMetadata, ensureGfMetadata, ensureCustomFontsLoaded,
 *                        CUSTOM_FONTS, getPanelLabel, loadFont, applyFont,
 *                        getCurrentUIConfig, updateBodyButtons,
 *                        updateAllThirdManInButtons, refreshApplyButtonsDirtyState,
 *                        currentViewMode, saveFontSettings)
 *
 * In the browser this file is loaded as a plain <script> before popup.js.
 * In Node (test runner) we export pure helpers via module.exports.
 */

// Initialize Google Fonts selects dynamically
function getFamiliesFromMetadata(md) {
    if (!md) return [];
    // Google Fonts uses familyMetadataList; fallbacks included for safety
    const list = md.familyMetadataList || md.familyMetadata || md.families || [];
    return list.map(f => (f.family || f.name)).filter(Boolean);
}

async function initializeGoogleFontsSelects(preferredTop, preferredBottom) {
    try {
        await ensureGfMetadata();
        await ensureCustomFontsLoaded();
        // Start from Google families
        let families = getFamiliesFromMetadata(gfMetadata);
        // Ensure favorites are included
        try { loadFavoritesFromStorage(); } catch (e) {}
        const favNames = Array.from(new Set(
            Object.values(savedFavorites || {})
                .map(cfg => cfg && cfg.fontName)
                .filter(Boolean)
        ));
        // Merge custom fonts, favorites, and Google list
        const set = new Set();
        const combined = [];
        [...CUSTOM_FONTS, ...favNames, ...families].forEach(name => {
            if (!name) return;
            if (!set.has(name)) { set.add(name); combined.push(name); }
        });
        families = combined.sort((a, b) => a.localeCompare(b));

        // If we failed to get a non-empty list, keep existing options intact
        if (!families || families.length === 0) {
            console.warn('Google Fonts metadata returned no families; keeping existing dropdown options');
            return;
        }

        const selects = [
            { sel: document.getElementById('top-font-select'), want: preferredTop },
            { sel: document.getElementById('bottom-font-select'), want: preferredBottom }
        ];
        selects.forEach(({ sel, want }) => {
            if (!sel) return;
            const current = sel.value || want || '';
            // Only rebuild if we have a non-empty list
            if (families.length > 0) {
                // Clear existing options
                while (sel.firstChild) sel.removeChild(sel.firstChild);
                // Build options
                families.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    sel.appendChild(opt);
                });
                // Restore selection if present in list, else default to first
                const desired = (want && families.includes(want)) ? want : current;
                if (desired && families.includes(desired)) {
                    sel.value = desired;
                } else if (desired && !families.includes(desired)) {
                    // Preserve a prior custom/current value by adding it explicitly
                    const opt = document.createElement('option');
                    opt.value = desired;
                    opt.textContent = desired;
                    sel.insertBefore(opt, sel.firstChild);
                    sel.value = desired;
                }
            }
        });
        return true;
    } catch (e) {
        console.warn('Failed to populate Google Fonts list:', e);
        return false;
    }
}

function resolveFamilyCase(name) {
    if (!name || !gfMetadata) return name;
    const families = getFamiliesFromMetadata(gfMetadata);
    const lower = String(name).toLowerCase();
    for (const fam of families) {
        if (String(fam).toLowerCase() === lower) return fam;
    }
    return name;
}

// Font Picker Modal implementation
function setupFontPicker() {
    const modal = document.getElementById('font-picker-modal');
    const listEl = document.getElementById('font-picker-list');
    const railEl = document.getElementById('font-picker-rail');
    const searchEl = document.getElementById('font-picker-search');
    const titleEl = document.getElementById('font-picker-title');
    const closeBtn = document.getElementById('font-picker-close');
    const cancelBtn = document.getElementById('font-picker-cancel');
    const topTrigger = document.getElementById('top-font-display');
    const bottomTrigger = document.getElementById('bottom-font-display');
    const bodyTrigger = document.getElementById('body-font-display');
    const serifTrigger = document.getElementById('serif-font-display');
    const sansTrigger = document.getElementById('sans-font-display');
    const monoTrigger = document.getElementById('mono-font-display');

    // Use CUSTOM_FONTS for pinned custom fonts

    let currentPosition = 'top';
    let families = [];
    let sectionOffsets = {};

    function normalize(str) { return (str || '').toLowerCase(); }
    function firstLetter(name) {
        const c = (name || '').charAt(0).toUpperCase();
        return c >= 'A' && c <= 'Z' ? c : '#';
    }

    async function open(position) {
        currentPosition = position;
        titleEl.textContent = `Select ${getPanelLabel(position)} Font`;
        await ensureCustomFontsLoaded();
        // Build family list (custom pinned + google)
        if (!gfMetadata) {
            try { await ensureGfMetadata(); } catch (e) { console.warn('GF metadata load failed:', e); }
        }
        // Ensure favorites are up-to-date
        try { loadFavoritesFromStorage(); } catch (e) {}
        const gf = getFamiliesFromMetadata(gfMetadata);
        const set = new Set();
        const list = [];
        // Add pinned customs first
        CUSTOM_FONTS.forEach(f => { set.add(f); list.push(f); });
        gf.forEach(f => { if (!set.has(f)) list.push(f); });
        families = list;
        searchEl.value = '';
        buildList('');
        modal.classList.add('visible');
        // Reflect expanded state on trigger for accessibility and chevron rotation
        if (position === 'top') {
            topTrigger && topTrigger.setAttribute('aria-expanded', 'true');
        } else {
            bottomTrigger && bottomTrigger.setAttribute('aria-expanded', 'true');
        }
        // Do not autofocus the search input to avoid popping mobile keyboards
        setTimeout(() => { if (closeBtn) closeBtn.focus(); }, 0);
    }

    function close() {
        modal.classList.remove('visible');
        // Reset expanded state on both triggers
        topTrigger && topTrigger.setAttribute('aria-expanded', 'false');
        bottomTrigger && bottomTrigger.setAttribute('aria-expanded', 'false');
    }

    function buildRail(letters) {
        railEl.innerHTML = '';
        letters.forEach(L => {
            const span = document.createElement('span');
            span.className = 'rail-letter';
            span.textContent = L;
            span.title = `Jump to ${L}`;
            span.addEventListener('click', () => {
                const anchor = document.getElementById(`fp-section-${L}`);
                if (!anchor) return;
                // With listEl positioned relative, anchor.offsetTop is relative to listEl
                const top = anchor.offsetTop || 0;
                listEl.scrollTop = Math.max(0, top);
            });
            railEl.appendChild(span);
        });
    }

    function buildList(query) {
        const q = normalize(query);
        const matches = q
            ? families.filter(n => normalize(n).includes(q))
            : families.slice();


        // Group into sections
        listEl.innerHTML = '';
        const sections = new Map();

        // Favorites section: gather unique favorited font names
        const favNames = Array.from(new Set(
            Object.values(savedFavorites || {})
                .map(cfg => cfg && cfg.fontName)
                .filter(Boolean)
        ));
        const favFiltered = favNames
            .filter(n => (q ? normalize(n).includes(q) : true))
            .filter(n => !CUSTOM_FONTS.includes(n)); // avoid duplicate with custom section
        if (favFiltered.length) {
            sections.set('Favorites', favFiltered);
        }

        // Remaining items grouped by letter (Pinned handled as its own key)
        const favSet = new Set(favFiltered);
        const addItem = (name) => {
            const key = CUSTOM_FONTS.includes(name) ? 'Pinned' : firstLetter(name);
            if (favSet.has(name) && key !== 'Pinned') return; // don't duplicate favorites into letters
            if (!sections.has(key)) sections.set(key, []);
            sections.get(key).push(name);
        };
        matches.forEach(addItem);

        // Order: Pinned section (if present), then A-Z, then '#'
        const order = [];
        if (sections.has('Pinned')) order.push('Pinned');
        if (sections.has('Favorites')) order.push('Favorites');
        for (let i=0;i<26;i++) {
            const L = String.fromCharCode(65+i);
            if (sections.has(L)) order.push(L);
        }
        if (sections.has('#')) order.push('#');

        // Build DOM
        order.forEach(key => {
            const title = document.createElement('div');
            title.className = 'font-picker-section-title';
            title.textContent = key === 'Pinned' ? 'Custom Fonts' : key;
            title.id = `fp-section-${key}`;
            listEl.appendChild(title);

            sections.get(key).forEach(name => {
                const item = document.createElement('div');
                item.className = 'font-picker-item';
                item.setAttribute('role', 'option');
                item.textContent = name;
                item.addEventListener('click', () => selectFont(name));
                listEl.appendChild(item);
            });
        });

        // Build rail letters
        const letters = order.filter(k => k !== 'Pinned' && k !== 'Favorites');
        buildRail(letters);

        // Compute offsets after layout
        requestAnimationFrame(() => {
            sectionOffsets = {};
            const listRect = listEl.getBoundingClientRect();
            order.forEach(key => {
                const anchor = document.getElementById(`fp-section-${key}`);
                if (!anchor) return;
                const anchorRect = anchor.getBoundingClientRect();
                const top = anchorRect.top - listRect.top + listEl.scrollTop;
                sectionOffsets[key] = Math.max(0, top);
            });
        });
    }

async function selectFont(name) {
    console.log(`selectFont: Selecting "${name}" for position "${currentPosition}"`);

    try {
        // Display element is now the source of truth - no need to manage select options
        const displayEl = document.getElementById(`${currentPosition}-font-display`);
        if (displayEl) {
            // Check selector before updating display
            const selectElBefore = document.getElementById(`${currentPosition}-font-select`);
            console.log(`selectFont: Before updating display, ${currentPosition}-font-select.value = "${selectElBefore ? selectElBefore.value : 'null'}"`);

            displayEl.textContent = name;

            // Check selector immediately after setting display text
            const selectElAfter = document.getElementById(`${currentPosition}-font-select`);
            console.log(`selectFont: After setting display text, ${currentPosition}-font-select.value = "${selectElAfter ? selectElAfter.value : 'null'}"`);

            // Handle Default vs specific font styling
            if (name === 'Default') {
                displayEl.classList.add('placeholder');
                const group = displayEl.closest('.control-group');
                if (group) group.classList.add('unset');
            } else {
                displayEl.classList.remove('placeholder');
                const group = displayEl.closest('.control-group');
                if (group) group.classList.remove('unset');
            }
            console.log(`selectFont: Updated ${currentPosition}-font-display to "${name}"`);
        }

        // For body mode, update preview and buttons after font selection
        if (currentPosition === 'body') {
            // Check selector value right before updateBodyButtons
            const checkEl = document.getElementById('body-font-select');
            console.log(`selectFont: Right before updateBodyButtons, body-font-select.value = "${checkEl ? checkEl.value : 'null'}"`);

            // Also check what getCurrentUIConfig returns
            const config = getCurrentUIConfig('body');
            console.log(`selectFont: getCurrentUIConfig('body') returns:`, config);

            // Load font CSS for preview and await completion
            if (name) {
                await loadFont('body', name, { suppressImmediateApply: true, suppressImmediateSave: false });
                // Update preview after font is loaded
                applyFont('body');
            } else {
                // Update preview immediately if no font to load
                applyFont('body');
            }

            // Update buttons after font loading completes
            try {
                await updateBodyButtons();
            } catch (error) {
                console.error('Error updating body buttons after font selection:', error);
            }
        }

        // For Third Man In mode, update the preview instead of calling applyFont
        if (['serif', 'sans', 'mono'].includes(currentPosition)) {
            // Ensure font name heading is updated for Third Man In mode BEFORE loadFont
            const fontNameDisplayElement = document.getElementById(`${currentPosition}-font-name`);
            if (fontNameDisplayElement) {
                console.log(`selectFont: Updating ${currentPosition}-font-name from "${fontNameDisplayElement.textContent}" to "${name}"`);
                // For Default, show the position name (Serif, Sans, Mono) instead of "Default"
                if (name === 'Default') {
                    fontNameDisplayElement.textContent = currentPosition.charAt(0).toUpperCase() + currentPosition.slice(1);
                } else {
                    fontNameDisplayElement.textContent = name;
                }
                console.log(`selectFont: After update, ${currentPosition}-font-name.textContent = "${fontNameDisplayElement.textContent}"`);
            } else {
                console.error(`selectFont: Could not find ${currentPosition}-font-name element!`);
            }

            // Load the font CSS first and await completion
            await loadFont(currentPosition, name, { suppressImmediateApply: true, suppressImmediateSave: false });

            applyFont(currentPosition);

            // Update buttons after operations complete
            try {
                console.log(`selectFont: About to call updateAllThirdManInButtons for ${currentPosition}`);
                await updateAllThirdManInButtons(currentPosition);
                console.log(`selectFont: updateAllThirdManInButtons completed for ${currentPosition}`);
            } catch (error) {
                console.error('Error updating Third Man In buttons after font selection:', error);
            }
        } else {
            // Traditional applyFont for other positions
            await loadFont(currentPosition, name);
        }

        close();

        // Reflect Apply/Update state immediately after changing family (Face-off mode only)
        if (currentViewMode === 'faceoff') {
            try {
                refreshApplyButtonsDirtyState();
            } catch (_) {}
        }

    } catch (error) {
        console.error(`Error selecting font ${name} for ${currentPosition}:`, error);
        throw error;
    }
}

    // Listeners
    const triggerOpen = (pos) => () => open(pos);
    topTrigger?.addEventListener('click', triggerOpen('top'));
    bottomTrigger?.addEventListener('click', triggerOpen('bottom'));
    bodyTrigger?.addEventListener('click', triggerOpen('body')); // Body panel uses body position
    serifTrigger?.addEventListener('click', triggerOpen('serif'));
    sansTrigger?.addEventListener('click', triggerOpen('sans'));
    monoTrigger?.addEventListener('click', triggerOpen('mono'));
    topTrigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open('top');
        }
    });
    bottomTrigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open('bottom');
        }
    });
    bodyTrigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open('body'); // Body panel uses body position
        }
    });
    serifTrigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open('serif');
        }
    });
    sansTrigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open('sans');
        }
    });
    monoTrigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open('mono');
        }
    });
    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    searchEl.addEventListener('input', (e) => buildList(e.target.value || ''));

    // Keyboard: Esc closes when modal visible
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('visible')) {
            e.preventDefault();
            close();
        }
    });
}

// ── Exports (Node/test only) ────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getFamiliesFromMetadata,
    };
}
