const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    DEFAULT_DOMAINS,
    CSP_HEADER_NAME,
    CSP_HEADER_VALUE,
    DNR_RULE_ID,
    normalizeDomains,
    matchesHostname,
    buildBlockingResponse,
    buildDynamicRule,
} = require('../src/block-javascript-utils.js');

describe('Block JavaScript domain policy', () => {
    it('uses the actual Deep View domain as the absent-setting default', () => {
        assert.deepEqual(Array.from(DEFAULT_DOMAINS), ['thedeepview.com']);
    });

    it('normalizes, de-duplicates, and sorts configured domains', () => {
        assert.deepEqual(normalizeDomains([
            ' Example.COM. ',
            '*.thedeepview.com',
            'example.com',
            '',
        ]), ['example.com', 'thedeepview.com']);
    });

    it('matches a configured domain and its subdomains without matching suffix lookalikes', () => {
        assert.equal(matchesHostname('thedeepview.com', ['thedeepview.com']), true);
        assert.equal(matchesHostname('www.thedeepview.com', ['thedeepview.com']), true);
        assert.equal(matchesHostname('notthedeepview.com', ['thedeepview.com']), false);
    });

    it('appends an enforcing CSP while preserving existing response headers', () => {
        const existingHeader = { name: 'Cache-Control', value: 'max-age=60' };
        const result = buildBlockingResponse({
            url: 'https://www.thedeepview.com/articles/example',
            responseHeaders: [existingHeader],
        }, ['thedeepview.com']);

        assert.deepEqual(result, {
            responseHeaders: [
                existingHeader,
                { name: CSP_HEADER_NAME, value: CSP_HEADER_VALUE },
            ],
        });
    });

    it('does not modify an unconfigured domain response', () => {
        assert.deepEqual(buildBlockingResponse({
            url: 'https://example.com/',
            responseHeaders: [],
        }, ['thedeepview.com']), {});
    });

    it('respects an explicitly saved empty list', () => {
        assert.deepEqual(buildBlockingResponse({
            url: 'https://www.thedeepview.com/',
            responseHeaders: [],
        }, []), {});
    });

    it('builds an MV3 dynamic response-header rule for the configured domains', () => {
        assert.deepEqual(buildDynamicRule(['TheDeepView.com']), {
            id: DNR_RULE_ID,
            priority: 1,
            action: {
                type: 'modifyHeaders',
                responseHeaders: [{
                    header: CSP_HEADER_NAME,
                    operation: 'append',
                    value: CSP_HEADER_VALUE,
                }],
            },
            condition: {
                requestDomains: ['thedeepview.com'],
                resourceTypes: ['main_frame'],
            },
        });
        assert.equal(buildDynamicRule([]), null);
    });
});
