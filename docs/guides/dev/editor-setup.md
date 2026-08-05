# Editor setup

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
