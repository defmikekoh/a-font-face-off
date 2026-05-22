/* favorites.js — Favorites save/load, popup, edit modal, and drag-reorder.
 *
 * Depends on:
 *   config-utils.js  (normalizeConfig)
 *   css-generators.js (formatAxisValue)
 *   popup.js globals  (savedFavorites, savedFavoritesOrder, currentViewMode,
 *                       getCurrentUIConfig, getEffectiveFontDefinition,
 *                       applyFontConfig, updateBodyButtons,
 *                       updateAllThirdManInButtons, saveExtensionState,
 *                       refreshApplyButtonsDirtyState, showCustomConfirm)
 *
 * In the browser this file is loaded as a plain <script> before popup.js.
 * In Node (test runner) we export pure helpers via module.exports.
 */

// ── Storage ─────────────────────────────────────────────────────────────────

function loadFavoritesFromStorage() {
    return browser.storage.local.get(['affoFavorites', 'affoFavoritesOrder']).then(result => {
        if (!result.affoFavorites) {
            savedFavorites = {};
            savedFavoritesOrder = [];
            return;
        }

        const rawFavorites = result.affoFavorites || {};
        const rawOrder = Array.isArray(result.affoFavoritesOrder) ? result.affoFavoritesOrder : Object.keys(rawFavorites);
        const sanitized = sanitizeFavoritesMapForStorage(rawFavorites);
        const cleanedOrder = rawOrder.filter(name => sanitized.favorites[name] !== undefined);

        savedFavorites = sanitized.favorites;
        savedFavoritesOrder = cleanedOrder;

        if (sanitized.changed || !arraysEqual(rawOrder, cleanedOrder)) {
            return browser.storage.local.set({
                affoFavorites: sanitized.favorites,
                affoFavoritesOrder: cleanedOrder
            });
        }
    }).catch(error => {
        console.error('Error loading favorites:', error);
        savedFavorites = {};
        savedFavoritesOrder = [];
    });
}

function saveFavoritesToStorage() {
    const sanitized = sanitizeFavoritesMapForStorage(savedFavorites);
    savedFavorites = sanitized.favorites;

    // Keep order aligned to existing keys
    const cleaned = savedFavoritesOrder.filter(name => savedFavorites[name] !== undefined);
    savedFavoritesOrder = cleaned;
    return browser.storage.local.set({
        affoFavorites: savedFavorites,
        affoFavoritesOrder: cleaned
    }).catch(error => {
        console.error('Error saving favorites:', error);
    });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Resilient membership check for arrays, Sets, or object maps
function hasInCollection(coll, item) {
    if (!coll) return false;
    if (Array.isArray(coll)) return coll.indexOf(item) !== -1;
    if (typeof coll.has === 'function') return coll.has(item);
    if (typeof coll.includes === 'function') return coll.includes(item);
    if (typeof coll === 'object') return !!coll[item];
    return false;
}

function sanitizeFavoriteConfigForStorage(rawConfig) {
    if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) return null;
    const config = { ...rawConfig };
    if (Object.prototype.hasOwnProperty.call(config, 'fontFaceRule')) {
        delete config.fontFaceRule;
    }
    if (Object.prototype.hasOwnProperty.call(config, 'css2Url')) {
        delete config.css2Url;
    }
    if (Object.prototype.hasOwnProperty.call(config, '_css2Url')) {
        delete config._css2Url;
    }
    return config;
}

function sanitizeFavoritesMapForStorage(rawFavorites) {
    if (!rawFavorites || typeof rawFavorites !== 'object' || Array.isArray(rawFavorites)) {
        return { favorites: {}, changed: !!rawFavorites };
    }
    let changed = false;
    const favorites = {};
    Object.entries(rawFavorites).forEach(([name, rawConfig]) => {
        const sanitized = sanitizeFavoriteConfigForStorage(rawConfig);
        if (!sanitized) {
            changed = true;
            return;
        }
        if (Object.prototype.hasOwnProperty.call(rawConfig, 'fontFaceRule') ||
            Object.prototype.hasOwnProperty.call(rawConfig, 'css2Url') ||
            Object.prototype.hasOwnProperty.call(rawConfig, '_css2Url')) {
            changed = true;
        }
        favorites[name] = sanitized;
    });
    return { favorites, changed };
}

function arraysEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function getOrderedFavoriteNames() {
    return (Array.isArray(savedFavoritesOrder) && savedFavoritesOrder.length)
        ? savedFavoritesOrder.filter(n => savedFavorites[n])
        : Object.keys(savedFavorites);
}

function generateFavoritePreview(config) {
    if (!config) return '';
    const parts = [];

    if (config.fontName) parts.push(config.fontName);
    if (config.fontSize) {
        parts.push(`${config.fontSize}px`);
    }
    if (config.fontWeight) {
        parts.push(`${config.fontWeight}wt`);
    }
    if (config.fontStyle === 'italic') {
        parts.push('italic');
    }
    if (config.fontColor) {
        parts.push(config.fontColor);
    }
    if (config.variableAxes && Object.keys(config.variableAxes).length > 0) {
        const axesCount = Object.keys(config.variableAxes).length;
        parts.push(`${axesCount} axes`);
    }

    return parts.join(' • ');
}

function generateDetailedFavoritePreview(config) {
    if (!config) return 'No configuration';

    const lines = [];
    if (config.fontName) lines.push(`Font: ${config.fontName}`);

    // Always show font size
    if (config.basicControls?.fontSize) {
        lines.push(`Size: ${config.fontSize}px`);
    }
    if (hasInCollection(config && config.activeControls, 'line-height') &&
        config.lineHeight) {
        lines.push(`Line Height: ${config.lineHeight}`);
    }
    if (hasInCollection(config && config.activeControls, 'letter-spacing') &&
        config.letterSpacing != null) {
        lines.push(`Letter Spacing: ${config.letterSpacing}em`);
    }
    if (hasInCollection(config && config.activeControls, 'weight') &&
        config.fontWeight && config.fontWeight !== 400) {
        lines.push(`Weight: ${config.fontWeight}`);
    }
    if (hasInCollection(config && config.activeControls, 'style') &&
        config.fontStyle === 'italic') {
        lines.push('Style: Italic');
    }

    // Only show active variable axes
    if (config.variableAxes && config.activeAxes) {
        const activeAxesEntries = Object.entries(config.variableAxes)
            .filter(([axis, value]) => {
                const fontDef = getEffectiveFontDefinition(config.fontName);
                return hasInCollection(config && config.activeAxes, axis) &&
                       fontDef && fontDef.defaults[axis] !== undefined &&
                       parseFloat(value) !== fontDef.defaults[axis];
            });

        if (activeAxesEntries.length > 0) {
            const axes = activeAxesEntries
                .map(([axis, value]) => `${axis}:${value}`)
                .join(', ');
            lines.push(`Axes: ${axes}`);
        }
    }

    return lines.join('<br>');
}

function normalizeFavoriteSearch(str) {
    return String(str || '').trim().toLowerCase();
}

function favoriteMatchesSearch(name, config, query) {
    const q = normalizeFavoriteSearch(query);
    if (!q) return true;

    const searchable = [
        name,
        config && config.fontName,
        generateFavoritePreview(config),
        generateDetailedFavoritePreview(config).replace(/<br>/g, ' ')
    ].join(' ').toLowerCase();

    return searchable.includes(q);
}

function getSroulettePoolStorageKey(pool) {
    if (pool === 'serif') return 'affoSubstackRouletteSerif';
    if (pool === 'sans') return 'affoSubstackRouletteSans';
    return null;
}

function getValidSroulettePoolInfoFromData(data, pool) {
    const key = getSroulettePoolStorageKey(pool);
    if (!key) return { available: false, count: 0 };
    const names = Array.isArray(data && data[key]) ? data[key] : [];
    const favorites = (data && data.affoFavorites) || {};
    const validNames = names.filter(name => {
        const cfg = favorites[name];
        return !!(cfg && cfg.fontName);
    });
    return {
        available: !!(data && data.affoSubstackRoulette !== false && validNames.length > 0),
        count: validNames.length
    };
}

function getAvailableSrouletteFavoriteEntriesFromData(data) {
    return ['serif', 'sans'].map(pool => {
        const info = getValidSroulettePoolInfoFromData(data, pool);
        if (!info.available) return null;
        return {
            kind: 'sroulette',
            pool,
            name: pool === 'serif' ? 'Sroulette Serif' : 'Sroulette Sans',
            preview: `${info.count} Substack Roulette font${info.count === 1 ? '' : 's'}`
        };
    }).filter(Boolean);
}

