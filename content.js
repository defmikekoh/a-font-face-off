// Content script: re-apply saved fonts on page load for this origin
(function(){
  function inject(payload){
    try {
      // For Google Fonts payloads, ensure a css2 <link> is present to start font download quickly
      try {
        var linkId = payload.linkId || (payload.styleId + '-link');
        if (linkId && payload.css2Url) {
          var l = document.getElementById(linkId);
          if (!l) { l = document.createElement('link'); l.id = linkId; l.rel = 'stylesheet'; l.href = payload.css2Url; document.documentElement.appendChild(l); }
        }
      } catch (_) {}
      async function loadCustomIfNeeded(){
        try {
          if (payload && payload.fontName === 'BBC Reith Serif'){
            // Choose style and weight
            var ital = !!(payload.italVal !== null && payload.italVal !== undefined && Number(payload.italVal) >= 1);
            var target = Number(payload.fontWeight);
            if (!isFinite(target)) target = 400;
            var candidates = [300,400,500,700,800];
            var best = candidates.reduce(function(p, c){ return Math.abs(c - target) < Math.abs(p - target) ? c : p; }, candidates[0]);
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
            var url = urlFor(best, ital);
            // Fetch via background to avoid page CSP font-src restrictions
            var binResp = await browser.runtime.sendMessage({ type: 'affoFetch', url: url, binary: true });
            if (binResp && binResp.ok && Array.isArray(binResp.data)){
              var u8 = new Uint8Array(binResp.data);
              var desc = { weight: String(best), style: ital ? 'italic' : 'normal' };
              try {
                var ff = new FontFace(payload.fontName, u8, desc);
                await ff.load();
                document.fonts.add(ff);
              } catch (e) {}
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
            var target = Number(payload.fontWeight);
            if (!isFinite(target)) target = 400;
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
                var desc = { weight: String(best.w), style: best.isItalic ? 'italic' : 'normal' };
                try {
                  var ff = new FontFace(payload.fontName, u8, desc);
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
        // High-specificity guard: :not(#affo-guard) boosts specificity without excluding elements
        var sel = 'body:not(#affo-guard), body :not(#affo-guard):not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(pre):not(code):not(kbd):not(samp):not(tt):not(button):not(input):not(select):not(textarea):not(header):not(nav):not(footer):not(aside):not(label):not([role="navigation"]):not([role="banner"]):not([role="contentinfo"]):not([role="complementary"]):not(.code):not(.hljs):not(.token):not(.monospace):not(.mono):not(.terminal):not([class^="language-"]):not([class*=" language-"]):not(.prettyprint):not(.prettyprinted):not(.sourceCode):not(.wp-block-code):not(.wp-block-preformatted):not(.small-caps):not(.smallcaps):not(.smcp):not(.sc):not(.site-header):not(.sidebar):not(.toc)';
        var decl = [];
        decl.push('font-family:"'+payload.fontName+'", '+payload.generic+' !important');
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
          // If css2Url is present, use Google Fonts path; otherwise try custom loader
          if (payload.css2Url) {
            const cssResp = await browser.runtime.sendMessage({ type: 'affoFetch', url: payload.css2Url, binary: false });
            if (!cssResp || !cssResp.ok) throw new Error('css2 fetch failed');
            const cssText = String(cssResp.data || '');
            // Choose the @font-face block that matches desired italic/normal
            var blocks = cssText.split('@font-face').slice(1);
            var wantItalic = !!(payload.italVal !== null && payload.italVal !== undefined && payload.italVal >= 1);
            var chosen = null;
            for (var i=0;i<blocks.length;i++){
              var b = blocks[i];
              var isItalic = /font-style:\s*italic/i.test(b);
              var isNormal = /font-style:\s*normal/i.test(b);
              if ((wantItalic && isItalic) || (!wantItalic && isNormal)) { chosen = b; break; }
            }
            if (!chosen) chosen = blocks[0] || '';
            var m = chosen && chosen.match(/url\(([^)]+\.woff2[^)]*)\)/i);
            if (m) {
              let url = m[1].trim();
              if ((url[0]==='"' && url[url.length-1]==='"') || (url[0]==="'" && url[url.length-1]==="'")) url = url.slice(1,-1);
              const binResp = await browser.runtime.sendMessage({ type: 'affoFetch', url: url, binary: true });
              if (!binResp || !binResp.ok || !Array.isArray(binResp.data)) throw new Error('woff2 fetch failed');
              const u8 = new Uint8Array(binResp.data);
              const ff = new FontFace(payload.fontName, u8);
              await ff.load();
              document.fonts.add(ff);
              try { await document.fonts.ready; } catch(e) {}
            } else {
              // As a fallback, let the browser try to load via a link
              try {
                var linkId = (payload.linkId || (payload.styleId+'-link'));
                if (!document.getElementById(linkId)){
                  var l = document.createElement('link'); l.id = linkId; l.rel='stylesheet'; l.href=payload.css2Url; document.documentElement.appendChild(l);
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
          if (payload.css2Url) {
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
