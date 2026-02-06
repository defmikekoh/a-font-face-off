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
            "eslint.config.js",
        ],
    },

    // Extension source files (browser context)
    {
        files: ["*.js"],
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
