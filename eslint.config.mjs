import js from "@eslint/js";

export default [
    // Ignore non-source directories and third-party files
    {
        ignores: [
            "node_modules/",
            "web-ext-artifacts/",
            "zothercode/",
            "data/",
            "src/jquery.js",
            "src/gdrive-config.js",
            "src/gdrive-config.example.js",
            "eslint.config.js",
        ],
    },

    // Extension source files (browser context), excluding files with their own config
    {
        files: ["src/popup-context.js", "src/browser-api.js", "src/*.js"],
        ignores: ["src/config-utils.js", "src/css-generators.js", "src/font-url-utils.js", "src/font-face-utils.js", "src/local-font-utils.js", "src/sroulette-utils.js", "src/site-detection-utils.js", "src/block-javascript-utils.js", "src/popup-panel-utils.js", "src/content-sroulette-runtime.js", "src/background-font-runtime.js", "src/favorites.js", "src/font-picker.js", "src/whatfont_core.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                // Browser
                globalThis: "readonly",
                self: "readonly",
                window: "readonly",
                document: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                fetch: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                Blob: "readonly",
                FileReader: "readonly",
                FontFace: "readonly",
                Image: "readonly",
                CustomEvent: "readonly",
                NodeFilter: "readonly",
                MutationObserver: "readonly",
                MessageChannel: "readonly",
                ResizeObserver: "readonly",
                HTMLElement: "readonly",
                Event: "readonly",
                KeyboardEvent: "readonly",
                MouseEvent: "readonly",
                requestAnimationFrame: "readonly",
                cancelAnimationFrame: "readonly",
                getComputedStyle: "readonly",
                matchMedia: "readonly",
                performance: "readonly",
                navigator: "readonly",
                location: "readonly",
                history: "readonly",
                parent: "readonly",
                caches: "readonly",
                crypto: "readonly",
                atob: "readonly",
                btoa: "readonly",
                alert: "readonly",
                confirm: "readonly",
                TextEncoder: "readonly",
                TextDecoder: "readonly",
                AbortController: "readonly",
                Headers: "readonly",
                Request: "readonly",
                Response: "readonly",
                // WebExtension
                browser: "readonly",
                chrome: "readonly",
                // From gdrive-config.js (loaded before background.js)
                GDRIVE_CLIENT_ID: "readonly",
                GDRIVE_CLIENT_SECRET: "readonly",
                // From config-utils.js (loaded before popup.js)
                REGISTERED_AXES: "readonly",
                normalizeConfig: "readonly",
                determineButtonState: "readonly",
                getEffectiveWeight: "readonly",
                getEffectiveWidth: "readonly",
                getEffectiveSlant: "readonly",
                getEffectiveItalic: "readonly",
                buildCustomAxisSettings: "readonly",
                buildAllAxisSettings: "readonly",
                // From css-generators.js (loaded before popup.js)
                formatAxisValue: "readonly",
                getSiteSpecificRules: "readonly",
                generateBodyCSS: "readonly",
                generateBodyContactCSS: "readonly",
                generateThirdManInCSS: "readonly",
                // From font-url-utils.js (loaded before popup.js/background.js)
                affoParseGfMetadataText: "readonly",
                affoGetMetadataFamilies: "readonly",
                affoBuildPlainCss2Url: "readonly",
                affoBuildCss2AxisRangesFromMetadata: "readonly",
                affoBuildCss2UrlFromMetadata: "readonly",
                // From local-font-utils.js
                AFFOLocalFontUtils: "readonly",
                // From sroulette-utils.js
                AFFOSroulette: "readonly",
                // From site-detection-utils.js
                AFFOSiteDetection: "readonly",
                // From block-javascript-utils.js
                AFFOBlockJavascriptUtils: "readonly",
                // From popup-panel-utils.js
                AFFOPopupPanelUtils: "readonly",
                // From content-sroulette-runtime.js
                AFFOContentSroulette: "readonly",
                // From background-font-runtime.js
                AFFOBackgroundFontRuntime: "readonly",

                // Popup UI module factories
                AFFOFavorites: "readonly",
                AFFOFontPicker: "readonly",
                // From whatfont_core.js (loaded before content.js)
                _whatFont: "readonly",
            },
        },
        rules: {
            // Catch real bugs
            "no-undef": "error",
            "no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_|^e$|^err$|^error$",
            }],
            "no-redeclare": "error",
            "no-dupe-keys": "error",
            "no-duplicate-case": "error",
            "no-unreachable": "error",
            "no-constant-condition": "warn",
            "no-empty": ["warn", { allowEmptyCatch: true }],
            "use-isnan": "error",
            "valid-typeof": "error",
            "no-self-assign": "error",
            "no-self-compare": "error",
            "eqeqeq": ["warn", "smart"],

            // Turn off things that would just generate noise
            "no-console": "off",
            "no-prototype-builtins": "off",
        },
    },

    // config-utils.js — dual browser/Node; needs module for conditional export
    {
        files: ["src/config-utils.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                console: "readonly",
                isFinite: "readonly",
                module: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
            "no-console": "off",
        },
    },

    // css-generators.js — depends on config-utils.js; dual browser/Node
    {
        files: ["src/css-generators.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                window: "readonly",
                console: "readonly",
                isFinite: "readonly",
                module: "readonly",
                // From config-utils.js
                getEffectiveWeight: "readonly",
                getEffectiveWidth: "readonly",
                getEffectiveSlant: "readonly",
                getEffectiveItalic: "readonly",
                buildCustomAxisSettings: "readonly",
                buildAllAxisSettings: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
            "no-console": "off",
        },
    },

    // font-url-utils.js — pure browser/Node helpers for Google Fonts CSS2 URLs
    {
        files: ["src/font-url-utils.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                isFinite: "readonly",
                module: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
        },
    },

    // local-font-utils.js — pure browser/Node helpers for local font names
    {
        files: ["src/local-font-utils.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                globalThis: "readonly",
                module: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
        },
    },

    // font-face-utils.js — pure browser/Node helpers for @font-face parsing
    {
        files: ["src/font-face-utils.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                globalThis: "readonly",
                module: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
        },
    },

    // sroulette-utils.js — pure browser/Node helpers for Substack Roulette state
    {
        files: ["src/sroulette-utils.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                globalThis: "readonly",
                module: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
        },
    },

    // site-detection-utils.js — pure browser/Node helpers for site identity signals
    {
        files: ["src/site-detection-utils.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                globalThis: "readonly",
                module: "readonly",
                URL: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
        },
    },

    // content-sroulette-runtime.js — content-script Sroulette materialization and CSS tracking helpers
    {
        files: ["src/content-sroulette-runtime.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                globalThis: "readonly",
                module: "readonly",
                browser: "readonly",
                console: "readonly",
                AFFOSroulette: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_|^e$|^err$|^error$",
            }],
            "no-console": "off",
        },
    },

    // block-javascript-utils.js — pure browser/Node helpers for domain CSP policy
    {
        files: ["src/block-javascript-utils.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                globalThis: "readonly",
                module: "readonly",
                URL: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
        },
    },

    // popup-panel-utils.js — popup panel state, Sroulette, and Apply All planning helpers
    {
        files: ["src/popup-panel-utils.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                globalThis: "readonly",
                module: "readonly",
                Set: "readonly",
                Object: "readonly",
                Array: "readonly",
                Number: "readonly",
                AFFOSroulette: "readonly",
                normalizeConfig: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_|^e$|^err$|^error$",
            }],
        },
    },

    // background-font-runtime.js — background font fetch/cache and CSS2 URL resolution
    {
        files: ["src/background-font-runtime.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                globalThis: "readonly",
                module: "readonly",
                browser: "readonly",
                fetch: "readonly",
                console: "readonly",
                performance: "readonly",
                Date: "readonly",
                Map: "readonly",
                Object: "readonly",
                Array: "readonly",
                Uint8Array: "readonly",
                AbortController: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                affoParseGfMetadataText: "readonly",
                affoGetMetadataFamilies: "readonly",
                affoBuildCss2UrlFromMetadata: "readonly",
                AFFOFontFaceUtils: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_|^e$|^err$|^error$",
            }],
            "no-console": "off",
        },
    },

    // favorites.js — private state, explicit popup callbacks, shared pure helpers
    // Browser factory and Node helper exports share the same implementation.
    {
        files: ["src/favorites.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                window: "readonly",
                document: "readonly",
                console: "readonly",
                module: "readonly",
                clearInterval: "readonly",
                setInterval: "readonly",
                // WebExtension
                browser: "readonly",
                // From sroulette-utils.js
                AFFOSroulette: "readonly",
                // From config-utils.js
                normalizeConfig: "readonly",
                // From css-generators.js
                formatAxisValue: "readonly",
                AFFOMessaging: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": "off",
            "no-console": "off",
        },
    },

    // font-picker.js — font picker modal, Google Fonts init, family resolution
    // Browser factory and Node helper exports share the same implementation.
    {
        files: ["src/font-picker.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                window: "readonly",
                document: "readonly",
                console: "readonly",
                module: "readonly",
                setTimeout: "readonly",
                requestAnimationFrame: "readonly",
                // WebExtension
                browser: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": "off",
            "no-console": "off",
        },
    },

    // whatfont_core.js — font detection overlay (browser context, uses jQuery)
    {
        files: ["src/whatfont_core.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                window: "readonly",
                document: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                Image: "readonly",
                jQuery: "readonly",
                parseFloat: "readonly",
                isFinite: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_|^e$|^err$|^error$",
            }],
            "no-console": "off",
            "no-prototype-builtins": "off",
        },
    },

    // Build/tooling scripts (Node context)
    {
        files: ["scripts/**/*.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                require: "readonly",
                module: "readonly",
                exports: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                process: "readonly",
                console: "readonly",
                Buffer: "readonly",
                setTimeout: "readonly",
                URL: "readonly",
            },
        },
        rules: {
            "no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_|^e$|^err$|^error$",
            }],
            "no-console": "off",
        },
    },

    // Tests (Node context)
    {
        files: ["tests/**/*.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                require: "readonly",
                module: "readonly",
                exports: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                process: "readonly",
                console: "readonly",
                Buffer: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                TextEncoder: "readonly",
                TextDecoder: "readonly",
                crypto: "readonly",
                performance: "readonly",
                btoa: "readonly",
                atob: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_|^e$|^err$|^error$",
            }],
            "no-console": "off",
            "no-prototype-builtins": "off",
        },
    },
];
