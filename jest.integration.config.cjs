module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test/integration"],
  testMatch: ["**/*.int.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  setupFiles: ["<rootDir>/test/integration/env.ts"],
  testTimeout: 30000,
  maxWorkers: 1,
  forceExit: true,
};
