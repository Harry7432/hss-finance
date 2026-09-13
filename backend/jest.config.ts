import { createDefaultEsmPreset, type JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest = {
  ...createDefaultEsmPreset(),
  clearMocks: true,
  coverageDirectory: 'coverage',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
};

export default config;
