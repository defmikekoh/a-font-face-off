const assert = require('node:assert/strict');
const firefox = require('selenium-webdriver/firefox');

async function checkPageInfo(driver, expectedUrl, timeoutMs) {
    const source = await driver.getWindowHandle();
    await driver.setContext(firefox.Context.CHROME);
    let target;
    try {
        // Read the inspected tab ID before the probe tab takes focus.
        target = await driver.executeScript(`
            const policy = WebExtensionPolicy.getByID('a-font-face-off@example.com');
            if (!policy) throw new Error('AFFO is not installed');
            const tabId = window.gBrowser
                ? policy.extension.tabManager.getWrapper(window.gBrowser.selectedTab).id
                : window.tab.id;
            return { tabId, probeUrl: policy.getURL('left-toolbar-iframe.html') };
        `);
    } finally {
        await driver.setContext(firefox.Context.CONTENT);
    }

    // A top-level extension page has tabs.sendMessage even when the site hides the toolbar.
    await driver.switchTo().newWindow('tab');
    try {
        await driver.get(target.probeUrl);
        const reply = await driver.wait(() => driver.executeAsyncScript(function (tabId, done) {
            browser.tabs.sendMessage(tabId, { type: 'affoGetPageInfo' }, { frameId: 0 }).then(
                info => done(info || null),
                error => done({ error: error.message })
            );
        }, target.tabId).then(result => {
            if (result?.error?.includes('Receiving end does not exist')) return false;
            if (result?.error) throw new Error(result.error);
            return result;
        }), timeoutMs, 'No affoGetPageInfo reply from ' + expectedUrl);
        assert.equal(reply.ok, true, 'Content script must acknowledge affoGetPageInfo');
        assert.equal(reply.href, expectedUrl, 'Content script must identify the inspected page');
        return reply;
    } finally {
        await driver.close();
        await driver.switchTo().window(source);
    }
}

module.exports = { checkPageInfo };
