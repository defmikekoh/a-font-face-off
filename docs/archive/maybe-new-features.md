Dedicated Headings Mode
Font Changer has an explicit headings context targeting h1-h6 only. AFFO’s Body Contact deliberately excludes headings, and TMI also resets heading typography inside marked trees. A “Headings Contact” mode could be genuinely useful for pairing body and headline fonts.
See fontChange.js (line 206).

Percent-Based Font Size Scaling
Font Changer scales each matched element from its computed original size. AFFO mostly applies absolute px sizes. Scaling preserves a site’s existing hierarchy better, though Font Changer does it by inline mutation, which is fragile.
See fontChange.js (line 117).

Word Spacing And Text Transform
AFFO has letter spacing and line height, but not word-spacing or text-transform. Word spacing could be useful for readability testing. Text transform is more of a designer toy and can hurt content semantics, but it is occasionally useful.
See font_changer.html (line 94).

Recent Fonts
AFFO has richer favorites, Quick Pick, and sync, but Font Changer has a simple “recent fonts” list. That is a low-friction UX feature AFFO could probably benefit from.
See font_changer.js (line 396).

Category Filter Buttons
Font Changer exposes simple Serif/Sans/Mono/Display/Script filters. AFFO has Google metadata, but I don’t see an equivalent obvious category-filter affordance in the popup. This could make browsing faster.
See font_changer.html (line 27).

Protected-Site Warning
It detects browser-protected sites and shows a user-facing warning instead of failing mysteriously. The implementation has bugs, but the UX idea is good.
See font_changer.js (line 1015).

Edge popup: virtual scrolling, lazy font preview loading, sort toggle, and All/Recent/Favorites tabs.
