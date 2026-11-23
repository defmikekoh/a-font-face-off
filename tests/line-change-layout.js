/* global document, getComputedStyle */
// Run in the rendered popup in both Firefox and Chromium.
function readLineChangeLayout() {
    const rink = document.getElementById('line-rink');
    const preview = document.getElementById('line-preview-title');
    const rules = document.getElementById('line-substitutions-title');
    const actions = rink.querySelector('.line-actions');
    const divider = rink.querySelector('.blue-line-separator');
    const headingStyle = heading => {
        const css = getComputedStyle(heading);
        return [css.borderBottom, css.paddingTop, css.paddingBottom, css.marginBottom];
    };
    return {
        titles: [...rink.querySelectorAll('section > h3')].map(title => title.textContent),
        headingsMatch: [preview, rules].every(heading =>
            headingStyle(heading).join('|') === headingStyle(document.getElementById('serif-font-name')).join('|')),
        buttonGap: divider.getBoundingClientRect().top - actions.getBoundingClientRect().bottom,
        dividerHeight: divider.getBoundingClientRect().height,
        rulesBelowDivider: rules.getBoundingClientRect().top >= divider.getBoundingClientRect().bottom,
        hasRuleList: rules.parentElement.contains(document.getElementById('line-rules')),
    };
}

function assertLineChangeLayout(assert, layout) {
    assert.deepEqual(layout.titles, ['Preview', 'Substitutions']);
    assert.ok(layout.headingsMatch, 'Headings share the TMI divider and spacing');
    assert.ok(Math.abs(layout.buttonGap - 4) < 1, 'Preview ends immediately below the buttons: ' + layout.buttonGap);
    assert.equal(layout.dividerHeight, 4);
    assert.ok(layout.rulesBelowDivider && layout.hasRuleList);
}

module.exports = { readLineChangeLayout, assertLineChangeLayout };
