import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginReact from 'eslint-plugin-react';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Flat config doesn't read .eslintignore: build output and generated test
  // bundles are ignored here.
  { ignores: ['dist/**', 'out/**', 'scripts/__tests__/m365/.build/**'] },
  { files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'] },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx']
        },
        typescript: {
          project: './tsconfig.json'
        }
      }
    }
  },
  {
    rules: {
      'react/prop-types': 'off', // Disable prop-types as we use TypeScript for type checking
      // `_name` and rest siblings mark a value left out on purpose
      // (`const { [id]: _removed, ...rest } = map`).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ],
      'no-empty-pattern': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-empty-object-type': 'warn'
    }
  },
  {
    settings: {}
  },
  // Node-side scripts and the CommonJS config files at the root.
  {
    files: ['scripts/**/*.{js,mjs,cjs}', '*.config.{js,cjs,mjs}'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  }
];