function srouletteFavoriteMatchesSearch(entry, query) {
    const q = normalizeFavoriteSearch(query);
    if (!q) return true;
    return [entry && entry.name, entry && entry.preview, 'sroulette', 'substack roulette']
        .join(' ')
        .toLowerCase()
        .includes(q);
}

// ── Config Name & Preview (for Save Modal) ──────────────────────────────────

function generateFontConfigName(position) {
    const config = getCurrentUIConfig(position);
    if (!config) return 'Font Configuration';


    let name = config.fontName;
    const parts = [];

    // Only include font size in name if it's set (not null)
    if (config.fontSize !== null && config.fontSize !== undefined) {
        parts.push(`${config.fontSize}px`);
    }
    if (config.fontWeight) {
        parts.push(`${config.fontWeight}wt`);
    }
    if (config.fontStyle === 'italic') {
        parts.push('italic');
    }
    if (config.lineHeight) {
        parts.push(`${config.lineHeight}lh`);
    }
    if (config.letterSpacing != null) {
        parts.push(`${config.letterSpacing}ls`);
    }
    if (config.fontColor) {
        parts.push('colored');
    }

    // Add variable axes that are active
    if (config.variableAxes && Object.keys(config.variableAxes).length > 0) {
        Object.entries(config.variableAxes).forEach(([axis, value]) => {
            const fontDef = getEffectiveFontDefinition(config.fontName);
            if (fontDef && fontDef.defaults[axis] !== undefined &&
                parseFloat(value) !== fontDef.defaults[axis]) {
                // Abbreviate common axes
                let axisName = axis;
                switch(axis) {
                    case 'wght': axisName = 'wt'; break;
                    case 'wdth': axisName = 'wd'; break;
                    case 'slnt': axisName = 'sl'; break;
                    case 'opsz': axisName = 'opt'; break;
                }
                if (axisName) {
                    parts.push(`${axisName}${value}`);
                }
            }
        });
    }

    // Combine parts with main name
    if (parts.length > 0) {
        name += ` (${parts.join(', ')})`;
    }

    // Truncate if too long
    if (name.length > 50) {
        name = name.substring(0, 47) + '...';
    }

    return name;
}

function generateConfigPreview(position) {
    const config = getCurrentUIConfig(position);
    if (!config) return 'No configuration available';


    const lines = [];
    lines.push(`Font: ${config.fontName}`);

    // Only show font size if it's set (not null)
    if (config.fontSize !== null && config.fontSize !== undefined) {
        lines.push(`Size: ${config.fontSize}px`);
    }
    if (config.lineHeight) {
        lines.push(`Line Height: ${config.lineHeight}`);
    }
    if (config.letterSpacing != null) {
        lines.push(`Letter Spacing: ${config.letterSpacing}em`);
    }
    if (config.fontWeight && config.fontWeight !== 400) {
        lines.push(`Weight: ${config.fontWeight}`);
    }
    if (config.fontStyle === 'italic') {
        lines.push('Style: Italic');
    }
    if (config.fontColor) {
        lines.push(`Color: ${config.fontColor}`);
    }

    // Only show active variable axes
    if (config.variableAxes && Object.keys(config.variableAxes).length > 0) {
        const activeAxesEntries = Object.entries(config.variableAxes)
            .filter(([axis, value]) => {
                const fontDef = getEffectiveFontDefinition(config.fontName);
                return fontDef && fontDef.defaults[axis] !== undefined &&
                       parseFloat(value) !== fontDef.defaults[axis];
            });

        if (activeAxesEntries.length > 0) {
            const axes = activeAxesEntries
                .map(([axis, value]) => `${axis}: ${value}`)
                .join(', ');
            lines.push(`Axes: ${axes}`);
        }
    }

    return lines.join('<br>');
}

// ── Save Modal ──────────────────────────────────────────────────────────────

