/* global sendMessageToTargetTab, switchMode, getTargetTabForPopup, getActiveOrigin, buildPayload, applyFontConfig */
(() => {
    'use strict';
    const el = id => document.getElementById(id);
    async function page(action, family) {
        const state = await sendMessageToTargetTab({ type: 'affoLineChange', action, family });
        if (state?.error) throw new Error(state.error);
        if (!state) throw new Error('Line Change needs a web page that AFFO can access.');
        return state;
    }
    let scope;
    let mappings = [];
    let highlighted = '';
    let busy = false;
    let selectedSource = '';
    let selectedPool = null;

    function pickPoolConfig(data, pool) {
        const names = Array.isArray(data[ AFFOSroulette.getPoolStorageKey(pool) ]) ? data[ AFFOSroulette.getPoolStorageKey(pool) ] : [];
        const valid = names.map(name => data.affoFavorites && data.affoFavorites[name]).filter(config => config && config.fontName);
        return valid.length ? valid[Math.floor(Math.random() * valid.length)] : null;
    }

    function sourceList() { return el('line-source'); }

    function renderSources(families) {
        const list = sourceList();
        list.replaceChildren(...families.map(name => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'line-source-option';
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(name === selectedSource));
            option.textContent = name;
            option.disabled = busy;
            option.onclick = () => run(async () => {
                selectedSource = name;
                renderSources(families);
                await sourceChanged();
            });
            return option;
        }));
    }

    function setSharedMode(mode) {
        const tab = el('shared-mode-tab');
        tab.dataset.mode = mode;
        tab.textContent = mode === 'line-change' ? 'Line Change' : 'Body Contact';
    }

    function updateButtons() {
        const source = selectedSource;
        sourceList().setAttribute('aria-disabled', String(busy));
        sourceList().querySelectorAll('button').forEach(option => { option.disabled = busy; });
        el('line-source-name').textContent = source || 'Sub out';
        el('line-highlight').disabled = busy || !source;
        el('line-highlight').setAttribute('aria-pressed', String(!!source && highlighted === source));
        el('line-apply').disabled = busy || !source;
    }

    async function run(action) {
        if (busy) return;
        busy = true;
        updateButtons();
        el('line-status').textContent = '';
        try { await action(); }
        catch (error) { el('line-status').textContent = error.message; }
        finally { busy = false; updateButtons(); }
    }

    async function edit(source, target) {
        await navigator.locks.request('affo-line-change-write', async () => {
            if (!scope || scope !== await getActiveOrigin()) throw new Error('The page scope changed. Reopen Line Change.');
            const { affoApplyMap = {} } = await browser.storage.local.get('affoApplyMap');
            const entry = affoApplyMap[scope] || {};
            if (entry.body || entry.serif || entry.sans || entry.mono || entry.sroulette) {
                throw new Error('This scope has other font settings. Reopen the popup to switch modes.');
            }
            const rules = (entry.lineChange || []).filter(rule => rule.source.toLowerCase() !== source.toLowerCase());
            if (target) rules.push({ source, target });
            if (rules.length) entry.lineChange = rules;
            else delete entry.lineChange;
            if (Object.keys(entry).length || scope.includes('/')) affoApplyMap[scope] = entry;
            else delete affoApplyMap[scope];
            await browser.storage.local.set({ affoApplyMap });
        });
        await refresh();
    }

    async function selectSource() {
        const source = selectedSource;
        const rule = mappings.find(item => item.source.toLowerCase() === source.toLowerCase());
        selectedPool = rule?.target?.kind === 'sroulette' ? rule.target.pool : null;
        const display = el('line-font-display');
        if (selectedPool) {
            await selectPool(selectedPool);
            return;
        }
        delete display.dataset.affoSroulettePool;
        await applyFontConfig('line', rule?.target || { fontName: 'Georgia', fontSource: 'local' });
        updateButtons();
    }

    async function selectPool(pool) {
        if (!AFFOSroulette.isPool(pool)) return;
        selectedPool = pool;
        el('line-font-display').textContent = AFFOSroulette.getPoolLabel(pool);
        el('line-font-display').dataset.affoSroulettePool = pool;
        el('line-font-display').classList.remove('placeholder');
        const data = await browser.storage.local.get(['affoSubstackRoulette', 'affoSubstackRouletteSerif', 'affoSubstackRouletteSans', 'affoFavorites']);
        const config = data.affoSubstackRoulette === false ? null : pickPoolConfig(data, pool);
        if (config) await applyFontConfig('line', config);
        el('line-font-display').textContent = AFFOSroulette.getPoolLabel(pool);
        el('line-font-display').dataset.affoSroulettePool = pool;
        updateButtons();
    }

    function clearPool() {
        selectedPool = null;
        delete el('line-font-display').dataset.affoSroulettePool;
    }

    async function refresh() {
        const state = await page('list');
        const selected = selectedSource;
        scope = state.scope;
        mappings = state.rules;
        highlighted = state.highlightFamily;
        el('body-domain-display').textContent = scope;
        const desired = highlighted || selected || state.preferredFamily;
        selectedSource = state.families.includes(desired) ? desired : (state.families[0] || '');
        renderSources(state.families);
        el('line-rules').replaceChildren(...mappings.map(rule => {
            const row = document.createElement('li');
            const remove = document.createElement('button');
            remove.className = 'delete-favorite-btn';
            remove.textContent = '🗑️';
            remove.title = 'Remove substitution for ' + rule.source;
            remove.setAttribute('aria-label', remove.title);
            remove.onclick = () => run(() => edit(rule.source, null));
            row.append(rule.source + ' → ' + (rule.target.kind === 'sroulette' ? AFFOSroulette.getPoolLabel(rule.target.pool) : rule.target.fontName), remove);
            return row;
        }));
        await selectSource();
        if (!mappings.some(item => item.source.toLowerCase() === selectedSource.toLowerCase())) {
            const poolData = await browser.storage.local.get(['affoSubstackRoulette', 'affoSubstackRouletteSerif', 'affoSubstackRouletteSans', 'affoFavorites']);
            if (AFFOSroulette.getValidPoolInfoFromData(poolData, 'serif').available) await selectPool('serif');
        }
        if (!state.families.length) el('line-status').textContent = 'No page text found.';
    }

    function setPanel(active) {
        for (const side of ['in', 'out']) {
            const grip = el('line-' + side + '-grip');
            const open = side === active;
            grip.setAttribute('aria-expanded', String(open));
            grip.classList.toggle('active', open);
            el(grip.getAttribute('aria-controls')).classList.toggle('visible', open);
        }
    }

    async function sourceChanged() {
        await selectSource();
        if (highlighted) highlighted = (await page('select', selectedSource)).highlightFamily;
    }

    function bind() {
        const tab = el('shared-mode-tab');
        let timer;
        let held = false;
        const cancel = () => clearTimeout(timer);
        const alternate = () => switchMode(tab.dataset.mode === 'line-change' ? 'body-contact' : 'line-change');
        tab.addEventListener('pointerdown', event => {
            if (!event.isPrimary || event.button !== 0) return;
            held = false;
            timer = setTimeout(() => { held = true; alternate(); }, 550);
        });
        for (const type of ['pointerup','pointerleave','pointercancel']) tab.addEventListener(type, cancel);
        tab.addEventListener('contextmenu', event => event.preventDefault());
        tab.addEventListener('click', event => {
            if (held && event.detail) { event.stopImmediatePropagation(); held = false; }
        }, true);
        tab.addEventListener('keydown', event => {
            if (event.shiftKey && event.key === 'Enter') { event.preventDefault(); alternate(); }
        });
        for (const side of ['in', 'out']) {
            const grip = el('line-' + side + '-grip');
            grip.onclick = () => setPanel(grip.getAttribute('aria-expanded') === 'true' ? null : side);
        }
        el('line-apply').onclick = () => run(async () => {
            const target = selectedPool ? { kind: 'sroulette', pool: selectedPool } : await buildPayload('line');
            if (!target?.fontName && !(target?.kind === 'sroulette' && AFFOSroulette.isPool(target.pool))) throw new Error('Choose a Sub in font.');
            await edit(selectedSource, target);
        });
        el('line-highlight').onclick = () => run(async () => {
            highlighted = (await page('toggle', selectedSource)).highlightFamily;
            if (highlighted && document.documentElement.classList.contains('affo-mobile')) {
                const tab = await getTargetTabForPopup();
                if (window.sourceTabId && tab) await browser.tabs.update(tab.id, { active:true });
                window.close();
            }
        });
    }

    globalThis.AFFOLineChangePopup = { setSharedMode, bind, selectPool, clearPool, open: () => run(async () => {
        scope = null;
        mappings = [];
        setPanel(null);
        selectedSource = '';
        for (const id of ['line-source','line-rules']) el(id).replaceChildren();
        await refresh();
    }) };
})();
