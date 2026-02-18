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
        files: ["src/*.js"],
        ignores: ["src/config-utils.js", "src/css-generators.js", "src/favorites.js", "src/font-picker.js", "src/whatfont_core.js"],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                // Browser
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

    // favorites.js — depends on config-utils.js, css-generators.js, popup.js globals
    // All top-level functions are intentional cross-file exports (consumed by popup.js via global scope)
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
            "no-unused-vars": "off",
            "no-console": "off",
        },
    },

    // font-picker.js — font picker modal, Google Fonts init, family resolution
    // All top-level functions are intentional cross-file exports (consumed by popup.js via global scope)
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
                saveFontSettings: "readonly",
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
];