function showSaveModal(position) {
    if (typeof getCurrentPanelState === 'function' && getCurrentPanelState(position).kind === 'sroulette') {
        return;
    }

    const modal = document.getElementById('save-modal');
    const nameInput = document.getElementById('save-modal-name');
    const configPreview = document.getElementById('save-modal-config');

    // Generate suggested name and preview
    const suggestedName = generateFontConfigName(position);
    const preview = generateConfigPreview(position);

    nameInput.value = suggestedName;
    configPreview.innerHTML = preview;

    // Store the position for when save is clicked
    modal.setAttribute('data-position', position);

    // Show modal
    modal.classList.add('visible');
}

function hideSaveModal() {
    const modal = document.getElementById('save-modal');
    modal.classList.remove('visible');
}

// ── Favorites Popup ─────────────────────────────────────────────────────────

let srouletteFavoritesPopupEntries = [];

function positionSupportsSrouletteFavorite(position) {
    return position === 'body' || position === 'serif' || position === 'sans';
}

async function isActivePageSubstackForFavorites(origin) {
    if (!origin) return false;
    if (String(origin).endsWith('.substack.com')) return true;
    try {
        if (typeof getTargetTabForPopup !== 'function' || typeof AFFOMessaging === 'undefined') return false;
        const tab = await getTargetTabForPopup();
        if (!tab || tab.id == null) return false;
        const response = await AFFOMessaging.sendTabMessage(browser, tab.id, { type: 'affoGetPageInfo' }, {
            ignoreNoReceiver: true
        });
        return !!(response && response.isSubstack);
    } catch (_) {
        return false;
    }
}

async function loadSrouletteFavoritesForPopup(position) {
    if (!positionSupportsSrouletteFavorite(position)) return [];

    const origin = typeof getActiveOrigin === 'function' ? await getActiveOrigin() : null;
    if (!origin || await isActivePageSubstackForFavorites(origin)) return [];

    const data = await browser.storage.local.get([
        'affoSubstackRoulette',
        'affoSubstackRouletteSerif',
        'affoSubstackRouletteSans',
        'affoFavorites'
    ]);
    return getAvailableSrouletteFavoriteEntriesFromData(data);
}

async function showFavoritesPopup(position) {
    console.log('showFavoritesPopup called for position:', position);
    const popup = document.getElementById('favorites-popup');
    const listContainer = document.getElementById('favorites-popup-list');
    const noFavorites = document.getElementById('no-favorites');
    const searchInput = document.getElementById('favorites-search');
    console.log('Favorites popup elements:', {popup, listContainer, noFavorites, searchInput});

    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = () => renderFavoritesPopupList(position, searchInput.value);
    }

    srouletteFavoritesPopupEntries = [];
    try {
        srouletteFavoritesPopupEntries = await loadSrouletteFavoritesForPopup(position);
    } catch (error) {
        console.warn('Could not load Sroulette favorites:', error);
        srouletteFavoritesPopupEntries = [];
    }

    renderFavoritesPopupList(position, '');

    popup.classList.add('visible');
}

