#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { By } = require('selenium-webdriver');
const {
    setup,
    teardown,
    openPopup,
    closePopup,
    popupExec,
} = require('../../../tests/selenium-helper');

const ROOT = path.resolve(__dirname, '../../..');
const ZTEMP = path.join(ROOT, 'ztemp');
const DEFAULT_URL = 'https://en.wikipedia.org/wiki/Typography';
const DEFAULT_SELECTORS = ['html', 'body', 'h1', 'p', '#affo-left-toolbar-iframe'];
const TARGETS = new Set(['body', 'serif', 'sans', 'mono']);

function usage() {
    console.log(`Usage: node .agents/skills/desktop-testing/desktop-firefox-inspect.js [options]

Loads web-ext-artifacts/latest.xpi into an isolated Firefox Developer Edition
profile and inspects a target page. Build the XPI first with npm run build:latest.

  --url <url>               Target page (default: ${DEFAULT_URL})
  --apply <target>=<font>   Seed an applied font for the target hostname; repeatable
  --storage-json <json>     Merge arbitrary browser.storage.local seed values
  --storage-file <path>     Merge storage seed values from a JSON file
  --selector <css>          Inspect a selector; repeatable
  --frame-selector <f>::<e> Inspect an element inside an iframe; repeatable
  --snapshot-at <ms>        Snapshot milliseconds after readiness; repeatable
  --dismiss <css>           Click a page element before snapshots; repeatable
  --dismiss-frame <f>::<e>  Click an element inside an iframe before snapshots
  --dismiss-timeout <ms>    Wait per dismissal target (default: 5000)
  --expect-affo             Fail if the AFFO marker is missing
  --expect-toolbar          Fail if the left toolbar iframe is missing
  --timeout <ms>            Target navigation and script timeout (default: 20000)
  --out <ztemp/file.json>   Write JSON output under ztemp/
  --screenshot <ztemp/file> Write a final screenshot under ztemp/
  --help                    Show this help

Example:
  node .agents/skills/desktop-testing/desktop-firefox-inspect.js \\
    --url https://example.com/article --apply body=Lora --expect-toolbar \\
    --dismiss-frame 'iframe[src*="overlay"]::button[aria-label="Close"]' \\
    --snapshot-at 1000 --snapshot-at 5000 --selector article \\
    --out ztemp/desktop-firefox-inspect.json
`);
}

function valueAfter(argv, index, option) {
    const value = argv[index];
    if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
    return value;
}

function ztempOutput(value, option) {
    const output = path.resolve(ROOT, value);
    const relative = path.relative(ZTEMP, output);
    if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        throw new Error(`${option} must write below ztemp/`);
    }
    return output;
}

function mergeObject(target, next, option) {
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
        throw new Error(`${option} must provide a JSON object`);
    }
    Object.assign(target, next);
}

