# Maybe new features for AFFO

## Chrome / Firefox source survey — 2026-09-12

The strongest additions for AFFO are **independent heading/body configurations, replacement of a specific original page family, font-file import, named variable-font instances, recent-font history, category filters, and word spacing**. These extend AFFO's existing typography tools without requiring it to become a general page editor.

Recommendations are based on AFFO commit `cfb3038` and the extension source snapshots described below. Effort estimates are relative architectural judgments, not implementation schedules.

### Scope and evidence

The survey covers **44 distinct extensions/projects and 46 downloaded source snapshots**: 28 Firefox XPI packages, 12 Chrome CRX packages, and six GitHub source archives. These include ordinary font replacers, multilingual tools, typography inspectors with editing/preview features, and adjacent accessibility/style tools. FontARA and Stylebot each have both a store package and a newer repository snapshot, so they are counted once each.

Discovery used Mozilla's add-on search API, Chrome store listings, and upstream repositories. Selected projects span different workflows and implementation approaches; this is an extensive sample, not a complete store census or a popularity ranking. Search results for unrelated themes, user-agent changers, Unicode “fancy text” generators, and browser-chrome-only styling were excluded.

Usage figures are **Firefox API `average_daily_users`** or **Chrome store displayed users**, not lifetime installs or directly comparable measures. Recorded counts were retrieved on the survey date; “Not tabulated” means the inventory does not present a count for that entry. Chrome listing HTML takes precedence over older search snippets and is retained beside the downloaded CRX.

Searches included Mozilla first-page queries (`font`, `font replace`, `force font`, `font changer`, `字体`, `フォント`, and `dyslexic`, up to 50 results each), targeted Chrome listing searches, and candidate-name searches. The [candidate metadata](../../ztemp/font-extension-survey/coverage-candidates.json) retains Mozilla hits, including irrelevant results. Coverage includes widely used products but does **not** establish that every extension above 10 users was reviewed; some smaller projects were included for their implementation ideas.

Evidence levels:

- **Package:** inspected the distributed JS/HTML/CSS and manifest; this establishes implementation presence, not successful runtime behavior.
- **Repository:** inspected upstream code, which may differ from a store release. Versions are separated below.
- **Listing:** advertised capabilities only; explicitly identified where used.
- **Proposal:** an AFFO-specific design inference inspired by the evidence.

No third-party extension was installed or executed, and no runtime performance or compatibility comparisons were performed. Bundled/minified code was searched for actual application paths, rather than treating framework property names as implemented features.

All downloads have a `provenance.json` alongside the archive, with retrieval date, URL, SHA-256, extraction status, and archive root for GitHub snapshots. The artifact inventories ([source snapshots](../../ztemp/font-extension-survey/inventory.json), [packages and usage](../../ztemp/font-extension-survey/coverage-inventory.json)) record retrieval attempts, versions, and hashes. Source is under `ztemp/<extension>/source/`; archives and Mozilla metadata are retained alongside it. These paths are intentionally gitignored and will not accompany this document in another checkout.

### Extensions inspected

“Firefox package” and “Chrome package” identify the artifact actually inspected; they do not assert exclusive browser availability. The entry links identify the exact product, avoiding confusion between similarly named font changers.