function renderFavoritesPopupList(position, query) {
    const listContainer = document.getElementById('favorites-popup-list');
    const noFavorites = document.getElementById('no-favorites');
    if (!listContainer || !noFavorites) return;

    // Check if there are any favorites
    const names = getOrderedFavoriteNames();
    const filteredSrouletteEntries = srouletteFavoritesPopupEntries.filter(entry => srouletteFavoriteMatchesSearch(entry, query));
    const filteredNames = names.filter(name => favoriteMatchesSearch(name, savedFavorites[name], query));
    console.log('savedFavorites:', savedFavorites);
    console.log('savedFavoritesOrder:', savedFavoritesOrder);
    console.log('Favorite names to show:', filteredNames);

    listContainer.innerHTML = '';

    if (names.length === 0 && srouletteFavoritesPopupEntries.length === 0) {
        noFavorites.textContent = 'No saved favorites yet.';
        noFavorites.style.display = 'block';
        listContainer.style.display = 'none';
        return;
    }

    if (filteredNames.length === 0 && filteredSrouletteEntries.length === 0) {
        noFavorites.textContent = 'No favorites match your search.';
        noFavorites.style.display = 'block';
        listContainer.style.display = 'none';
    } else {
        noFavorites.style.display = 'none';
        listContainer.style.display = 'flex';

        filteredSrouletteEntries.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'favorite-item sroulette-favorite-item';
            item.setAttribute('data-position', position);
            item.setAttribute('data-sroulette-pool', entry.pool);

            const info = document.createElement('div');
            info.className = 'favorite-item-info';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'favorite-item-name';
            nameDiv.textContent = entry.name;

            const previewDiv = document.createElement('div');
            previewDiv.className = 'favorite-item-preview';
            previewDiv.textContent = entry.preview;

            info.appendChild(nameDiv);
            info.appendChild(previewDiv);
            item.appendChild(info);

            item.addEventListener('click', async function() {
                const position = this.getAttribute('data-position');
                const pool = this.getAttribute('data-sroulette-pool');
                try {
                    if (typeof markPanelAsSroulette === 'function') {
                        markPanelAsSroulette(position, pool);
                    }
                    if (position === 'body') {
                        await updateBodyButtons();
                    } else if (currentViewMode === 'third-man-in') {
                        await updateAllThirdManInButtons(position);
                    }
                } catch (error) {
                    console.error('Error loading Sroulette favorite:', error);
                } finally {
                    hideFavoritesPopup();
                }
            });

            listContainer.appendChild(item);
        });

        // Populate favorites in saved order
        filteredNames.forEach(name => {
            const config = savedFavorites[name];
            const item = document.createElement('div');
            item.className = 'favorite-item';
            item.setAttribute('data-position', position);
            item.setAttribute('data-favorite-name', name);

            const info = document.createElement('div');
            info.className = 'favorite-item-info';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'favorite-item-name';
            nameDiv.textContent = name;

            const previewDiv = document.createElement('div');
            previewDiv.className = 'favorite-item-preview';
            previewDiv.textContent = generateFavoritePreview(config);

            info.appendChild(nameDiv);
            info.appendChild(previewDiv);
            item.appendChild(info);

            // Click to load
            item.addEventListener('click', async function() {
                const position = this.getAttribute('data-position');
                const favoriteName = this.getAttribute('data-favorite-name');
                const rawConfig = savedFavorites[favoriteName];
                console.log('Loading favorite - raw config:', JSON.stringify(rawConfig, null, 2));
                const config = normalizeConfig(rawConfig);
                console.log('Loading favorite - processed config:', JSON.stringify(config, null, 2));

                if (config) {
                    try {
                        // Apply font config and wait for completion
                        await applyFontConfig(position, config);
                        console.log(`Favorite loaded and applied for ${position}`);

                        // Update Apply button visibility after loading favorite (now that control groups are updated)
                        if (position === 'body') {
                            await updateBodyButtons();
                        } else if (currentViewMode === 'third-man-in') {
                            await updateAllThirdManInButtons();
                        } else if (currentViewMode === 'faceoff') {
                            saveExtensionState();
                            try {
                                refreshApplyButtonsDirtyState();
                            } catch (_) {}
                        }

                        // Only hide popup after everything is complete
                        hideFavoritesPopup();
                    } catch (error) {
                        console.error('Error loading favorite:', error);
                        hideFavoritesPopup(); // Hide popup even on error
                    }
                }
            });

            listContainer.appendChild(item);
        });
    }
}

function hideFavoritesPopup() {
    const popup = document.getElementById('favorites-popup');
    const searchInput = document.getElementById('favorites-search');
    if (searchInput) searchInput.value = '';
    srouletteFavoritesPopupEntries = [];
    popup.classList.remove('visible');
}

// ── Edit Favorites Modal ────────────────────────────────────────────────────

function showEditFavoritesModal() {
    const modal = document.getElementById('edit-favorites-modal');
    const searchInput = document.getElementById('edit-favorites-search');

    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = () => renderEditFavoritesList(searchInput.value);
    }

    renderEditFavoritesList('');

    modal.classList.add('visible');
}