function parseArgs(argv) {
    const args = {
        url: DEFAULT_URL,
        applies: [],
        storage: {},
        selectors: [],
        frameSelectors: [],
        snapshots: [],
        dismissals: [],
        dismissTimeout: 5000,
        expectAffo: false,
        expectToolbar: false,
        timeout: 20000,
        out: '',
        screenshot: '',
    };
    for (let i = 0; i < argv.length; i += 1) {
        const option = argv[i];
        if (option === '--help' || option === '-h') {
            args.help = true;
        } else if (option === '--url') {
            args.url = valueAfter(argv, ++i, option);
        } else if (option === '--apply') {
            const raw = valueAfter(argv, ++i, option);
            const splitAt = raw.indexOf('=');
            const target = raw.slice(0, splitAt).trim();
            const fontName = raw.slice(splitAt + 1).trim();
            if (splitAt < 1 || !TARGETS.has(target) || !fontName) {
                throw new Error('--apply must use <body|serif|sans|mono>=<font name>');
            }
            args.applies.push({ target, fontName });
        } else if (option === '--storage-json') {
            mergeObject(args.storage, JSON.parse(valueAfter(argv, ++i, option)), option);
        } else if (option === '--storage-file') {
            const input = path.resolve(ROOT, valueAfter(argv, ++i, option));
            mergeObject(args.storage, JSON.parse(fs.readFileSync(input, 'utf8')), option);
        } else if (option === '--selector') {
            args.selectors.push(valueAfter(argv, ++i, option));
        } else if (option === '--frame-selector') {
            const raw = valueAfter(argv, ++i, option);
            const splitAt = raw.indexOf('::');
            const frameSelector = raw.slice(0, splitAt).trim();
            const targetSelector = raw.slice(splitAt + 2).trim();
            if (splitAt < 1 || !frameSelector || !targetSelector) {
                throw new Error('--frame-selector must use <iframe selector>::<element selector>');
            }
            args.frameSelectors.push({ frameSelector, targetSelector });
        } else if (option === '--snapshot-at') {
            const millis = Number(valueAfter(argv, ++i, option));
            if (!Number.isFinite(millis) || millis < 0) {
                throw new Error('--snapshot-at must be zero or a positive number');
            }
            args.snapshots.push(millis);
        } else if (option === '--dismiss') {
            args.dismissals.push({
                type: 'page',
                targetSelector: valueAfter(argv, ++i, option),
            });
        } else if (option === '--dismiss-frame') {
            const raw = valueAfter(argv, ++i, option);
            const splitAt = raw.indexOf('::');
            const frameSelector = raw.slice(0, splitAt).trim();
            const targetSelector = raw.slice(splitAt + 2).trim();
            if (splitAt < 1 || !frameSelector || !targetSelector) {
                throw new Error('--dismiss-frame must use <iframe selector>::<element selector>');
            }
            args.dismissals.push({ type: 'frame', frameSelector, targetSelector });
        } else if (option === '--dismiss-timeout') {
            args.dismissTimeout = Number(valueAfter(argv, ++i, option));
            if (!Number.isFinite(args.dismissTimeout) || args.dismissTimeout <= 0) {
                throw new Error('--dismiss-timeout must be a positive number');
            }
        } else if (option === '--expect-affo') {
            args.expectAffo = true;
        } else if (option === '--expect-toolbar') {
            args.expectToolbar = true;
        } else if (option === '--timeout') {
            args.timeout = Number(valueAfter(argv, ++i, option));
            if (!Number.isFinite(args.timeout) || args.timeout <= 0) {
                throw new Error('--timeout must be a positive number');
            }
        } else if (option === '--out') {
            args.out = ztempOutput(valueAfter(argv, ++i, option), option);
        } else if (option === '--screenshot') {
            args.screenshot = ztempOutput(valueAfter(argv, ++i, option), option);
        } else {
            throw new Error(`Unknown option: ${option}`);
        }
    }
    if (args.help) return args;

    const pageUrl = new URL(args.url);
    if (!/^https?:$/.test(pageUrl.protocol)) throw new Error('--url must use http:// or https://');
    args.hostname = pageUrl.hostname;
    if (!args.selectors.length) args.selectors = DEFAULT_SELECTORS.slice();
    args.snapshots = args.snapshots.length
        ? Array.from(new Set(args.snapshots)).sort((left, right) => left - right)
        : [1000];

    if (args.applies.length) {
        const applyMap = Object.assign({}, args.storage.affoApplyMap || {});
        const domain = Object.assign({}, applyMap[args.hostname] || {});
        for (const apply of args.applies) {
            domain[apply.target] = { fontName: apply.fontName, variableAxes: {} };
        }
        applyMap[args.hostname] = domain;
        args.storage.affoApplyMap = applyMap;
        args.storage.affoToolbarEnabled = true;
    }
    return args;
}

async function seedStorage(driver, storage) {
    if (!Object.keys(storage).length) return null;
    await openPopup(driver);
    try {
        return await popupExec(driver, `
            const seed = ${JSON.stringify(storage)};
            return browser.storage.local.set(seed)
                .then(() => browser.storage.local.get(Object.keys(seed)));
        `);
    } finally {
        await closePopup(driver);
    }
}

async function inspectToolbarFrame(driver) {
    const frames = await driver.findElements(By.css('#affo-left-toolbar-iframe'));
    if (!frames.length) return null;
    await driver.switchTo().frame(frames[0]);
    try {
        return await driver.executeScript(`
            return {
                readyState: document.readyState,
                visibleButtons: Array.from(document.querySelectorAll('.toolbar-button'))
                    .filter(button => {
                        const style = getComputedStyle(button);
                        const rect = button.getBoundingClientRect();
                        return style.display !== 'none' && rect.width > 0 && rect.height > 0;
                    })
                    .map(button => button.id)
            };
        `);
    } finally {
        await driver.switchTo().defaultContent();
    }
}

async function inspectFrameSelectors(driver, requests) {
    const results = [];
    for (const request of requests) {
        const result = Object.assign({}, request);
        try {
            const frames = await driver.findElements(By.css(request.frameSelector));
            result.frameFound = frames.length > 0;
            if (!frames.length) {
                results.push(result);
                continue;
            }
            await driver.switchTo().frame(frames[0]);
            result.element = await driver.executeScript(`
                let element;
                try { element = document.querySelector(arguments[0]); }
                catch (error) { return { error: error.message }; }
                if (!element) return { found: false };
                const rect = element.getBoundingClientRect();
                return {
                    found: true,
                    tagName: element.tagName,
                    id: element.id || '',
                    className: String(element.className || ''),
                    text: (element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
                    ariaLabel: element.getAttribute('aria-label') || '',
                    title: element.getAttribute('title') || '',
                    role: element.getAttribute('role') || '',
                    type: element.getAttribute('type') || '',
                    href: element.getAttribute('href') || '',
                    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                    outerHTML: element.outerHTML.slice(0, 400)
                };
            `, request.targetSelector);
        } catch (error) {
            result.error = error.message;
        } finally {
            await driver.switchTo().defaultContent();
        }
        results.push(result);
    }
    return results;
}

