module.exports = {
    verbose: true,
    globals: {
        'ts-jest': {
            tsConfig: {
                allowJs: true
            }
        }
    },
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
        '^.+\\.js$': 'ts-jest'
    },
    transformIgnorePatterns: [
        '<rootDir>/node_modules/(?!(lodash-es)/)'
    ],
    setupFiles: ['<rootDir>/jestSetup.ts']
};
