# Usage

```bash
pnpm start         # Serve the app locally at https://localhost.www.dndmapp.dev:4000
pnpm build         # Production build
pnpm test          # Run unit tests in a real Chromium browser via Vitest + Playwright, with a UI
pnpm test-ci       # Run tests headless, as CI does
pnpm format        # Format all files with Prettier
pnpm format-check  # Check formatting without writing changes
pnpm lint-ts       # Lint TypeScript and HTML files with ESLint
pnpm lint-css      # Lint SCSS files with Stylelint
pnpm lint-md       # Lint Markdown files with markdownlint-cli2
```

The dev server serves over HTTPS using the self-signed certificate in `.ssl/` and only accepts requests to `localhost.www.dndmapp.dev`; map that hostname to `127.0.0.1` in your hosts file before running `pnpm start` by adding this line:

```text
127.0.0.1 localhost.www.dndmapp.dev
```

- **Windows**: edit `C:\Windows\System32\drivers\etc\hosts` in a text editor running as Administrator.
- **macOS/Linux**: append the line with elevated privileges, e.g. `echo '127.0.0.1 localhost.www.dndmapp.dev' | sudo tee -a /etc/hosts`.

Husky and lint-staged run Prettier, ESLint, and markdownlint on staged files before each commit. GitHub Actions runs the build, tests, and formatting/linting checks on every pull request and on pushes to `main` (see [`.github/workflows/`](../../../.github/workflows/)), and validates commit messages against [Conventional Commits](https://www.conventionalcommits.org/) via commitlint.