| Extension / project | Inspected artifact | Observed usage | Relevant findings and source entry points |
|---|---|---|---|
| [Advanced Font Changer](https://chromewebstore.google.com/detail/advanced-font-changer/gaobdjbefgnnmnepikiadbdahmgajknm) | Chrome 4.0 | Not tabulated | Site preference takes precedence over a global font; selectable toast frequency. [Content](../../ztemp/advanced-font-changer/source/content.js), especially `afc_global_font` and `afc_settings`; [background](../../ztemp/advanced-font-changer/source/background.js). |
| [Better Text View](https://chromewebstore.google.com/detail/lgpampdcaamdbdapdembdohcjadnfopg?hl=en) | Chrome 7.3.3 | 638 Chrome listed users | Broader text sizing/contrast tool with custom-family and focal word-highlighting code. Reinforces reading controls; substantial scope beyond AFFO. [Source](../../ztemp/better-text-view/source/src/enable.js). |
| [change all UI fonts](https://chromewebstore.google.com/detail/loiejdbcheeiipmakhghinclmpafiiel?hl=en) | Chrome 1.5.1 | 10,000 Chrome listed users | Global typed family plus site exclusions; reinforces B4. Its broad override and hardcoded exclusions are not a better AFFO application engine. [Source](../../ztemp/change-all-ui-fonts/source/foo.js). |
| [Custom Font Changer](https://addons.mozilla.org/en-US/firefox/addon/custom-font-changer/) | Firefox 2.0 | Not tabulated | Small curated Google-font list, one stored global selection, and stylesheet removal to reset. [content.js](../../ztemp/custom-font-changer/source/content.js). Despite the name, the reviewed flow is not a font-file uploader. Mostly a baseline comparator. |
| [Dark Reader](https://addons.mozilla.org/en-US/firefox/addon/darkreader/) | Firefox 4.9.130 | Not tabulated | Font override and adjustable text stroke alongside appearance settings. [background/index.js](../../ztemp/darkreader/source/background/index.js), around `config.useFont`, `config.fontFamily`, and `config.textStroke`. An adjacent reference, not a reason to rebuild its theme engine. |
| [DyslexiaAway](https://addons.mozilla.org/en-US/firefox/addon/dyslexiaaway/) | Firefox 1.10.0 | 307 Firefox daily users | Choice of reading fonts/custom family, line/letter/word spacing, and excluded domains. Reinforces A7 and reading presets. [Source](../../ztemp/dyslexiaaway/source/content.js). |
| [Enforce Browser Fonts](https://addons.mozilla.org/en-US/firefox/addon/enforce-browser-fonts/) | Firefox 1.2 | 253 Firefox daily users | Another useDocumentFonts toggle. Compiled ClojureScript inspected for its actual browser-settings call. [Source](../../ztemp/enforce-browser-fonts/source/js/core.js). |
| [Font blocker](https://addons.mozilla.org/en-US/firefox/addon/font-blocker/) | Firefox 1.21 | 47 Firefox daily users | Builds replacement @font-face aliases with local() rather than necessarily cancelling font downloads. Supports A2 and a possible use-site-fallback action. [Source](../../ztemp/font-blocker/source/fontblocker.content.js). |
| [Font Changer — ExtensionHub](https://addons.mozilla.org/en-US/firefox/addon/web-font-changer/) | Firefox 3.0.2 | Not tabulated | Google-font category choices and targeting presets for headings, paragraphs, content, navigation, and custom tags/selectors. `sameDomainOnly` controls scope. [Source](../../ztemp/web-font-changer/source/): `assets/fonts-B0sfR6Mz.js` contains preset definitions and CSS generation; `assets/index.html-CZTAUtti.js` contains the popup. |
| [Font Changer — Hareb Lounes](https://addons.mozilla.org/en-US/firefox/addon/font-changer/) | Firefox 2.0 | Not tabulated | Independent All/Headings/Body contexts, word spacing, text transform, five-item recent list, category filters, protected-page warning. [Popup](../../ztemp/font-changer/source/popup/font_changer.js), [application](../../ztemp/font-changer/source/content_scripts/fontChange.js). |
| [Font Changer — karn](https://chromewebstore.google.com/detail/hpegpecfbjnpdlcilpobeflojponbohi?hl=en) | Chrome 1.4 | 392 Chrome listed users | Installed-font enumeration and Google-font URL input. Mostly overlaps existing fonts and B5. [Source](../../ztemp/font-changer-karn/source/popup.js). |
| [Font Contrast](https://addons.mozilla.org/en-US/firefox/addon/font-contrast-fix/) | Firefox 1.6.1 | 815 Firefox daily users | Selectively changes text contrast with background/foreground brightness and color checks. Adjacent appearance tool; deeper than just setting one global text color. [Source](../../ztemp/font-contrast-fix/source/src/enable.js). |
| [Font Finder (revived)](https://addons.mozilla.org/en-US/firefox/addon/font-inspect/) | Firefox 0.6.5 | Not tabulated | Selected-element font editing from inspection/context-menu workflows; frame-aware injection. [replace.js](../../ztemp/font-inspect/source/data/inject/replace.js), [window UI](../../ztemp/font-inspect/source/data/window/index.js), [worker.js](../../ztemp/font-inspect/source/worker.js). |
| [Font Replacer — zidell](https://chromewebstore.google.com/detail/chalbcehpjlhifgjdnmjjpkgjebcckmc?hl=en) | Chrome 1.1.15 | 2,000 Chrome listed users | Accepts font-file URLs and extracts sources from pasted CSS/import/link snippets. This is a useful simplification of custom-font setup. [Source](../../ztemp/font-replacer/source/popup/popup.js). |
| [Font Swap](https://github.com/negset/FontSwap) | Repository 3.1.0, archive root `negset-FontSwap-*` | Not tabulated | Redefines a named source family through `@font-face` with local replacement faces and per-face weight/style. [script.js](../../ztemp/font-swap/source/script.js). A compact example of family aliasing, with applicability limits. |
| [FontARA](https://addons.mozilla.org/en-US/firefox/addon/fontara-font-changer/) / [upstream](https://github.com/mimalef70/fontara) | Firefox 5.0.0; repository 5.1.0, `1abf1ad` | Not tabulated | Custom fonts, Unicode-range presets, RTL behavior, site profiles, and text stroke. [Packaged source](../../ztemp/fontara-font-changer/source/); [upstream source](../../ztemp/fontara-source/source/src/). Do not assume the newer repository's custom-font flow is identical to 5.0.0. |
| [Fontchi](https://addons.mozilla.org/en-US/firefox/addon/fontchi-font-changer/) | Firefox 2.2.2 | Not tabulated | Custom-font upload, family/weight management, composite font sources with Unicode ranges, and optional numeral conversion. [settings.js](../../ztemp/fontchi-font-changer/source/settings.js), [config.js](../../ztemp/fontchi-font-changer/source/config.js), [content.js](../../ztemp/fontchi-font-changer/source/content.js). |
| [FontMapper](https://chromewebstore.google.com/detail/gfdmhpidmomcbghfoejkcpjdklbdcdnn) | Chrome 0.9.2 | Not tabulated | Source-family-to-local-font mappings, PostScript-name resolution, per-mapping scale/spacing/color, and highlighting matched text. [Source](../../ztemp/fontmapper/source/): `assets/content.ts-B9MD0cR0.js`, `chrome-fonts-DPQZMO8a.js`, `chrome-storage-DFGQgO9Z.js`. |
| [Fontonic](https://chromewebstore.google.com/detail/fontonic/hnjlnpipbcbgllcjgbcjfgepmeomdcog) | Chrome 1.8.8 | Not tabulated | Serif/sans/mono configurations, word spacing, global versus site application. [Content implementation](../../ztemp/fontonic/source/js/content.js), [background](../../ztemp/fontonic/source/js/background.js). Category targeting itself overlaps AFFO's TMI. |
| [Fonts Ninja](https://addons.mozilla.org/en-US/firefox/addon/fonts-ninja/) | Firefox 8.0.8 | Not tabulated | Adjacent discovery/preview tool: page-font summaries, sample styling, and bookmarks. [Source](../../ztemp/fonts-ninja/source/): `fonts-ninja-helpers/index.js`, `extension.bundle.js`. Store additionally advertises similar fonts, foundry/price information, and shared boards; those service-backed claims were not independently verified. Not counted as demonstrated persistent page replacement. |
| [fontSwap — Anil Kumar](https://chromewebstore.google.com/detail/mhhcggkelljdbflokkmbnfaoeilnngll?hl=en) | Chrome 0.0.27 | 10,000 Chrome listed users | Real font-file picker; rule objects and background matching support selectors, match URLs, and exclude URLs. File import and rule targeting support A3/B1/B4. [Source](../../ztemp/fontswap-anilkumar/source/popup/select-font-file-2K4RWBBR.js). |
| [FontSwap — FontAlternatives.com](https://chromewebstore.google.com/detail/mhkkpbhepfoejcjomclfmopgdabbfmkm?hl=en) | Chrome 0.1.2 | 295 Chrome listed users | Font inspection, background/foreground contrast reporting, canvas measurement, and CSS-based font replacement. Supports B6/B7; its detection still needs independent runtime validation. [Source](../../ztemp/fontswap-alternatives/source/content-scripts/content.js). |
| [Fontswap — ingau.me](https://chromewebstore.google.com/detail/kcjbdmhfddeokkeacnooedfbaaegoidj?hl=en) | Chrome 1.0.1 | Not exposed | Per-host Google-font selection; a different product from negset/FontSwap and Anil Kumar’s fontSwap. Package retrieved, but current store user count was not exposed. [Source](../../ztemp/fontswap-ingau/source/content.js). |
| [Force My Browser Fonts](https://github.com/sysop84/force-my-browser-fonts) | Repository snapshot | Not tabulated | Serif/sans/mono substitution and icon-protection experimentation. [dist/contentScript.js](../../ztemp/force-my-browser-fonts/source/dist/contentScript.js). Downloaded archive has no extension manifest; treat it as reference/prototype code, not an installable current release. Its category concept already overlaps TMI. |
| [Furocku Web Font](https://addons.mozilla.org/en-US/firefox/addon/furocku-web-font/) | Firefox 1.0.9resigned1 | 739 Firefox daily users | Detects Myanmar Unicode/Zawgyi and can convert text using Rabbit. Specialized encoding repair, not merely replacing a font. [Source](../../ztemp/furocku-web-font/source/content.js). |
| [GetFont](https://github.com/pretnicx/getfont) | Repository 0.6.0 | Not tabulated | Page-wide font inventory, suggested alternatives, per-element axes, and CSS/Tailwind/SCSS/TS/JSON export. [inspector.js](../../ztemp/getfont/source/src/content/inspector.js), [similar-fonts.js](../../ztemp/getfont/source/src/lib/similar-fonts.js). README describes GitHub distribution and a forthcoming Chrome listing. Detection/replacement limitations are noted below. |
| [Github Code Font Changer](https://addons.mozilla.org/en-US/firefox/addon/github-code-font-changer/) | Firefox 2.2 | Not tabulated | GitHub-specific code typography, typed local family names, weight selection, and indentation-guide visibility. [popup.js](../../ztemp/github-code-font-changer/source/popup.js), [background.js](../../ztemp/github-code-font-changer/source/background.js). Scope-specific presets are more relevant than its existing basic controls. |
| [Hamdast](https://addons.mozilla.org/en-US/firefox/addon/hamdast-ai-assistant/) | Firefox 1.2.10 | 426 Firefox daily users | AI-site font/RTL adapters, separate font-only/RTL-only modes, and a numeral appearance toggle implemented through different font faces. [Source](../../ztemp/hamdast-ai-assistant/source/assets/js/content.js). |
| [Helperbird](https://addons.mozilla.org/en-US/firefox/addon/helperbird/) | Firefox 2026.9.7 | 1,072 Firefox daily users | Large accessibility suite with font support. Font-related bundle inspection only; the rest of the suite and any paid-feature boundaries were not audited. [Source](../../ztemp/helperbird/source/scripts/content.js). |
| [MathML Font Settings](https://addons.mozilla.org/en-US/firefox/addon/mathml-font-settings/) | Firefox 0.3.3resigned1 | 92 Firefox daily users | Context-menu font and scale choices applied specifically to math elements, including frames. A genuinely separate target class. [Source](../../ztemp/mathml-font-settings/source/background.js). |
| [Mobile Dyslexic](https://addons.mozilla.org/en-US/firefox/addon/mobile-dyslexic/) | Firefox 0.0.6 | Not tabulated | Simple toolbar toggle and packaged reading-font CSS. [Source](../../ztemp/mobile-dyslexic/source/), especially `background.js`, `content-script.js`, and `css/mobiledyslexic.css`. Demonstrates an offline/single-action workflow, not evidence of reading efficacy. |
| [OpenDyslexic for Chrome](https://chromewebstore.google.com/detail/cdnapgfjopgaggbmfgbiinmmbdcglnam?hl=en) | Chrome 2026.7.29 | 500,000 Chrome listed users | Packaged font toggle, variants, and excluded sites. Confirms the value of simple reading presets; no major new AFFO capability. [Source](../../ztemp/opendyslexic-chrome/source/scripts/engine.js). |
| [Random Font Changer](https://addons.mozilla.org/en-US/firefox/addon/random-font-changer/) | Firefox 1.3 | Not tabulated | Category-constrained random choices, recent-font history, site saving/blocking, and settings export/import. [popup.js](../../ztemp/random-font-changer/source/popup.js), [background.js](../../ztemp/random-font-changer/source/background.js). AFFO already has Substack Roulette; broader scope and history are the deltas. |
| [ReadEase](https://addons.mozilla.org/en-US/firefox/addon/readease-dyslexia-reading-tool/) | Firefox 1.3.1 | 15 Firefox daily users | The inspected Firefox PDF viewer extracts text into HTML paragraphs and reapplies reading styles. It does not preserve the original PDF page layout. [Source](../../ztemp/readease-dyslexia-reading-tool/source/pdf-viewer.js). |
| [Reading Aid](https://addons.mozilla.org/en-US/firefox/addon/reading-aid/) | Firefox 2.1 | Not tabulated | Reading font, background tint, line/word spacing, and a translucent cursor rectangle. [content.js](../../ztemp/reading-aid/source/content.js). The rectangle is a cursor aid, not a full reading-ruler implementation. |
| [ReFont](https://addons.mozilla.org/en-US/firefox/addon/refont/) | Firefox 1.5resigned1 | 258 Firefox daily users | Explicit global/site/page choices with inherit-global and inherit-site options. Good concrete reference for B4 precedence UX. [Source](../../ztemp/refont/source/action.ui.js). |
| [Replace Chinese font portions with Microsoft Yahei](https://addons.mozilla.org/en-US/firefox/addon/%E6%9B%BF%E6%8D%A2%E5%AD%97%E4%BD%93%E7%9A%84%E4%B8%AD%E6%96%87%E9%83%A8%E5%88%86%E4%B8%BA%E5%BE%AE%E8%BD%AF%E9%9B%85%E9%BB%91/) | Firefox 0.1.4resigned1 | 242 Firefox daily users | Named-family aliases split by Unicode ranges. Despite the description, the CSS also remaps a lower range to Segoe UI; do not assume Latin is untouched. [Source](../../ztemp/font-chinese-yahei/source/css/2yahei.css). |
| [Stylebot](https://addons.mozilla.org/en-US/firefox/addon/stylebot-web/) / [upstream](https://github.com/ankit/stylebot) | Firefox 3.1.3; repository 3.2.1, `696cd8c` | Not tabulated | Pick an element, edit typography with a visual UI or CSS, and use reader mode. [Packaged source](../../ztemp/stylebot-web/source/); [upstream editor](../../ztemp/stylebot-source/source/src/editor/), including selector match counts and highlighting. Newer repository UI is not attributed to the older package. |
| [Toggle Fonts](https://addons.mozilla.org/en-US/firefox/addon/togglefonts/) | Firefox 2.2.0 | 312 Firefox daily users | Toggles Firefox browserSettings.useDocumentFonts. Browser-wide preference control, not site-scoped font replacement. [Source](../../ztemp/togglefonts/source/background.js). |
| [Type-X](https://github.com/arrowtype/type-x) | Repository `118f0b3`; manifest 1.3 (`package.json` says 1.0.2) | Not tabulated | Font-file import/drop, installed-font enumeration, custom selectors/exclusions/CSS, fallback-family configuration, named variable instances, inherited page styles, and file reload polling. [font.ts](../../ztemp/type-x/source/src/font.ts), [form.ts](../../ztemp/type-x/source/src/form.ts). Upstream README says the Chrome store listing is currently unlisted for maintenance; this is source availability, not verified store availability. |
| [Urdu Arabic Persian Uyghur — Font / Size Change](https://addons.mozilla.org/en-US/firefox/addon/urdu-font-size-change/) | Firefox 1.9resigned1 | Not tabulated | Detects Arabic-script text runs, wraps matches in spans, and applies script-specific font/size/line height. [main.js](../../ztemp/urdu-font-size-change/source/main.js). Useful targeting idea; the text-node rewriting strategy is a poor fit for AFFO. |
| [WebTypographer](https://chromewebstore.google.com/detail/fgncalbcgafopnkmikpgjmibiplpeblh?hl=en) | Chrome 2.1 | 171 Chrome listed users | Per-site/global typography, proportional sizing, spacing, palettes, and presets in a side panel. Mostly duplicates existing and the controls proposed below. [Source](../../ztemp/webtypographer/source/content.js). |
| [Zoom Page WE](https://addons.mozilla.org/en-US/firefox/addon/zoom-page-we/) | Firefox 19.13 | Not tabulated | Text-only zoom and a minimum font-size floor. [content.js](../../ztemp/zoom-page-we/source/content.js), `buildFontSizeRules` at line 782. AFFO already scales text; the floor is the interesting difference. |
| [やっぱり Noto Sans / Replace with Noto](https://addons.mozilla.org/en-US/firefox/addon/replace-with-noto/) | Firefox 1.1.10 | 204 Firefox daily users | Aliases selected Japanese/other families to bundled Noto faces. Reinforces targeted-family/script replacement rather than changing all text. [Source](../../ztemp/replace-with-noto/source/css/replacefont-extension-regular.css). |

**Unavailable:** TypeTuner's Chrome update-service request for ID `pjjeiephojmhohpidbjndaipjahchjdh` returned an empty body. Kept the attempted URL/result in [provenance](../../ztemp/typetuner/provenance.json). No implementation claims or feature recommendations depend on obtaining its code.

**Other hits screened, not exhaustively inspected:** Firefox's MathML-fonts (388 daily users), Awami Nastaliq Font Package (95), OpenDyslexic Font Override (193), and smaller dyslexia font toggles are further examples above the threshold. Font Size Increase/Decrease (1,022/371) are size-only adjacent tools. WhatFont/other identifier-only extensions, Font Fingerprint Defender, and Theme Font & Size Changer fall outside the page-font-replacement scope.

### What AFFO already has

The comparison checked [config normalization](../../src/config-utils.js), [font picker](../../src/font-picker.js), [popup controls](../../src/popup.js), [CSS generation](../../src/css-generators.js), [content application](../../src/content.js), [options UI](../../src/options.html), [WhatFont](../../src/whatfont_core.js), and [storage documentation](../architecture/DATA_STRUCTURES.md).

- **Local fonts:** `affoLocalFonts` and `fontSource: "local"` already support manually entered installed-family names. The missing pieces are enumeration, face-name assistance, and importing actual font files.
- **Custom fonts:** Custom Font CSS already accepts/imports `@font-face` CSS; custom axis metadata already has a JSON editor/importer. “Support custom fonts” is not a new feature.
- **Typography:** AFFO already supports relative `fontSizeScale`, absolute size, line height, letter spacing, weight/style/color, and variable axes. Minimum size, word spacing, and named instances are separate additions.
- **Targeting:** Body Contact and TMI already protect headings and other semantic regions. TMI already distinguishes serif/sans/mono. A configurable heading target, arbitrary selector, or specific source-family mapping is different from those modes.
- **Workflow:** Favorites, Quick Pick, sync, Substack Roulette, and WhatFont → Face-off already exist. New suggestions below concern unsaved history, wider randomization scope, page-wide inventory, or editing the inspected target.
- **Application:** Dynamic-page handling, font preloading/cache, icon preservation, site-specific accommodations, and viewport anchoring already exist. These should not be counted as competitor-exclusive features.

### Priority A — strongest fit

#### A1. Headings Contact and saved heading/body pairs

**Evidence:** Hareb Lounes separates `all`, `headings`, and `body`; `getSelector` in [fontChange.js](../../ztemp/font-changer/source/content_scripts/fontChange.js) targets headings independently. ExtensionHub's [preset definitions](../../ztemp/web-font-changer/source/assets/fonts-B0sfR6Mz.js) also include headings.

**AFFO delta:** Add a headings target that can coexist with Body Contact, then let a favorite save the pair. Example: keep article text in Literata while trying Fraunces on headlines. A pair preset is an AFFO proposal derived from the separate contexts, not a claim that the inspected extension implements pair favorites.

**Effort: medium–large.** Requires independent heading config, application/reset behavior, panel routing, and sync. Reuse current CSS generation and semantic exclusions; explicitly handle styled descendants inside `h1`–`h6`. Do not simply remove heading exclusions from Body Contact/TMI. Keep headline scale optional so font selection alone preserves the site's hierarchy.

#### A2. Replace one original page family

**Evidence:** FontMapper stores mappings by source-family key and highlights matches in [content.ts-B9MD0cR0.js](../../ztemp/fontmapper/source/assets/content.ts-B9MD0cR0.js). Font Swap's [script.js](../../ztemp/font-swap/source/script.js) aliases a source family to local faces.

**AFFO delta:** “Replace this page's Arial with Inter” while leaving its other sans-serif families alone. Start from WhatFont or a page-font list, and save the mapping per site. TMI's category replacement is broader than this.

**Effort: large.** Match against original typography, not already-replaced computed styles. Preserve icon exclusions and font-face-only domain handling. Prefer AFFO-owned CSS/markers over copying FontMapper's inline mutation engine. Aliasing through `local()` only addresses suitable installed fonts; arbitrary remote replacements must use resolved font resources. Reset must remove only AFFO's rule.

#### A3. Import font files with metadata extraction

**Evidence:** Type-X's [font.ts](../../ztemp/type-x/source/src/font.ts) uses `FileReader`, parses axes/named variations with Fontkit, and handles dropped files. Fontchi's [settings.js](../../ztemp/fontchi-font-changer/source/settings.js) implements upload and font management. FontARA has both packaged and newer upstream custom-font flows.

**AFFO delta:** Choose a TTF/OTF/WOFF/WOFF2 file from Android's file picker or desktop, inspect its family/weight/style/axes, and make it available in Face-off and page modes. This removes the need to host a font or manually write CSS and axis JSON.

A smaller custom-font setup improvement comes from Font Replacer: paste a font-file URL, `@font-face`, `@import`, or stylesheet `<link>` and extract the source/family automatically (`detectFontUrlType`, `extractUrlFromCss`, `extractFontFamilyFromCss`). AFFO already accepts complete custom CSS, but could make acquisition easier without requiring local-file storage first. Preserve multiple faces, weights, and subsets rather than copying its first-match parser literally. Anil Kumar's fontSwap also implements font-file uploads.

**Effort: large.** Add managed imported-font identities and durable binary storage; do not put imported originals in an evictable remote cache. Define regular/bold/italic association, duplicate replacement, deletion, and export semantics. Keep initial imports local; automatic cloud upload is a separate product decision. Update `DATA_STRUCTURES.md` when implementing the new source type and metadata.

#### A4. Named variable-font instances and an explicit inherit option

**Evidence:** Type-X's `loadVariableInfo` reads `namedVariations`; `addNamedInstances` / `applyNamedInstance` in [form.ts](../../ztemp/type-x/source/src/form.ts) populate an instance selector and an “Inherit page styles” choice.

**AFFO delta:** Choose a font-authored style such as a named Text or Display instance instead of reconstructing its axis coordinates manually. AFFO already has axis sliders and unset/default behavior; named instances and a clearer grouped inherit control are the additions.

**Effort: medium after metadata extraction.** Store selected coordinates canonically; a display name should not be the only data required to restore a favorite. Clearing an inherited axis should remove its key, consistent with AFFO's no-key architecture. Do not claim a font has instances unless its metadata supplies them.

#### A5. Recent fonts and recent configurations

**Evidence:** Hareb Lounes' [popup.js](../../ztemp/font-changer/source/popup/font_changer.js), around lines 396–446, stores recents and displays five. Random Font Changer has `loadHistory` and clickable history.

**AFFO delta:** Recover a font tried several selections ago without first favoriting it. A short family history is the simplest version; configuration history could later recover axes/spacing too. Favorites and the current UI state do not supply this history.

**Effort: small for families; medium for configurations.** Deduplicate and cap history. Record committed selections rather than every slider input, preload, hover, or automatic page application. Decide explicitly whether history is local-only. A separate undo/redo stack would be a further proposal, not the same feature.

#### A6. Category filters and a more capable picker

**Evidence:** Hareb Lounes has `handleCategoryFilter` / `filterFonts`; ExtensionHub defines serif/sans/display/handwriting/mono choices.

**AFFO delta:** Expose category chips plus source filters (Google/custom/local), and keep search active when switching a filter. AFFO already groups its modal into Pinned, Local, Favorites, and alphabetical sections, with search and a letter-jump rail; those existing conveniences are not new proposals. It has no equivalent category-filter UI in the reviewed implementation.

**Effort: small–medium.** Start with filtering and history views. Preserve an “unknown” category for custom/local families lacking metadata. Virtualization and lazy per-row font previews are optional follow-ons if measured picker costs justify them; do not fetch every font just to render the list. Preserve focus, keyboard navigation, and scroll position when rows change.

#### A7. Word spacing

**Evidence:** Hareb Lounes' designer controls, Fontonic's `wordSpacing` handling, FontMapper's per-mapping spacing, and [Reading Aid](../../ztemp/reading-aid/source/content.js) all implement it.

**AFFO delta:** Add `wordSpacing` in em, beside letter spacing and line height, for both comparison and applied typography. It is absent from the reviewed config normalization and generators.

**Effort: small–medium.** Carry it through normalization, UI state, payloads, favorites, equality/reset checks, CSS, and sync. Treat zero as explicit (`!= null`), with absence preserving site behavior. Select bounds through actual page testing rather than copying a competitor's pixel slider or fixed value.

### Priority B — useful, with broader design decisions

#### B1. Pick an element; preview and save a typography target

**Evidence:** Font Finder's [replace.js](../../ztemp/font-inspect/source/data/inject/replace.js) changes the selected ancestor's family; Stylebot's [editor](../../ztemp/stylebot-source/source/src/editor/) generates selectors, counts matches, and highlights them. Type-X lets users edit selectors and an exclusion list.

**AFFO delta:** Extend WhatFont with “Try on this element,” then optionally save a selector target. Show how many elements the target matches before saving. Examples include a newsletter's title, pull quotes, or an application's editor pane.

**Effort: large.** A temporary element-only experiment is easier than durable selectors. For saved rules, offer inspectable selectors and explicit exclusions; handle invalid selectors and changed page markup visibly. Reuse the existing font-application and style-cleanup paths.

#### B2. Script-aware font composition and opt-in RTL adjustments

**Evidence:** FontARA 5.0.0's packaged background includes Arabic/Persian, Latin, and combined Unicode-range presets; its injected code includes reversible RTL adapters. Fontchi's [config.js](../../ztemp/fontchi-font-changer/source/config.js) defines composite sources/ranges. The Urdu extension targets Arabic-script runs.

**AFFO delta:** A supported UI to combine different fonts for Latin, Arabic-script, and CJK text, or restrict a replacement to a script. Custom CSS can already express Unicode ranges, so the basic CSS capability is not new. Language presets, matching previews, and metadata-aware selection are new UX. Direction/alignment controls are a separate opt-in extension of this idea.

The Yahei and Noto packages demonstrate CJK family aliases and script ranges. Do not copy overly broad BMP ranges as precise language coverage. Hamdast switches between numeral-specific font faces, an alternative to rewriting digits in the DOM; this only works when the chosen font supports the desired glyph design. Furocku additionally repairs Unicode/Zawgyi encoding through text conversion, which is a separate problem and not recommended as a general AFFO feature.

**Effort: large.** Prefer font composition and existing language/direction markup before modifying text nodes. Preserve shaping, code/math, editable fields, and mixed-direction messages. Fontchi also converts numeral characters; copying that behavior would change text content, so it is not recommended as a default typography feature.

#### B3. Minimum readable text size

**Evidence:** Zoom Page WE's [buildFontSizeRules](../../ztemp/zoom-page-we/source/content.js) distinguishes scaling from a minimum size.

**AFFO delta:** “Raise text below 16 px” without scaling already-large text. AFFO's existing relative/absolute size controls do not express a size floor.

**Effort: medium–large.** Integrate with original-size tracking and dynamic content. Repeated application must not compound the size. Specify whether the floor applies before or after relative scaling, and retain semantic exclusions. Avoid adopting Zoom Page WE's integer-size buckets without checking fractional and responsive typography.

#### B4. Global profile with explicit site exceptions

**Evidence:** Advanced Font Changer's [content.js](../../ztemp/advanced-font-changer/source/content.js) chooses the site font before `afc_global_font`; Fontonic has global/override behavior. FontARA's newer [site configuration](../../ztemp/fontara-source/source/src/config/) supports more elaborate profile matching.

**AFFO delta:** One optional default typography profile, with “keep original” and custom profiles per site. Later, allow path-specific rules such as `/articles/*` without changing a site's dashboard. AFFO currently looks up `affoApplyMap` by hostname; Substack Roulette is not a general default-profile system.

ReFont's `action.ui.js` demonstrates global/site/page selectors with `_inheritGlobalFont` and `_inheritSiteFont` states. Show inheritance explicitly so an empty selection does not ambiguously mean reset, disable, or inherit.

**Effort: large.** Define a single precedence model before adding scope types. A disabled-site exception must remain distinct from no saved entry. Popup state should show which rule won, and reset should identify whether it clears the override or disables inherited styling. Path/wildcard support is a later scope expansion, not required for an initial global default.

#### B5. Installed-font enumeration and face resolution on supported desktop browsers

**Evidence:** Type-X calls `chrome.fontSettings.getFontList`; FontMapper's [chrome-fonts-DPQZMO8a.js](../../ztemp/fontmapper/source/assets/chrome-fonts-DPQZMO8a.js) calls `queryLocalFonts()` and retains family/full/PostScript names.

**AFFO delta:** Offer an explicit “Choose installed font” action in a supported Chromium build, including actual regular/bold/italic faces, while retaining AFFO's current manual-name workflow elsewhere.

**Effort: medium, platform-specific.** These are different APIs and permission models. [Chrome fontSettings](https://developer.chrome.com/docs/extensions/reference/api/fontSettings) documents enumeration; [MDN Local Font Access](https://developer.mozilla.org/en-US/docs/Web/API/Window/queryLocalFonts) documents limited availability, user permission, and interaction requirements. Do not promise this as a Firefox Android capability. Font-file import is the more relevant Android investment.

#### B6. Page typography inventory and export

**Evidence:** GetFont's [inspector.js](../../ztemp/getfont/source/src/content/inspector.js) has `collectAllFonts`, `exportCSS`, `exportTailwind`, `exportSCSS`, and `exportTokens`; Fonts Ninja's helpers also collect page font styles.

**AFFO delta:** List page families with sample text, observed weights/sizes, and a route to Face-off or specific-family replacement. Export a chosen AFFO configuration as CSS; later add a page typography report. AFFO's custom CSS/settings export is different from exporting observed or composed typography.

**Effort: medium–large.** Start with a manual scan and CSS/JSON output. Label declared versus verified font information and computed px values clearly. Tailwind/design-token output needs grouping and naming decisions; sampled values are not automatically a coherent design system. Keep font binaries out of an ordinary typography report.

#### B7. Suggested alternatives and font pairs

**Evidence:** GetFont has a local [similar-fonts table](../../ztemp/getfont/source/src/lib/similar-fonts.js) and `getSimilarFonts`; Fonts Ninja advertises similar/complementary discovery, but its service behavior was not tested.

**AFFO delta:** From WhatFont or a selected family, suggest a few alternatives to compare immediately. Saved heading/body pair suggestions could build on A1. This is discovery beyond current favorites and Roulette.

**Effort: medium.** Begin with a small editorially maintained mapping and transparent category matches. Describe results as suggestions, not metric-compatible substitutes or reliable visual similarity. Language coverage should constrain results when that metadata is available.

#### B8. Unsupported-page feedback and concise application status

**Evidence:** Hareb Lounes implements `isProtectedSite` / `showProtectedSiteWarning`; Advanced Font Changer supports always/on-apply/never toast frequency.

**AFFO delta:** Keep Face-off usable while explaining why page application is unavailable on a restricted page. Distinguish restriction from a failed font load or no matching text. A configurable, unobtrusive status indicator could help with inherited profiles and automatic changes.

**Effort: small–medium.** No dedicated protected-page warning flow was found in the reviewed popup code. Combine URL eligibility with actual injection responses; a competitor's static blocklist is not authoritative. Toast configuration alone is lower priority than clear disabled actions and actionable failure status.

### Priority C — narrower experiments

| Idea | Evidence / AFFO gap | Assessment |
|---|---|---|
| Text transform | Hareb Lounes `handleTextTransformChange`; Stylebot text controls. AFFO has no corresponding config field. | Small–medium. Useful for heading proofs. CSS-only and explicitly set; prioritize word spacing first. |
| Text stroke | Dark Reader `config.textStroke`; FontARA [text-stroke generator](../../ztemp/fontara-source/source/src/generators/text-stroke.ts). | Medium. A visual alternative when a font lacks a suitable weight. Must remain independent of `wght`, reset cleanly, and exclude icons/code. |
| Font-file hot reload | Type-X `setupReload` / `compare` polls the selected file's timestamp. | Medium after import. Valuable for font authors iterating on a local build; platform-specific file-handle support makes this a desktop specialist workflow. |
| Reading preset and cursor/ruler aid | Reading Aid combines tint, spacing, and a cursor rectangle; Stylebot has reader mode. | Medium–large. AFFO could bundle existing controls plus word spacing into user-selected presets. A true ruler or paragraph isolation is an additional proposal; a full reader/TTS product is much larger scope. No clinical benefit is established by this source survey. |
| Randomization beyond Substack | Random Font Changer has category pools, saved site choices, blocked sites, and history. | Medium. Reuse Roulette/pool concepts for an explicit general-page action rather than adding a second randomization engine. History is useful even without wider automatic randomization. |
| Frame-aware font application | Font Finder's `worker.js` injects with `allFrames`; Fontchi's background also targets all frames. AFFO's main manifest content-script entries omit `all_frames`. | Large. Investigate embedded articles/editors when actual demand appears. Define top-page versus frame profile ownership and avoid duplicating toolbar UI. This evidence does not demonstrate Shadow DOM coverage. |
| Math-only typography | MathML Font Settings targets `math` with a separate family and scale. | Medium–large. A narrow opt-in target for technical readers; validate math-capable fonts and layout independently of body/code fonts. |
| Selective contrast adjustment | Font Contrast checks surrounding brightness and colorfulness; FontSwap by FontAlternatives.com reports contrast. | Medium–large. AFFO has font color and a Substack Roulette color clamp, but not a general inspectable contrast repair tool. Preserve colored links and dark surfaces; the competitor's brightness heuristic is not a WCAG contrast calculation. |
| Browser-default-font toggle | Toggle Fonts / Enforce Browser Fonts call `browserSettings.useDocumentFonts`. | Small UI, broad effect. A Firefox-specific global preference change, not equivalent to resetting AFFO. Lower priority than a site-scoped “use original/fallback” action. |
| Code-reading preset | Github Code Font Changer targets code and toggles indentation guides. | Medium. A code-focused font/size/spacing preset may fit AFFO. Indentation-guide manipulation is site-specific scope beyond core font replacement. |

### Implementation lessons and boundaries

1. **Keep the idea separate from the competitor's mechanism.** Font Swap uses local face aliases; GetFont additionally imports Google CSS but then aliases with `local(replacement)`. A downloaded webfont is not thereby an installed local font. AFFO should resolve and register the actual font source for remote-family mappings.
2. **Do not adopt GetFont's “actual font” label as proof.** Its `actualRenderedFamily` accepts the first `document.fonts.check()` success. The [API documentation](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/check) explicitly allows success for nonexistent families. Its `testAxisSupport` checks bounding-box changes, which can miss axes that change outlines without changing advances. Use these as examples of UI ideas, not reliable metadata detection.
3. **Verify PDF claims against the specific package.** ReadEase Firefox 1.3.1 calls `getTextContent()`, groups lines, and creates HTML paragraphs. This is a reflowed reading view, not layout-preserving PDF font substitution. Any AFFO PDF mode would be a separate product direction, not a small extension of page CSS.
4. **Retain AFFO's existing ownership and restoration model.** The Urdu extension rewrites text runs through HTML/span insertion; Fontchi optionally replaces numeral characters; Force My Browser Fonts experiments with deleting page `@font-face` rules and assigning `document.adoptedStyleSheets`. Those mechanisms should not be copied into AFFO merely to obtain narrower font targeting.
5. **Separate release evidence from upstream work.** FontARA's downloaded package is 5.0.0 and its source archive is 5.1.0; Stylebot likewise has different package/repository versions. Type-X, GetFont, and Force My Browser Fonts are source references here, not verified current store releases.
6. **Preserve provenance and licensing if code is reused later.** The extracted files are research copies. In particular, FontARA's AMO 5.0.0 metadata says All Rights Reserved while its newer upstream describes MIT; Fonts Ninja's package is also All Rights Reserved. Do not infer a package's reuse terms from a different repository/version. This document recommends independently implemented features and does not copy third-party implementation into AFFO.
7. **Extend the canonical pipeline once.** New properties must flow through `normalizeConfig`, `getCurrentUIConfig`, `buildPayload`, equality checks, reset, favorites, sync, popup preview, content CSS, and Quick Pick where relevant. Numeric zero remains meaningful. New source types, profile scopes, imports, and history require corresponding storage documentation when implemented.

### Suggested sequence

First deliver **recent fonts, category filters, and word spacing** as a bounded usability improvement. Next pursue **Headings Contact with pair favorites** as the clearest distinctive expansion. Prototype **file import + metadata + named instances** together, since they share dependencies. Follow with **specific-family replacement**, ideally using an inventory/WhatFont entry point. Global/path rules, generic selector editing, and multilingual direction changes should each receive separate designs because they substantially expand application scope.

Validation for future implementation should include Firefox Android, desktop Firefox, and any affected Chromium build; reload/reset, SPA additions, original bold/italic styling, headings/icons/code exclusions, and persistence round trips matter more than matching a competitor's screenshots.
