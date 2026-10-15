module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['jest.setup.js', 'jest.config.js'],
      env: {
        jest: true,
        node: true,
      },
    },
    {
      files: ['web/**/*.{ts,tsx}'],
      env: {
        browser: true,
        es2021: true,
      },
    },
    {
      files: ['vite.config.mjs'],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      env: {
        node: true,
        es2021: true,
      },
    },
  ],
};
