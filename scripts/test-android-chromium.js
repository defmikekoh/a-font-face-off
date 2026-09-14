#!/usr/bin/env node
'use strict';

// Installation and ADB forwarding remain explicit; this never resets a device.
const { runChromiumSmoke } = require('./chromium-smoke');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
runChromiumSmoke({
    endpoint: option('--endpoint', 'http://127.0.0.1:9235'),
    extensionId: option('--extension-id', ''),
    output: option('--out', 'ztemp/android-chromium-test.json'),
}).catch(error => { console.error(error); process.exitCode = 1; });