function renderEditFavoritesList(query) {
    const listContainer = document.getElementById('edit-favorites-list');
    const noFavorites = document.getElementById('no-edit-favorites');
    if (!listContainer || !noFavorites) return;

    // Clear existing content
    listContainer.innerHTML = '';

    // Check if there are any favorites
    const names = getOrderedFavoriteNames();
    const filteredNames = names.filter(name => favoriteMatchesSearch(name, savedFavorites[name], query));
    const isFiltering = normalizeFavoriteSearch(query).length > 0;

    if (names.length === 0) {
        noFavorites.textContent = 'No saved favorites to edit.';
        noFavorites.style.display = 'block';
        listContainer.style.display = 'none';
    } else if (filteredNames.length === 0) {
        noFavorites.textContent = 'No favorites match your search.';
        noFavorites.style.display = 'block';
        listContainer.style.display = 'none';
    } else {
        noFavorites.style.display = 'none';
        listContainer.style.display = 'flex';

        // Populate editable favorites in saved order
        filteredNames.forEach(name => {
            const config = savedFavorites[name];
            const item = document.createElement('div');
            item.className = 'edit-favorite-item';
            item.setAttribute('data-name', name);

            // Drag handle
            const drag = document.createElement('div');
            drag.className = 'drag-handle';
            drag.setAttribute('title', isFiltering ? 'Clear search to reorder' : 'Drag to reorder');
            drag.textContent = '⋮⋮';
            // Only allow drag when dragging the handle
            drag.addEventListener('mousedown', function() {
                if (!isFiltering) item.setAttribute('draggable', 'true');
            });
            drag.addEventListener('touchstart', function() {
                if (!isFiltering) item.setAttribute('draggable', 'true');
            }, { passive: true });
            const disableDrag = () => item.removeAttribute('draggable');
            drag.addEventListener('mouseup', disableDrag);
            drag.addEventListener('touchend', disableDrag);
            if (isFiltering) {
                drag.classList.add('drag-handle-disabled');
            }

            const info = document.createElement('div');
            info.className = 'edit-favorite-info';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'edit-favorite-name';
            nameDiv.textContent = name;

            const previewDiv = document.createElement('div');
            previewDiv.className = 'edit-favorite-preview';
            previewDiv.innerHTML = generateDetailedFavoritePreview(config);

            item.appendChild(drag);
            info.appendChild(nameDiv);
            info.appendChild(previewDiv);

            const actions = document.createElement('div');
            actions.className = 'edit-favorite-actions';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-favorite-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = `Delete ${name}`;
            deleteBtn.addEventListener('click', function() {
                showCustomConfirm(`Are you sure you want to delete "${name}"?`).then(confirmed => {
                    if (confirmed) {
                        delete savedFavorites[name];
                        if (Array.isArray(savedFavoritesOrder)) {
                            const i = savedFavoritesOrder.indexOf(name);
                            if (i !== -1) savedFavoritesOrder.splice(i, 1);
                        }
                        saveFavoritesToStorage();
                        const searchInput = document.getElementById('edit-favorites-search');
                        renderEditFavoritesList(searchInput ? searchInput.value : '');
                    }
                });
            });

            actions.appendChild(deleteBtn);

            item.appendChild(info);
            item.appendChild(actions);
            listContainer.appendChild(item);
        });
        // Enable drag-and-drop reordering
        if (!isFiltering) {
            enableFavoritesReorder(listContainer);
        }
    }
}

function hideEditFavoritesModal() {
    const modal = document.getElementById('edit-favorites-modal');
    const searchInput = document.getElementById('edit-favorites-search');
    if (searchInput) searchInput.value = '';
    modal.classList.remove('visible');
}

// ── Drag-and-Drop Reordering ────────────────────────────────────────────────

