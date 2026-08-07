import { defineConfig } from 'vitest/config';

const isCI = Boolean(process.env['CI']);

export default defineConfig({
    test: {
        clearMocks: true,
        coverage: {
            enabled: true,
            exclude: ['index.ts', 'vitest.config.ts'],
            include: ['**/*.ts'],
            provider: 'v8',
            reporter: [['html', { subdir: '.' }], 'text-summary'],
            reportOnFailure: true,
            reportsDirectory: 'coverage',
            thresholds: {
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80,
            },
        },
        environment: 'node',
        globals: true,
        include: ['**/*.spec.ts'],
        name: '@dnd-mapp/changelog',
        open: false,
        reporters: [...(isCI ? ['github-actions'] : []), 'dot', ['html', { outputFile: 'reports/index.html' }]],
        root: __dirname,
        sequence: {
            shuffle: true,
        },
    },
});
