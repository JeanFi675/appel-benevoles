import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'supabase/**',
            'archive/**',
            'backups/**',
            'audit/**',
            'tests/**',
            'data/**',
        ],
    },
    js.configs.recommended,
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                Alpine: 'readonly',
                QRCode: 'readonly',
                Html5Qrcode: 'readonly',
                Html5QrcodeSupportedFormats: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': [
                'error',
                {
                    vars: 'all',
                    args: 'none',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                },
            ],
            'no-undef': 'off',
            'no-empty': 'off',
            'no-prototype-builtins': 'off',
            'no-useless-escape': 'off',
            'no-cond-assign': 'off',
            'no-fallthrough': 'off',
            'no-self-assign': 'off',
            'no-control-regex': 'off',
            'no-misleading-character-class': 'off',
            'no-constant-condition': 'off',
            'no-unsafe-optional-chaining': 'off',
            'no-extra-boolean-cast': 'off',
            'no-async-promise-executor': 'off',
            'no-inner-declarations': 'off',
            'no-redeclare': 'off',
            'getter-return': 'off',
            'no-case-declarations': 'off',
        },
    },
];
