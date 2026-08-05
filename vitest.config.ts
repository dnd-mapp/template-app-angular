import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        browser: {
            provider: playwright(),
            screenshotFailures: false,
        },
        clearMocks: true,
        coverage: {
            provider: 'v8',
            reportOnFailure: true,
        },
        globals: true,
        name: 'template-app-angular',
        open: false,
        sequence: {
            shuffle: true,
        },
    },
});
