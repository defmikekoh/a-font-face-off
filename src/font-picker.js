/* AFFOFontPicker: private UI state with explicit popup callbacks and live state getters. */
(function(root) {
'use strict';

function create(popup) {
    const favorites = popup.favorites;
    function affoDebugLog() {
        if (globalThis.AFFO_DEBUG === true) console.log.apply(console, arguments);
    }

    function affoDebugWarn() {
        if (globalThis.AFFO_DEBUG === true) console.warn.apply(console, arguments);
    }

    // Initialize Google Fonts selects dynamically
    function getFamiliesFromMetadata(md) {
        if (!md) return [];
        // Google Fonts uses familyMetadataList; fallbacks included for safety
        const list = md.familyMetadataList || md.familyMetadata || md.families || [];
        return list.map(f => (f.family || f.name)).filter(Boolean);
    }

    function getKnownGoogleFamilies() {
        if (typeof popup.gfFamilyList !== 'undefined' && Array.isArray(popup.gfFamilyList) && popup.gfFamilyList.length) {
            return popup.gfFamilyList;
        }
        if (typeof popup.gfMetadata !== 'undefined') return getFamiliesFromMetadata(popup.gfMetadata);
        return [];
    }

    async function initializeGoogleFontsSelects(preferredTop, preferredBottom) {
        try {
            await popup.ensureGfFamilyList();
            await popup.ensureCustomFontsLoaded();
            // Start from Google families
            let families = getKnownGoogleFamilies();
            // Ensure favorites are included
            try { favorites.loadFavoritesFromStorage(); } catch (e) {}
            const favNames = Array.from(new Set(
                Object.values(favorites.getSavedFavorites() || {})
                    .map(cfg => cfg && cfg.fontName)
                    .filter(Boolean)
            ));
            // Merge custom fonts, local fonts, favorites, and Google list
            const set = new Set();
            const combined = [];
            [...popup.CUSTOM_FONTS, ...popup.LOCAL_FONTS, ...favNames, ...families].forEach(name => {
                if (!name) return;
                if (!set.has(name)) { set.add(name); combined.push(name); }
            });
            families = combined.sort((a, b) => a.localeCompare(b));

            // If we failed to get a non-empty list, keep existing options intact
            if (!families || families.length === 0) {
                affoDebugWarn('Google Fonts metadata returned no families; keeping existing dropdown options');
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
            affoDebugWarn('Failed to populate Google Fonts list:', e);
            return false;
        }
    }

    function resolveFamilyCase(name) {
        if (!name) return name;
        const families = getKnownGoogleFamilies();
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

        // Use CUSTOM_FONTS for pinned custom fonts and LOCAL_FONTS for manual
        // desktop-family names that should not fetch Google Fonts.

        let currentPosition = 'top';
        let families = [];
        let renderedSections = [];
        let catalogKey = '';
        let lastQuery = null;

        function normalize(str) { return (str || '').toLowerCase(); }
        function firstLetter(name) {
            const c = (name || '').charAt(0).toUpperCase();
            return c >= 'A' && c <= 'Z' ? c : '#';
        }

        async function open(position) {
            const trigger = document.getElementById(`${position}-font-display`);
            if (trigger && trigger.dataset && trigger.dataset.affoSroulettePool) return;

            currentPosition = position;
            titleEl.textContent = `Select ${popup.getPanelLabel(position)} Font`;
            await popup.ensureCustomFontsLoaded();
            // Build family list (custom pinned + local + google)
            if (typeof popup.gfFamilyList === 'undefined' || !Array.isArray(popup.gfFamilyList) || popup.gfFamilyList.length === 0) {
                try { await popup.ensureGfFamilyList(); } catch (e) { affoDebugWarn('GF family list load failed:', e); }
            }
            // Refresh before caching the catalog for this opening.
            await favorites.loadFavoritesFromStorage();
            const gf = getKnownGoogleFamilies();
            const set = new Set();
            const list = [];
            // Add pinned customs first
            popup.CUSTOM_FONTS.forEach(f => { set.add(f); list.push(f); });
            popup.LOCAL_FONTS.forEach(f => {
                if (!set.has(f)) {
                    set.add(f);
                    list.push(f);
                }
            });
            gf.forEach(f => { if (!set.has(f)) list.push(f); });
            families = list;
            prepareList();
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

        // Build once per catalog/favorites change. Search only toggles rows whose
        // visibility changes; no per-row listeners or repeated name normalization.
        function prepareList() {
            const favNames = Array.from(new Set(Object.values(favorites.getSavedFavorites() || {})
                .map(cfg => cfg && cfg.fontName).filter(Boolean)));
            const nextKey = JSON.stringify([families, favNames, popup.CUSTOM_FONTS, popup.LOCAL_FONTS]);
            if (nextKey === catalogKey) return;
            catalogKey = nextKey;
            lastQuery = null;
            const custom = new Set(popup.CUSTOM_FONTS);
            const local = new Set(popup.LOCAL_FONTS);
            const favoriteNames = favNames.filter(name => !custom.has(name) && !local.has(name));
            const favoriteSet = new Set(favoriteNames);
            const sections = new Map();
            if (favoriteNames.length) sections.set('Favorites', favoriteNames);
            families.forEach(name => {
                if (favoriteSet.has(name)) return;
                const key = custom.has(name) ? 'Pinned' : local.has(name) ? 'Local' : firstLetter(name);
                if (!sections.has(key)) sections.set(key, []);
                sections.get(key).push(name);
            });
            const order = ['Pinned', 'Local', 'Favorites', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#']
                .filter(key => sections.has(key));
            const listFragment = document.createDocumentFragment();
            const railFragment = document.createDocumentFragment();
            renderedSections = order.map(key => {
                const title = document.createElement('div');
                title.className = 'font-picker-section-title';
                title.textContent = key === 'Pinned' ? 'Custom Fonts' : key === 'Local' ? 'Local Fonts' : key;
                title.id = `fp-section-${key}`;
                listFragment.appendChild(title);
                const items = sections.get(key).map(name => {
                    const node = document.createElement('div');
                    node.className = 'font-picker-item';
                    node.setAttribute('role', 'option');
                    node.textContent = name;
                    listFragment.appendChild(node);
                    return { node, searchName: normalize(name) };
                });
                let letter = null;
                if (key !== 'Pinned' && key !== 'Local' && key !== 'Favorites') {
                    letter = document.createElement('span');
                    letter.className = 'rail-letter';
                    letter.textContent = key;
                    letter.title = `Jump to ${key}`;
                    railFragment.appendChild(letter);
                }
                return { title, items, letter };
            });
            listEl.replaceChildren(listFragment);
            railEl.replaceChildren(railFragment);
        }

        function buildList(query) {
            const q = normalize(query);
            if (q === lastQuery) return;
            lastQuery = q;
            renderedSections.forEach(section => {
                let visible = false;
                section.items.forEach(item => {
                    const hidden = !!q && !item.searchName.includes(q);
                    if (item.node.hidden !== hidden) item.node.hidden = hidden;
                    if (!hidden) visible = true;
                });
                if (section.title.hidden === visible) section.title.hidden = !visible;
                if (section.letter && section.letter.hidden === visible) section.letter.hidden = !visible;
            });
        }

        listEl.addEventListener('click', event => {
            const item = event.target.closest('.font-picker-item');
            if (item && listEl.contains(item) && !item.hidden) selectFont(item.textContent);
        });
        railEl.addEventListener('click', event => {
            const letter = event.target.closest('.rail-letter');
            if (!letter || !railEl.contains(letter) || letter.hidden) return;
            const anchor = document.getElementById(`fp-section-${letter.textContent}`);
            if (anchor && !anchor.hidden) listEl.scrollTop = Math.max(0, anchor.offsetTop);
        });

    async function selectFont(name) {
        affoDebugLog(`selectFont: Selecting "${name}" for position "${currentPosition}"`);

        try {
            // Display element is now the source of truth - no need to manage select options
            const displayEl = document.getElementById(`${currentPosition}-font-display`);
            if (displayEl) {
                // Check selector before updating display
                const selectElBefore = document.getElementById(`${currentPosition}-font-select`);
                affoDebugLog(`selectFont: Before updating display, ${currentPosition}-font-select.value = "${selectElBefore ? selectElBefore.value : 'null'}"`);

                displayEl.textContent = name;

                // Check selector immediately after setting display text
                const selectElAfter = document.getElementById(`${currentPosition}-font-select`);
                affoDebugLog(`selectFont: After setting display text, ${currentPosition}-font-select.value = "${selectElAfter ? selectElAfter.value : 'null'}"`);

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
                affoDebugLog(`selectFont: Updated ${currentPosition}-font-display to "${name}"`);
            }

            // For body mode, update preview and buttons after font selection
            if (currentPosition === 'body') {
                // Check selector value right before updateBodyButtons
                const checkEl = document.getElementById('body-font-select');
                affoDebugLog(`selectFont: Right before updateBodyButtons, body-font-select.value = "${checkEl ? checkEl.value : 'null'}"`);

                // Also check what getCurrentUIConfig returns
                const config = popup.getCurrentUIConfig('body');
                affoDebugLog(`selectFont: getCurrentUIConfig('body') returns:`, config);

                // Load font CSS for preview and await completion
                if (name) {
                    await popup.loadFont('body', name, { suppressImmediateApply: true, suppressImmediateSave: false });
                    // Update preview after font is loaded
                    popup.applyFont('body');
                } else {
                    // Update preview immediately if no font to load
                    popup.applyFont('body');
                }

                // Update buttons after font loading completes
                try {
                    await popup.updateBodyButtons();
                } catch (error) {
                    console.error('Error updating body buttons after font selection:', error);
                }
            }

            // For Third Man In mode, update the preview instead of calling applyFont
            if (['serif', 'sans', 'mono'].includes(currentPosition)) {
                // Ensure font name heading is updated for Third Man In mode BEFORE loadFont
                const fontNameDisplayElement = document.getElementById(`${currentPosition}-font-name`);
                if (fontNameDisplayElement) {
                    affoDebugLog(`selectFont: Updating ${currentPosition}-font-name from "${fontNameDisplayElement.textContent}" to "${name}"`);
                    // For Default, show the position name (Serif, Sans, Mono) instead of "Default"
                    if (name === 'Default') {
                        fontNameDisplayElement.textContent = currentPosition.charAt(0).toUpperCase() + currentPosition.slice(1);
                    } else {
                        fontNameDisplayElement.textContent = name;
                    }
                    affoDebugLog(`selectFont: After update, ${currentPosition}-font-name.textContent = "${fontNameDisplayElement.textContent}"`);
                } else {
                    console.error(`selectFont: Could not find ${currentPosition}-font-name element!`);
                }

                // Load the font CSS first and await completion
                await popup.loadFont(currentPosition, name, { suppressImmediateApply: true, suppressImmediateSave: false });

                popup.applyFont(currentPosition);

                // Update buttons after operations complete
                try {
                    affoDebugLog(`selectFont: About to call updateAllThirdManInButtons for ${currentPosition}`);
                    await popup.updateAllThirdManInButtons(currentPosition);
                    affoDebugLog(`selectFont: updateAllThirdManInButtons completed for ${currentPosition}`);
                } catch (error) {
                    console.error('Error updating Third Man In buttons after font selection:', error);
                }
            } else {
                // Traditional applyFont for other positions
                await popup.loadFont(currentPosition, name);
            }

            close();


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


    return {
        getFamiliesFromMetadata,
        initializeGoogleFontsSelects,
        resolveFamilyCase,
        setupFontPicker
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { create, ...create({}) };
} else {
    root.AFFOFontPicker = { create };
}
})(globalThis);
