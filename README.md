# dnd-mapp/angular-app-template

Template repository for bootstrapping new Angular-based `dnd-mapp` repositories, with shared tooling, CI, and browser-based testing pre-configured.

## Prerequisites

- [mise](https://mise.jdx.dev/) (recommended): manages the Node.js and pnpm versions this repo pins in `package.json`'s `devEngines` field. Run `mise install` after installing it to pick up matching versions automatically.
- [mkcert](https://github.com/FiloSottile/mkcert): generates the locally trusted HTTPS certificate the dev server uses (see [Installation](#installation)).

## Installation

Click **Use this template** on GitHub to create a new repository from this one. In the new repository, generate the dev server's certificate, then install dependencies (this also sets up the Husky git hooks) and the Chromium browser used for tests:

```bash
mkcert -install
mkcert -cert-file .ssl/cert.pem -key-file .ssl/key.pem localhost.www.dndmapp.dev
pnpm install
pnpm playwright-install-browsers
```

Then update `package.json`'s `name` and `description`, and this README, to match the new repository.

## Editor setup

Configure your editor to run Prettier on save, so files match this repo's `.prettierrc.json` without needing `pnpm format` before every commit.

- **VS Code**: install the recommended [Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) (VS Code prompts for it automatically via `.vscode/extensions.json`), then add to your `settings.json`:

  ```json
  {
      "editor.defaultFormatter": "esbenp.prettier-vscode",
      "editor.formatOnSave": true
  }
  ```

- **WebStorm**: open Settings → Languages & Frameworks → JavaScript → Prettier, and check **Run on save**. WebStorm auto-detects the local `prettier` package and this repo's config.

This repo also lints `.ts` and `.html` files with ESLint (`eslint.config.mjs`, via `angular-eslint`). Configure your editor to surface lint errors inline, and optionally fix them on save:

- **VS Code**: install the recommended [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) (also prompted via `.vscode/extensions.json`). It picks up `eslint.config.mjs` and shows lint errors inline automatically; to also fix them on save, add to your `settings.json`:

  ```json
  {
      "editor.codeActionsOnSave": {
          "source.fixAll.eslint": "explicit"
      }
  }
  ```

- **WebStorm**: open Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint, select **Automatic ESLint configuration**, and check **Run eslint --fix on save**.

Run `pnpm lint-ts` to check the whole project from the command line.

This repo also lints `.scss` files with Stylelint (`.stylelintrc.json`), using `stylelint-config-standard-scss` and `stylelint-config-recess-order` to enforce a consistent property order. Configure your editor to surface lint errors inline, and optionally fix them on save:

- **VS Code**: install the recommended [Stylelint extension](https://marketplace.visualstudio.com/items?itemName=stylelint.vscode-stylelint) (also prompted via `.vscode/extensions.json`). It picks up `.stylelintrc.json` and shows lint errors inline automatically; to also fix them on save, add to your `settings.json`:

  ```json
  {
      "editor.codeActionsOnSave": {
          "source.fixAll.stylelint": "explicit"
      }
  }
  ```

- **WebStorm**: open Settings → Languages & Frameworks → Style Sheets → Stylelint, check **Enable**, select **Automatic Stylelint configuration**, and check **Run Stylelint --fix on save**.

Run `pnpm lint-css` to check the whole project from the command line.

## Usage

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

Husky and lint-staged run Prettier, ESLint, and markdownlint on staged files before each commit. GitHub Actions runs the build, tests, and formatting/linting checks on every pull request and on pushes to `main` (see `.github/workflows/`), and validates commit messages against [Conventional Commits](https://www.conventionalcommits.org/) via commitlint.

## Contributing

See [Creating a Pull Request](https://wiki.dndmapp.nl.eu.org/development-conventions/creating-a-pull-request) for how to open a pull request in any `dnd-mapp` repository, and [Angular & TypeScript Conventions](https://wiki.dndmapp.nl.eu.org/development-conventions/angular-typescript) for this repo's coding conventions.

## License

[MIT](LICENSE)
