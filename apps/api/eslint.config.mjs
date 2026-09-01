import base from '@tracker/eslint-config/base';

export default [
  { ignores: ['dist/**'] },
  ...base,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
];
