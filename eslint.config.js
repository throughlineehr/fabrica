import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // bus.js is the sole transport seam — channel name formats live
      // there. Anywhere else constructing literal "room:..." or "proc:..."
      // strings is the kind of drift that broke wiring.js (audit
      // 2026-04-23). Use roomChannel() / eventsChannel() / publishToRoom().
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^room:/]",
          message: "Don't construct room: channel strings directly. Use roomChannel() or publishToRoom() from src/signals/bus.js.",
        },
        {
          selector: "Literal[value=/^proc:/]",
          message: "Don't construct proc: channel strings directly. Use eventsChannel() from src/signals/bus.js.",
        },
        {
          selector: "TemplateElement[value.cooked=/^room:/]",
          message: "Don't construct room: channel strings directly. Use roomChannel() or publishToRoom() from src/signals/bus.js.",
        },
        {
          selector: "TemplateElement[value.cooked=/^proc:/]",
          message: "Don't construct proc: channel strings directly. Use eventsChannel() from src/signals/bus.js.",
        },
      ],
    },
  },
  {
    // bus.js is the one place these literals are allowed — it owns
    // the channel name format.
    files: ['src/signals/bus.js'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Node-side processes: relay server, connectors, dev scripts.
    files: ['server/**/*.js', 'connectors/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
