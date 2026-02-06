import js from "@eslint/js";

export default [
    // Ignore non-source directories and third-party files
    {
        ignores: [
            "node_modules/",
            "web-ext-artifacts/",
            "zothercode/",
            "data/",
            "jquery.js",
            "whatfont_core.js",
            "eslint.config.js",
        ],
    },

    // Extension source files (browser context), excluding files with their own config
    {
        files: ["*.js"],
        ignores: ["config-utils.js", "css-generators.js", "favorites.js", "font-picker.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                // Browser
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
                // Used in whatfont_core.js
                Tip: "writable",
                // From config-utils.js (loaded before popup.js)
                REGISTERED_AXES: "readonly",
                normalizeConfig: "readonly",
                determineButtonState: "readonly",
                getEffectiveWeight: "readonly",
                getEffectiveWidth: "readonly",
                getEffectiveSlant: "readonly",
                getEffectiveItalic: "readonly",
                buildCustomAxisSettings: "readonly",
                // From css-generators.js (loaded before popup.js)
                formatAxisValue: "readonly",
                getSiteSpecificRules: "readonly",
                generateBodyCSS: "readonly",
                generateBodyContactCSS: "readonly",
                generateThirdManInCSS: "readonly",
                generateElementWalkerScript: "readonly",
                // From favorites.js (loaded before popup.js)
                loadFavoritesFromStorage: "readonly",
                saveFavoritesToStorage: "readonly",
                hasInCollection: "readonly",
                getOrderedFavoriteNames: "readonly",
                generateFavoritePreview: "readonly",
                generateDetailedFavoritePreview: "readonly",
                generateFontConfigName: "readonly",
                generateConfigPreview: "readonly",
                showSaveModal: "readonly",
                hideSaveModal: "readonly",
                showFavoritesPopup: "readonly",
                hideFavoritesPopup: "readonly",
                showEditFavoritesModal: "readonly",
                hideEditFavoritesModal: "readonly",
                enableFavoritesReorder: "readonly",
                getDragAfterElement: "readonly",
                persistFavoritesOrder: "readonly",
                // From font-picker.js (loaded before popup.js)
                getFamiliesFromMetadata: "readonly",
                initializeGoogleFontsSelects: "readonly",
                resolveFamilyCase: "readonly",
                setupFontPicker: "readonly",
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
        files: ["config-utils.js"],
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
        files: ["css-generators.js"],
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
            },
        },
        rules: {
            "no-undef": "error",
            "no-console": "off",
        },
    },

    // favorites.js — depends on config-utils.js, css-generators.js, popup.js globals
    {
        files: ["favorites.js"],
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
                // From config-utils.js
                normalizeConfig: "readonly",
                // From css-generators.js
                formatAxisValue: "readonly",
                // From popup.js (loaded after, but these are hoisted or available at call time)
                savedFavorites: "writable",
                savedFavoritesOrder: "writable",
                currentViewMode: "readonly",
                getCurrentUIConfig: "readonly",
                getEffectiveFontDefinition: "readonly",
                applyFontConfig: "readonly",
                updateBodyButtons: "readonly",
                updateAllThirdManInButtons: "readonly",
                saveExtensionState: "readonly",
                refreshApplyButtonsDirtyState: "readonly",
                showCustomConfirm: "readonly",
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

    // font-picker.js — font picker modal, Google Fonts init, family resolution
    {
        files: ["font-picker.js"],
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
                // From favorites.js
                loadFavoritesFromStorage: "readonly",
                savedFavorites: "readonly",
                // From popup.js (available at call time)
                gfMetadata: "readonly",
                ensureGfMetadata: "readonly",
                ensureCustomFontsLoaded: "readonly",
                CUSTOM_FONTS: "readonly",
                getPanelLabel: "readonly",
                loadFont: "readonly",
                applyFont: "readonly",
                getCurrentUIConfig: "readonly",
                updateBodyButtons: "readonly",
                updateAllThirdManInButtons: "readonly",
                refreshApplyButtonsDirtyState: "readonly",
                currentViewMode: "readonly",
                initializationComplete: "readonly",
                saveFontSettings: "readonly",
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
];