async function snapshot(driver, selectors, frameSelectors, elapsedMs) {
    const page = await driver.executeScript(`
        function inspect(selector) {
            let element;
            try { element = document.querySelector(selector); }
            catch (error) { return { selector, error: error.message }; }
            if (!element) return { selector, found: false };
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return {
                selector,
                found: true,
                tagName: element.tagName,
                id: element.id || '',
                className: String(element.className || ''),
                text: (element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
                dataAffoFontType: element.getAttribute('data-affo-font-type'),
                style: {
                    display: style.display,
                    visibility: style.visibility,
                    opacity: style.opacity,
                    position: style.position,
                    zIndex: style.zIndex,
                    width: style.width,
                    height: style.height,
                    fontFamily: style.fontFamily,
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    lineHeight: style.lineHeight
                },
                rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                inlineStyle: element.getAttribute('style') || ''
            };
        }
        const toolbar = document.getElementById('affo-left-toolbar-iframe');
        return {
            url: location.href,
            title: document.title,
            readyState: document.readyState,
            userAgent: navigator.userAgent,
            touchEligible: /Mobile|Tablet|Android/i.test(navigator.userAgent) ||
                'ontouchstart' in window || navigator.maxTouchPoints > 0,
            affoBase: document.documentElement.getAttribute('data-affo-base'),
            markedCount: document.querySelectorAll('[data-affo-font-type]').length,
            toolbarFound: !!toolbar,
            unhideFound: !!document.getElementById('affo-unhide-icon'),
            selectors: arguments[0].map(inspect)
        };
    `, selectors);
    return {
        elapsedMs,
        capturedAt: new Date().toISOString(),
        page,
        toolbarFrame: await inspectToolbarFrame(driver),
        framedSelectors: await inspectFrameSelectors(driver, frameSelectors),
    };
}

async function collectSnapshots(driver, args) {
    const collected = [];
    const started = Date.now();
    for (const requestedMs of args.snapshots) {
        const remaining = requestedMs - (Date.now() - started);
        if (remaining > 0) await driver.sleep(remaining);
        collected.push(await snapshot(driver, args.selectors, args.frameSelectors, requestedMs));
    }
    return collected;
}

async function waitForElement(driver, selector, timeout) {
    return driver.wait(async () => {
        const elements = await driver.findElements(By.css(selector));
        return elements[0] || false;
    }, timeout);
}

async function performDismissals(driver, args) {
    const results = [];
    for (const requested of args.dismissals) {
        const result = Object.assign({ clicked: false }, requested);
        try {
            if (requested.type === 'frame') {
                const frame = await waitForElement(driver, requested.frameSelector, args.dismissTimeout);
                await driver.switchTo().frame(frame);
            }
            const element = await waitForElement(driver, requested.targetSelector, args.dismissTimeout);
            await element.click();
            result.clicked = true;
        } catch (error) {
            result.error = error.message;
        } finally {
            await driver.switchTo().defaultContent();
        }
        results.push(result);
    }
    return results;
}

async function navigateToTarget(driver, args) {
    const navigation = { completed: true };
    await driver.manage().setTimeouts({ pageLoad: args.timeout, script: args.timeout });
    try {
        await driver.get(args.url);
    } catch (error) {
        navigation.completed = false;
        navigation.error = error.message;
        try {
            await driver.executeScript('window.stop();');
            navigation.stoppedForInspection = true;
        } catch (stopError) {
            navigation.stopError = stopError.message;
            throw error;
        }
    }
    navigation.actualUrl = await driver.getCurrentUrl();
    return navigation;
}

function writeReport(report, output) {
    const text = JSON.stringify(report, null, 2) + '\n';
    if (!output) return console.log(text);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, text);
    console.log(`Wrote ${output}`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) return usage();
    const report = {
        requested: {
            url: args.url,
            hostname: args.hostname,
            applies: args.applies,
            storageKeys: Object.keys(args.storage),
            selectors: args.selectors,
            frameSelectors: args.frameSelectors,
            snapshots: args.snapshots,
            dismissals: args.dismissals,
            dismissTimeout: args.dismissTimeout,
            timeout: args.timeout,
        },
        capturedAt: new Date().toISOString(),
        results: [],
    };
    let driver;
    let profileDir;
    try {
        ({ driver, profileDir } = await setup({ pageLoadStrategy: 'eager' }));
        report.storage = await seedStorage(driver, args.storage);
        report.navigation = await navigateToTarget(driver, args);
        report.dismissals = await performDismissals(driver, args);
        report.results = await collectSnapshots(driver, args);
        const final = report.results[report.results.length - 1].page;
        if (args.expectAffo && !final.affoBase) throw new Error('AFFO marker was not found.');
        if (args.expectToolbar && !final.toolbarFound) throw new Error('AFFO toolbar iframe was not found.');
        if (args.screenshot) {
            fs.mkdirSync(path.dirname(args.screenshot), { recursive: true });
            fs.writeFileSync(args.screenshot, await driver.takeScreenshot(), 'base64');
            report.screenshot = args.screenshot;
        }
    } catch (error) {
        report.error = error.message;
        report.stack = error.stack;
        process.exitCode = 1;
    } finally {
        await teardown(driver, profileDir);
    }
    writeReport(report, args.out);
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
