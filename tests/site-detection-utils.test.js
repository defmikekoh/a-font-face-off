const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const siteDetection = require('../src/site-detection-utils.js');

describe('site-detection-utils ChatGPT content roots', () => {
    it('skips hidden app shells and avoids walking nested main landmarks twice', () => {
        function element(parentElement, display = 'block') {
            return {
                parentElement,
                style: { display, visibility: 'visible' },
                contains(node) {
                    for (; node; node = node.parentElement) if (node === this) return true;
                    return false;
                }
            };
        }
        const body = element(null);
        const hiddenShell = element(body, 'none');
        const hiddenMain = element(hiddenShell);
        const hiddenNestedMain = element(hiddenMain);
        const visibleMain = element(body);
        const visibleNestedMain = element(visibleMain);
        const visibleRoleMain = element(body, 'contents');
        const document = {
            defaultView: { getComputedStyle: node => node.style },
            querySelectorAll: () => [hiddenMain, hiddenNestedMain, visibleMain, visibleNestedMain, visibleRoleMain]
        };

        assert.deepEqual(siteDetection.getVisibleChatGptContentRoots(document), [visibleMain, visibleRoleMain]);
        hiddenShell.style.display = 'block';
        assert.deepEqual(siteDetection.getVisibleChatGptContentRoots(document), [hiddenMain, visibleMain, visibleRoleMain]);
    });
});

describe('site-detection-utils Substack detection', () => {
    it('detects Substack from page-level host and URL signals', () => {
        assert.equal(siteDetection.isSubstackPublicationHost('scottsumner.substack.com'), true);
        assert.equal(siteDetection.isSubstackPublicationHost('substack.com'), true);
        assert.equal(siteDetection.isSubstackPublicationHost('not-substack.com'), false);
        assert.equal(
            siteDetection.isSubstackSignals({
                hostname: 'example.com',
                baseUrl: 'https://example.com/post',
                pageUrls: ['https://writer.substack.com/p/post']
            }),
            true
        );
    });

    it('detects Substack-owned script and stylesheet resources without matching arbitrary paths', () => {
        assert.equal(
            siteDetection.isSubstackSignals({
                hostname: 'custom-domain.example',
                resourceUrls: ['https://substackcdn.com/bundle/static/js/main.js']
            }),
            true
        );
        assert.equal(
            siteDetection.isSubstackSignals({
                hostname: 'example.com',
                resourceUrls: ['https://example.com/assets/substack-widget.js']
            }),
            false
        );
    });

    it('detects custom publication domains from Substack resources and publication URLs', () => {
        assert.equal(
            siteDetection.isSubstackSignals({
                hostname: 'publication.example',
                baseUrl: 'https://publication.example/',
                pageUrls: ['https://publication.substack.com/'],
                resourceUrls: []
            }),
            true
        );
        assert.equal(
            siteDetection.isSubstackSignals({
                hostname: 'publication.example',
                resourceUrls: ['https://substackcdn.com/image/fetch/example.png']
            }),
            true
        );
    });

    it('ignores incidental author Substack links in JSON-LD', () => {
        const jsonLd = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            url: 'https://www.makeuseof.com/firefox-alternative-is-browser-switch-i-didnt-expect-to-keep/',
            author: {
                '@type': 'Person',
                url: 'https://www.makeuseof.com/author/manuviraj-godara/',
                description: 'You can also read his work on his Substack.',
                sameAs: ['https://manuviraj.substack.com/']
            },
            publisher: {
                '@type': 'Organization',
                name: 'MakeUseOf',
                url: 'https://www.makeuseof.com'
            }
        });

        assert.equal(siteDetection.jsonLdHasSubstackPageSignal(jsonLd), false);
        assert.equal(
            siteDetection.isSubstackSignals({
                hostname: 'www.makeuseof.com',
                baseUrl: 'https://www.makeuseof.com/firefox-alternative-is-browser-switch-i-didnt-expect-to-keep/',
                pageUrls: ['https://www.makeuseof.com/firefox-alternative-is-browser-switch-i-didnt-expect-to-keep/'],
                jsonLdTexts: [jsonLd]
            }),
            false
        );
    });

    it('uses JSON-LD when Substack is the page or publisher identity', () => {
        const jsonLd = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            url: 'https://scottsumner.substack.com/p/the-odd-disappearance-of-the-business',
            mainEntityOfPage: 'https://scottsumner.substack.com/p/the-odd-disappearance-of-the-business',
            publisher: {
                '@type': 'Organization',
                name: 'The Pursuit of Happiness',
                url: 'https://scottsumner.substack.com'
            }
        });

        assert.equal(siteDetection.jsonLdHasSubstackPageSignal(jsonLd), true);
    });
});
