/**
 * Jest Configuration for PxFx Tests
 */

module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/test/**/*.test.js',
        '**/test/**/*.spec.js'
    ],
    collectCoverageFrom: [
        'lib/**/*.js',
        'pxfx.js',
        '!lib/**/*.test.js',
        '!lib/**/*.spec.js',
        '!**/node_modules/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
        'text',
        'lcov',
        'html'
    ],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70
        }
    },
    setupFilesAfterEnv: [
        '<rootDir>/test/setup.js'
    ],
    testTimeout: 10000,
    verbose: true,
    clearMocks: true,
    restoreMocks: true
};