function enableFavoritesReorder(container) {
    if (!container) return;

    // Get all drag handles for event listeners
    const dragHandles = container.querySelectorAll('.drag-handle');
    let dropIndicator = null;
    let autoScrollInterval = null;
    function ensureIndicator() {
        if (!dropIndicator) {
            dropIndicator = document.createElement('div');
            dropIndicator.className = 'drop-indicator';
        }
        if (!dropIndicator.parentNode) container.appendChild(dropIndicator);
        return dropIndicator;
    }
    function hideIndicator() {
        if (dropIndicator && dropIndicator.parentNode) dropIndicator.parentNode.removeChild(dropIndicator);
    }
    let currentMouseY = 0;
    function startAutoScroll(clientY) {
        currentMouseY = clientY;
        if (autoScrollInterval) return;

        // Find the actually scrollable container once
        let scrollContainer = container;
        if (container.scrollHeight <= container.clientHeight) {
            let parent = container.parentElement;
            while (parent && parent.scrollHeight <= parent.clientHeight && parent !== document.body) {
                parent = parent.parentElement;
            }
            if (parent && parent.scrollHeight > parent.clientHeight) {
                scrollContainer = parent;
            }
        }

        autoScrollInterval = setInterval(() => {
            // Use the scroll container's rect for zone calculations so scroll-up
            // triggers correctly even when the list extends above the visible area
            const scrollRect = scrollContainer.getBoundingClientRect();
            const scrollZone = 200;
            const maxScrollSpeed = 200;

            const shouldScrollUp = currentMouseY <= scrollRect.top + scrollZone;
            const shouldScrollDown = currentMouseY >= scrollRect.bottom - scrollZone;

            if (shouldScrollUp && scrollContainer.scrollTop > 0) {
                let scrollSpeed;
                if (currentMouseY < scrollRect.top) {
                    scrollSpeed = maxScrollSpeed;
                } else {
                    const distanceFromTop = currentMouseY - scrollRect.top;
                    const normalizedDistance = Math.min(distanceFromTop / scrollZone, 1);
                    scrollSpeed = Math.max(30, maxScrollSpeed * (1 - normalizedDistance));
                }
                scrollContainer.scrollBy({ top: -scrollSpeed / 15, behavior: 'auto' });
            } else if (shouldScrollDown && scrollContainer.scrollTop < scrollContainer.scrollHeight - scrollContainer.clientHeight) {
                let scrollSpeed;
                if (currentMouseY > scrollRect.bottom) {
                    scrollSpeed = maxScrollSpeed;
                } else {
                    const distanceFromBottom = scrollRect.bottom - currentMouseY;
                    const normalizedDistance = Math.min(distanceFromBottom / scrollZone, 1);
                    scrollSpeed = Math.max(30, maxScrollSpeed * (1 - normalizedDistance));
                }
                scrollContainer.scrollBy({ top: scrollSpeed / 15, behavior: 'auto' });
            }
        }, 16); // ~60fps for smooth scrolling
    }
    function updateAutoScroll(clientY) {
        currentMouseY = clientY;
    }
    function stopAutoScroll() {
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
    }
    // Get favorite items for HTML5 drag events
    const favoriteItems = container.querySelectorAll('.edit-favorite-item');
    favoriteItems.forEach(item => {
        // Desktop HTML5 DnD
        item.addEventListener('dragstart', (_e) => {
            item.classList.add('dragging');
            ensureIndicator();
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            item.removeAttribute('draggable');
            persistFavoritesOrder(container);
            hideIndicator();
            stopAutoScroll();
        });
    });
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const after = getDragAfterElement(container, e.clientY);
        const dragging = container.querySelector('.dragging');
        if (!dragging) return;

        // Update auto-scroll position and start if needed
        if (!autoScrollInterval) {
            startAutoScroll(e.clientY);
        } else {
            updateAutoScroll(e.clientY);
        }

        // Store the target position for when drop happens, but don't move the item yet
        dragging.dataset.dropAfter = after ? after.dataset.name : '';

        // Only position drop indicator - don't actually move the item during drag
        const ind = ensureIndicator();
        const crect = container.getBoundingClientRect();
        let topPx;
        if (after == null) {
            // Drop at end
            const items = [...container.querySelectorAll('.edit-favorite-item:not(.dragging)')];
            const last = items[items.length - 1];
            const lrect = last ? last.getBoundingClientRect() : null;
            topPx = (lrect ? (lrect.bottom - crect.top + container.scrollTop) : (container.scrollTop + container.scrollHeight));
        } else {
            // Drop before this item
            const arect = after.getBoundingClientRect();
            topPx = (arect.top - crect.top + container.scrollTop);
        }
        ind.style.top = `${Math.max(0, topPx)}px`;
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        const dragging = container.querySelector('.dragging');
        if (!dragging) return;

        // Now actually perform the reorder based on stored drop position
        const dropAfterName = dragging.dataset.dropAfter;
        if (dropAfterName === '') {
            // Drop at end
            container.appendChild(dragging);
        } else {
            // Drop before the specified item
            const after = container.querySelector(`[data-name="${dropAfterName}"]`);
            if (after) {
                container.insertBefore(dragging, after);
            }
        }

        // Clean up
        delete dragging.dataset.dropAfter;
    });

    // Pointer/touch fallback (works on mobile)
    let ptr = { active: false, item: null, container: null };
    let proxy = null;
    let startOffsetY = 0;
    const onPointerMove = (e) => {
        if (!ptr.active || !ptr.container || !ptr.item) return;
        const after = getDragAfterElement(ptr.container, e.clientY);
        const dragging = ptr.item;

        // Update proxy position
        if (proxy) {
            const y = e.clientY - startOffsetY;
            proxy.style.top = `${y}px`;
        }

        // Update auto-scroll position and start if needed
        if (!autoScrollInterval) {
            startAutoScroll(e.clientY);
        } else {
            updateAutoScroll(e.clientY);
        }

        // Store the target position for when drop happens, but don't move the item yet
        dragging.dataset.dropAfter = after ? after.dataset.name : '';

        // Only show indicator - don't actually move the item during drag
        const ind = ensureIndicator();
        const crect = ptr.container.getBoundingClientRect();
        let topPx;
        if (after == null) {
            // Drop at end
            const items = [...ptr.container.querySelectorAll('.edit-favorite-item:not(.dragging)')];
            const last = items[items.length - 1];
            const lrect = last ? last.getBoundingClientRect() : null;
            topPx = (lrect ? (lrect.bottom - crect.top + ptr.container.scrollTop) : (ptr.container.scrollTop + ptr.container.scrollHeight));
        } else {
            // Drop before this item
            const arect = after.getBoundingClientRect();
            topPx = (arect.top - crect.top + ptr.container.scrollTop);
        }
        ind.style.top = `${Math.max(0, topPx)}px`;
    };
    const onPointerUp = (e) => {
        if (!ptr.active) return;
        try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (_) {}

        // Perform the actual reorder based on stored drop position
        const dragging = ptr.item;
        const dropAfterName = dragging.dataset.dropAfter;
        if (dropAfterName !== undefined) {
            if (dropAfterName === '') {
                // Drop at end
                ptr.container.appendChild(dragging);
            } else {
                // Drop before the specified item
                const after = ptr.container.querySelector(`[data-name="${dropAfterName}"]`);
                if (after) {
                    ptr.container.insertBefore(dragging, after);
                }
            }
        }

        // Clean up
        delete dragging.dataset.dropAfter;
        ptr.item.classList.remove('dragging');
        ptr.item.removeAttribute('draggable');
        persistFavoritesOrder(ptr.container);
        if (proxy && proxy.parentNode) proxy.parentNode.removeChild(proxy);
        proxy = null;
        hideIndicator();
        stopAutoScroll();
        ptr = { active: false, item: null, container: null };
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
    };
    dragHandles.forEach(handle => {
        handle.addEventListener('pointerdown', (e) => {
            const item = e.target.closest('.edit-favorite-item');
            if (!item) return;

            // Prevent default browser behavior (text selection, page scroll, etc.)
            e.preventDefault();

            ptr = { active: true, item, container };
            item.classList.add('dragging');
            // Prevent page scroll while dragging
            try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}

            // Create floating proxy of the item for clearer drag feedback
            const rect = item.getBoundingClientRect();
            startOffsetY = e.clientY - rect.top;
            proxy = item.cloneNode(true);
            proxy.classList.add('dragging-proxy');
            proxy.style.width = `${rect.width}px`;
            proxy.style.left = `${rect.left}px`;
            proxy.style.top = `${rect.top}px`;
            document.body.appendChild(proxy);
            ensureIndicator();
            // Attach global listeners
            document.addEventListener('pointermove', onPointerMove, { passive: false });
            document.addEventListener('pointerup', onPointerUp);
            document.addEventListener('pointercancel', onPointerUp);
        }, { passive: false });
    });
}

function getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll('.edit-favorite-item:not(.dragging)')];
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    els.forEach(child => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            closest = { offset, element: child };
        }
    });
    return closest.element;
}

function persistFavoritesOrder(container) {
    const names = Array.from(container.querySelectorAll('.edit-favorite-item'))
        .map(el => el.getAttribute('data-name'))
        .filter(Boolean);
    savedFavoritesOrder = names;
    saveFavoritesToStorage();
}

// ── Exports (Node/test only) ────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        hasInCollection,
        generateFavoritePreview,
        normalizeFavoriteSearch,
        favoriteMatchesSearch,
        getValidSroulettePoolInfoFromData,
        getAvailableSrouletteFavoriteEntriesFromData,
        srouletteFavoriteMatchesSearch,
    };
}
