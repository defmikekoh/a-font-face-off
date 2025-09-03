// Content script: re-apply saved fonts on page load for this origin
(function(){
  function inject(payload){
    try {
      // Use original font family name (no aliasing needed)
      var appliedFamily = (payload && payload.fontName) ? payload.fontName : '';
      // Classify page base font (serif vs sans) once per doc — used for diagnostics/heuristics
      try {
        if (!document.documentElement.hasAttribute('data-affo-base')) {
          var fam = '';
          try { fam = String(getComputedStyle(document.body || document.documentElement).fontFamily || ''); } catch(_) {}
          var parts = fam.replace(/["']'/g,'').split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
          var hasSansGen = parts.indexOf('sans-serif') !== -1;
          var hasSerifGen = parts.indexOf('serif') !== -1;
          // Prefer explicit generic if present; treat "Merriweather, sans-serif" as sans
          var base;
          if (hasSansGen) base = 'sans';
          else if (hasSerifGen) base = 'serif';
          else {
            // Fall back to name hints
            var serifNames = ['pt serif','georgia','times','times new roman','merriweather','garamond','charter','spectral','lora','abril'];
            var isSerifName = parts.some(function(p){ return serifNames.indexOf(p) !== -1; });
            base = isSerifName ? 'serif' : 'sans';
          }
          document.documentElement.setAttribute('data-affo-base', base);
          // Asynchronously refine using user-provided lists
          try {
            browser.storage.local.get(['affoKnownSerif','affoKnownSans']).then(function(opt){
              try {
                var ks = Array.isArray(opt.affoKnownSerif) ? opt.affoKnownSerif.map(function(s){return String(s||'').toLowerCase().trim();}) : [];
                var kn = Array.isArray(opt.affoKnownSans) ? opt.affoKnownSans.map(function(s){return String(s||'').toLowerCase().trim();}) : [];
                var nameHitSerif = parts.some(function(p){ return ks.indexOf(p) !== -1; });
                var nameHitSans = parts.some(function(p){ return kn.indexOf(p) !== -1; });
                if (nameHitSans && !hasSansGen) document.documentElement.setAttribute('data-affo-base', 'sans');
                else if (nameHitSerif && !hasSerifGen) document.documentElement.setAttribute('data-affo-base', 'serif');
              } catch(_){ } 
            }).catch(function(){});
          } catch(_){ }
        }
      } catch(_){}
      // For Google Fonts payloads, ensure a css2 <link> is present to start font download quickly
      try {
        var linkId = payload.linkId || (payload.styleId + '-link');
        if (linkId && payload.css2Url && !payload.fontFaceOnly) {
          var l = document.getElementById(linkId);
          if (!l) { l = document.createElement('link'); l.id = linkId; l.rel = 'stylesheet'; l.href = payload.css2Url; document.documentElement.appendChild(l); }
        }
      } catch (_) {}
      async function loadCustomIfNeeded(){
        try {
          if (payload && payload.fontName === 'BBC Reith Serif'){
            // Load a minimal real-face set so bold/italic render properly on pages
            // Always preload 400/700 in both normal and italic. Cache by session to avoid duplicates.
            var base = 'https://static.files.bbci.co.uk/fonts/reith/2.512/';
            function urlFor(w, it){
              if (it){
                if (w<=300) return base + 'BBCReithSerif_W_LtIt.woff2';
                if (w<=400) return base + 'BBCReithSerif_W_It.woff2';
                if (w<=500) return base + 'BBCReithSerif_W_MdIt.woff2';
                if (w<=700) return base + 'BBCReithSerif_W_BdIt.woff2';
                return base + 'BBCReithSerif_W_ExBdIt.woff2';
              } else {
                if (w<=300) return base + 'BBCReithSerif_W_Lt.woff2';
                if (w<=400) return base + 'BBCReithSerif_W_Rg.woff2';
                if (w<=500) return base + 'BBCReithSerif_W_Md.woff2';
                if (w<=700) return base + 'BBCReithSerif_W_Bd.woff2';
                return base + 'BBCReithSerif_W_ExBd.woff2';
              }
            }
            var toLoad = [
              { w: 400, it: false },
              { w: 700, it: false },
              { w: 400, it: true  },
              { w: 700, it: true  }
            ];
            try { window.__affoBBCLoaded = window.__affoBBCLoaded || {}; } catch(_) { /* ignore */ }
            for (var i = 0; i < toLoad.length; i++){
              var pair = toLoad[i];
              var key = 'BBCReithSerif:' + pair.w + ':' + (pair.it ? 'italic' : 'normal');
              try {
                if (window.__affoBBCLoaded && window.__affoBBCLoaded[key]) continue;
              } catch(_){}
              var url = urlFor(pair.w, pair.it);
              try {
                var binResp = await browser.runtime.sendMessage({ type: 'affoFetch', url: url, binary: true });
                if (binResp && binResp.ok && Array.isArray(binResp.data)){
                  var u8 = new Uint8Array(binResp.data);
                  var src = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
                  var desc = { weight: String(pair.w), style: pair.it ? 'italic' : 'normal' };
                  var ff = new FontFace(appliedFamily, src, desc);
                  await ff.load();
                  document.fonts.add(ff);
                  try { if (window.__affoBBCLoaded) window.__affoBBCLoaded[key] = true; } catch(_){}
                }
              } catch(_){}
            }
          } else if (payload && (/ABC\s+Ginto\s+Normal\s+Unlicensed\s+Trial/i.test(payload.fontName) || /ABC\s+Ginto\s+Nord\s+Unlicensed\s+Trial/i.test(payload.fontName))) {
            // Load from CDNFonts CSS by parsing @font-face blocks and picking best match
            var cssUrl = (/Normal/i.test(payload.fontName))
              ? 'https://fonts.cdnfonts.com/css/abc-ginto-normal-unlicensed-trial'
              : 'https://fonts.cdnfonts.com/css/abc-ginto-nord-unlicensed-trial';
            var cssResp = await browser.runtime.sendMessage({ type: 'affoFetch', url: cssUrl, binary: false });
            if (!cssResp || !cssResp.ok) return;
            var cssText = String(cssResp.data || '');
            var blocks = cssText.split('@font-face').slice(1);
            var italWanted = !!(payload.italVal !== null && payload.italVal !== undefined && Number(payload.italVal) >= 1);
            // Default unset weight to 400 to prevent unintended 300 selection
            var target = (payload.fontWeight === null || payload.fontWeight === undefined)
              ? 400
              : Number(payload.fontWeight);
            if (!isFinite(target) || target <= 0) target = 400;
            var best = null;
            function getUrl(b){
              // Prefer woff2, then woff, then ttf
              var m2 = b && b.match(/url\(([^)]+\.(?:woff2|woff|ttf)[^)]*)\)/i);
              if (!m2) return null;
              var u = m2[1].trim();
              if ((u[0]==='"'&&u[u.length-1]==='"')||(u[0]==="'"&&u[u.length-1]==="'")) u=u.slice(1,-1);
              return u;
            }
            blocks.forEach(function(b){
              // Only consider the exact requested Ginto family (Normal or Nord)
              var famm = ((b.match(/font-family\s*:\s*([^;]+);/i)||[])[1]||'').replace(/['"]/g,'').trim();
              var wantFam = (/Normal/i.test(payload.fontName)) ? 'ABC Ginto Normal Unlicensed Trial' : 'ABC Ginto Nord Unlicensed Trial';
              if (famm !== wantFam) return;
              var isItalic = /font-style\s*:\s*italic/i.test(b);
              var wm = b.match(/font-weight\s*:\s*(\d+)/i); var w = wm ? Number(wm[1]) : 400;
              var url = getUrl(b); if (!url) return;
              var penalty = Math.abs(w - target) + (isItalic === italWanted ? 0 : 1000);
              if (!best || penalty < best.penalty) best = { url, w, isItalic, penalty };
            });
            if (best) {
              var bin = await browser.runtime.sendMessage({ type: 'affoFetch', url: best.url, binary: true });
              if (bin && bin.ok && Array.isArray(bin.data)){
                var u8 = new Uint8Array(bin.data);
                var src = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
                var desc = { weight: String(best.w), style: best.isItalic ? 'italic' : 'normal' };
                try {
                  var ff = new FontFace(appliedFamily, src, desc);
                  await ff.load();
                  document.fonts.add(ff);
                  try { await document.fonts.ready; } catch(e){}
                } catch(_){ }
              }
            }
          }
        } catch (_) {}
      }
      function buildCSS(){
        // Target typical body text only; exclude headings, code/monospace, UI/nav, and form controls
        // Guard support: require body itself not be guarded for descendant matches
        var guardNeg = ':not(#affo-guard):not(.affo-guard):not([data-affo-guard])';
        var sel = 'body' + guardNeg + ', ' + 
                  'body' + guardNeg + ' :not(#affo-guard):not(.affo-guard):not([data-affo-guard])' + 
                  ':not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(pre):not(code):not(kbd):not(samp):not(tt):not(button):not(input):not(select):not(textarea):not(header):not(nav):not(footer):not(aside):not(label):not([role="navigation"]):not([role="banner"]):not([role="contentinfo"]):not([role="complementary"]):not(.code):not(.hljs):not(.token):not(.monospace):not(.mono):not(.terminal):not([class^="language-"]):not([class*=" language-"]):not(.prettyprint):not(.prettyprinted):not(.sourceCode):not(.wp-block-code):not(.wp-block-preformatted):not(.small-caps):not(.smallcaps):not(.smcp):not(.sc):not(.site-header):not(.sidebar):not(.toc)';
        var decl = [];
        decl.push('font-family:"'+appliedFamily+'", '+payload.generic+' !important');
        // Preserve site bold semantics; weight override is applied via a separate rule to non-strong/b only
        if (payload.fontSizePx !== null && payload.fontSizePx !== undefined) decl.push('font-size:'+payload.fontSizePx+'px !important');
        if (payload.lineHeight !== null && payload.lineHeight !== undefined) decl.push('line-height:'+payload.lineHeight+' !important');
        if (payload.wdthVal !== null && payload.wdthVal !== undefined) decl.push('font-stretch:'+payload.wdthVal+'% !important');
        if (payload.italVal !== null && payload.italVal !== undefined && payload.italVal >= 1) decl.push('font-style:italic !important');
        else if (payload.slntVal !== null && payload.slntVal !== undefined && payload.slntVal !== 0) decl.push('font-style:oblique '+payload.slntVal+'deg !important');
        if (payload.varPairs && payload.varPairs.length){
          var v = payload.varPairs.map(function(a){ return '"'+a.tag+'" '+a.value; }).join(', ');
          decl.push('font-variation-settings:'+v+' !important');
        }
        var css = sel+'{'+decl.join('; ')+';}';
        if (payload && payload.fontWeight !== null && payload.fontWeight !== undefined) {
          var selWeight = sel + ':not(strong):not(b)';
          // Build var settings including wght along with any other per-axis values
          var vparts = (payload.varPairs || []).slice();
          var seenW = false;
          for (var i=0;i<vparts.length;i++){ if (vparts[i] && String(vparts[i].tag) === 'wght') { seenW = true; vparts[i] = { tag: 'wght', value: Number(payload.fontWeight) }; } }
          if (!seenW) vparts.push({ tag: 'wght', value: Number(payload.fontWeight) });
          var vstr = vparts.map(function(a){ return '"'+a.tag+'" '+a.value; }).join(', ');
          css += '\n' + selWeight + '{font-weight:'+payload.fontWeight+' !important; font-variation-settings:'+vstr+' !important;}';
          // Reassert bold for strong/b and all descendants after the non-bold override
          var vpartsBold = (payload.varPairs || []).filter(function(a){ return a && String(a.tag) !== 'wght'; }).slice();
          vpartsBold.push({ tag: 'wght', value: 700 });
          var vstrBold = vpartsBold.map(function(a){ return '"'+a.tag+'" '+a.value; }).join(', ');
          css += '\nstrong:not(#affo-guard), strong:not(#affo-guard) *,' + 
                 ' b:not(#affo-guard), b:not(#affo-guard) * { font-weight:700 !important; font-variation-settings:'+vstrBold+' !important; }';
        }
        return css;
      }
      
      (async function(){
        try {
          // Enforce per-domain policies from options (handles older saved payloads)
          try {
            var host = (location && location.hostname ? String(location.hostname).toLowerCase() : '');
            var opt = await browser.storage.local.get(['affoFontFaceOnlyDomains']);
            var ffList = Array.isArray(opt.affoFontFaceOnlyDomains) ? opt.affoFontFaceOnlyDomains : ['x.com'];
            var inFF = !!ffList.find(function(d){ var dom=String(d||'').toLowerCase().trim(); return dom && (host===dom || host.endsWith('.'+dom)); });
            if (inFF) payload.fontFaceOnly = true;
          } catch(_){ }
          // User-configured lists are for classification only now; no guarding here.
          // Heuristically guard “fake blockquote” callouts with inline left borders
          try {
            function tagGuard(el){
              try {
                el.setAttribute('data-affo-guard','1');
                try { el.querySelectorAll('*').forEach(function(n){ try{ n.setAttribute('data-affo-guard','1'); }catch(_){} }); } catch(_){ }
              } catch(_){ }
            }
            function scanGuards(root){
              var scope = root || document;
              var guardCandidates = scope.querySelectorAll('[style*="border-left"]');
              guardCandidates.forEach(function(el){
                try {
                  var s = String(el.getAttribute('style')||'').toLowerCase();
                  if ((/border-left-style\s*:\s*solid/.test(s) || /border-left\s*:\s*\d/.test(s)) &&
                      (/border-left-width\s*:\s*\d/.test(s) || /border-left\s*:\s*\d/.test(s))) {
                    tagGuard(el);
                  }
                } catch(_){}
              });
            }
            scanGuards(document);
            // Observe brief post-load mutations to catch late-rendered content
            try {
              var mo = new MutationObserver(function(muts){
                muts.forEach(function(m){ (m.addedNodes||[]).forEach(function(n){ try{
                      if (n && n.nodeType === 1) scanGuards(n); 
                    } catch(_){}
                  });
                });
              });
              mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
              setTimeout(function(){ try{ mo.disconnect(); }catch(_){} }, 8000);
            } catch(_){ }
          } catch(_){}
          // If css2Url is present, use Google Fonts path; otherwise try custom loader
          if (payload.css2Url) {
            const cssResp = await browser.runtime.sendMessage({ type: 'affoFetch', url: payload.css2Url, binary: false });
            if (!cssResp || !cssResp.ok) throw new Error('css2 fetch failed');
            const cssText = String(cssResp.data || '');
            // Find @font-face blocks
            var blocks = cssText.split('@font-face').slice(1);
            var wantItalic = !!(payload.italVal !== null && payload.italVal !== undefined && payload.italVal >= 1);
            // On FontFace-only domains or when ital is desired, load both normal and italic (if present)
            var stylesToLoad = (payload.fontFaceOnly || wantItalic) ? ['normal','italic'] : ['normal'];
            try { window.__affoGFLoaded = window.__affoGFLoaded || {}; } catch(_){}
            async function loadFromBlock(block, styleWanted){
              if (!block) return false;
              // Extract first woff2/woff URL
              var m = block.match(/url\(([^)]+\.(?:woff2|woff)[^)]*)\)/i);
              if (!m) return false;
              var url = m[1].trim();
              if ((url[0]==='"' && url[url.length-1]==='"') || (url[0]==="'" && url[url.length-1]==="'")) url = url.slice(1,-1);
              var key = payload.fontName + '|' + styleWanted + '|' + url;
              try { if (window.__affoGFLoaded && window.__affoGFLoaded[key]) return true; } catch(_){ }
              const binResp = await browser.runtime.sendMessage({ type: 'affoFetch', url: url, binary: true });
              if (!binResp || !binResp.ok || !Array.isArray(binResp.data)) return false;
              const u8 = new Uint8Array(binResp.data);
              const src = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
              // Derive descriptors from @font-face
              var styleDesc = ((block.match(/font-style\s*:\s*(italic|normal)/i)||[])[1]||styleWanted||'normal').toLowerCase();
              var wMatch = block.match(/font-weight\s*:\s*(\d{2,3})(?:\s+(\d{2,3}))?/i);
              var weightDesc = '400';
              if (wMatch) { weightDesc = wMatch[2] ? (wMatch[1] + ' ' + wMatch[2]) : wMatch[1]; }
              var sMatch = block.match(/font-stretch\s*:\s*([0-9]+(?:\.[0-9]+)?%)(?:\s+([0-9]+(?:\.[0-9]+)?%))?/i);
              var stretchDesc = null;
              if (sMatch) { stretchDesc = sMatch[2] ? (sMatch[1] + ' ' + sMatch[2]) : sMatch[1]; }
              var desc = { style: styleDesc, weight: weightDesc, display: 'swap' };
              if (stretchDesc) desc.stretch = stretchDesc;
              const ff = new FontFace(appliedFamily, src, desc);
              await ff.load();
              document.fonts.add(ff);
              try { if (window.__affoGFLoaded) window.__affoGFLoaded[key] = true; } catch(_){ }
              return true;
            }
            for (var si = 0; si < stylesToLoad.length; si++){
              var sw = stylesToLoad[si];
              var matchingBlocks = [];
              for (var i=0;i<blocks.length;i++){
                var b = blocks[i];
                var isItalic = /font-style:\s*italic/i.test(b);
                var isNormal = /font-style:\s*normal/i.test(b);
                if ((sw === 'italic' && isItalic) || (sw === 'normal' && isNormal)) {
                  matchingBlocks.push(b);
                }
              }

              if (matchingBlocks.length > 0) {
                for (var j=0; j<matchingBlocks.length; j++) {
                  try { await loadFromBlock(matchingBlocks[j], sw); } catch(_){ }
                }
              } else if (blocks.length > 0) {
                try { await loadFromBlock(blocks[0], sw); } catch(_){ }
              }
            }
            try { await document.fonts.ready; } catch(e) {}
            // If nothing loaded and allowed, fall back to adding a css2 <link>
            if (!payload.fontFaceOnly) {
              try {
                var anyKey = payload.fontName + '|';
                var anyLoaded = false;
                try {
                  var map = window.__affoGFLoaded || {};
                  anyLoaded = Object.keys(map).some(function(k){ return k.indexOf(anyKey) === 0; });
                } catch(_){ }
                if (!anyLoaded) {
                  var linkId = (payload.linkId || (payload.styleId+'-link'));
                  if (!document.getElementById(linkId)){
                    var l = document.createElement('link'); l.id = linkId; l.rel='stylesheet'; l.href=payload.css2Url; document.documentElement.appendChild(l);
                  }
                }
              } catch(_){}
            }
          } else {
            await loadCustomIfNeeded();
          }
        } catch (e) {
          // Last resort: try custom loader if applicable, otherwise inject link to css2
          try {
            await loadCustomIfNeeded();
          } catch(_){ }
          if (payload.css2Url && !payload.fontFaceOnly) {
            try {
              var linkId2 = (payload.linkId || (payload.styleId+'-link'));
              if (!document.getElementById(linkId2)){
                var l2 = document.createElement('link'); l2.id = linkId2; l2.rel='stylesheet'; l2.href=payload.css2Url; document.documentElement.appendChild(l2);
              }
            } catch(_){ }
          }
        }
        
        var existing = document.getElementById(payload.styleId);
        if (existing){ existing.textContent = buildCSS(); return; }
        var st = document.createElement('style'); st.id = payload.styleId; st.textContent = buildCSS(); document.documentElement.appendChild(st);
        try {
          // Keep our style last in the cascade to resist SPA hydration and route updates
          var moving = false;
          function moveLast(){
            if (moving) return; moving = true;
            try {
              var n = document.getElementById(payload.styleId);
              if (n && n.parentNode) { n.parentNode.appendChild(n); }
            } catch(_){ }
            setTimeout(function(){ moving = false; }, 50);
          }
          // Watch for new <style>/<link> insertions for longer window
          var mo2 = new MutationObserver(function(muts){
            for (var i=0;i<muts.length;i++){
              var m = muts[i];
              if (m.type === 'childList'){
                var added = Array.from(m.addedNodes || []);
                if (added.some(function(x){ return x && x.nodeType===1 && (x.nodeName==='STYLE' || x.nodeName==='LINK'); })){
                  moveLast();
                  break;
                }
              }
            }
          });
          mo2.observe(document.documentElement || document, { childList: true, subtree: true });
          // Extend window to 60s
          setTimeout(function(){ try{ mo2.disconnect(); }catch(_){ } }, 60000);
          // Re-append on SPA navigations (history API + back/forward)
          try {
            var _ps = history.pushState;
            history.pushState = function(){ var r = _ps.apply(this, arguments); try{ moveLast(); }catch(_){ } return r; };
          } catch(_){ }
          try {
            var _rs = history.replaceState;
            history.replaceState = function(){ var r = _rs.apply(this, arguments); try{ moveLast(); }catch(_){ } return r; };
          } catch(_){ }
          try { window.addEventListener('popstate', function(){ try{ moveLast(); }catch(_){ } }, true); } catch(_){ }
        } catch(_){ }
      })();
    } catch (e) {}
  }

  try {
    if (!window || !window.location || !/^https?:/.test(location.protocol)) return;
    var origin = location.origin;
    browser.storage.local.get('affoApplyMap').then(function(data){
      var map = data && data.affoApplyMap ? data.affoApplyMap : {};
      var entry = map[origin];
      // If nothing saved for this origin, remove any stale nodes and stop
      if (!entry) {
        ['a-font-face-off-style-serif','a-font-face-off-style-sans'].forEach(function(id){ try { var n=document.getElementById(id); if(n) n.remove(); } catch(e){} });
        return;
      }
      if (entry.serif) {
        inject(entry.serif);
      } else {
        try{ var s=document.getElementById('a-font-face-off-style-serif'); if(s) s.remove(); }catch(e){}
      }
      if (entry.sans) {
        inject(entry.sans);
      } else {
        try{ var s2=document.getElementById('a-font-face-off-style-sans'); if(s2) s2.remove(); }catch(e){}
      }
    }).catch(function(){});
  } catch (e) {}
  try {
    browser.storage.onChanged.addListener(function(changes, area){
      if (area !== 'local' || !changes.affoApplyMap) return;
      try {
        var origin = location.origin;
        var newMap = changes.affoApplyMap.newValue || {};
        var entry = newMap[origin];
        ['a-font-face-off-style-serif','a-font-face-off-style-sans'].forEach(function(id){ try { var n=document.getElementById(id); if(n) n.remove(); } catch(e){} });
        if (!entry) return;
        if (entry.serif) inject(entry.serif);
        if (entry.sans) inject(entry.sans);
      } catch (e) {}
    });
  } catch (e) {}
})();
