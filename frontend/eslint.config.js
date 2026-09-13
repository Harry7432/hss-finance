import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import neostandard from 'neostandard';

const sourceFiles = ['**/*.{js,jsx,ts,tsx}'];

export default [
  ...neostandard({
    ts: true,
    noStyle: true,
    ignores: ['coverage/**', 'dist/**'],
  }),
  {
    ...reactHooks.configs.flat.recommended,
    files: sourceFiles,
  },
  {
    ...reactRefresh.configs.vite,
    files: ['src/**/*.{ts,tsx}'],
  },
];
