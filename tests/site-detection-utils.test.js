const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const siteDetection = require('../src/site-detection-utils.js');

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
