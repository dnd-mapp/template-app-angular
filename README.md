# dnd-mapp/template-app-angular

Template repository for bootstrapping new Angular-based `dnd-mapp` repositories, with shared tooling, CI, and browser-based testing pre-configured.

## Prerequisites

- [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/): versions are pinned in `package.json`'s `devEngines` field.
- [mise](https://mise.jdx.dev/) (recommended): manages the Node.js and pnpm versions above automatically. Run `mise install` after installing it to pick up matching versions.
- [mkcert](https://github.com/FiloSottile/mkcert): generates the locally trusted HTTPS certificate the dev server uses (see [Installation](#installation)).

## Installation

Click **Use this template** on GitHub to create a new repository from this one. In the new repository, generate the dev server's certificate, then install dependencies (this also sets up the Husky git hooks) and the Chromium browser used for tests:

```bash
mkcert -install
mkcert -cert-file .ssl/cert.pem -key-file .ssl/key.pem localhost.www.dndmapp.dev
pnpm install
pnpm playwright-install-browsers
```

Then update `package.json`'s `name` and `description`, and this README, to match the new repository. Also reset `CHANGELOG.md`: remove this template's entries and leave just the header and an empty `## [Unreleased]` section, so the new repository starts its own history from scratch.

## Guides

- [Editor setup](docs/guides/dev/editor-setup.md): configuring Prettier, ESLint, and Stylelint to run in VS Code or WebStorm.
- [Usage](docs/guides/dev/usage.md): available `pnpm` scripts, the dev server's HTTPS/hosts-file setup, and what runs in CI.
- [Docker](docs/guides/dev/docker.md): building and running the app's image, `docker buildx bake`, and the image lifecycle in CI.

## Contributing

See [Creating a Pull Request](https://wiki.dndmapp.nl.eu.org/development-conventions/creating-a-pull-request) for how to open a pull request in any `dnd-mapp` repository, and [Angular & TypeScript Conventions](https://wiki.dndmapp.nl.eu.org/development-conventions/angular-typescript) for this repo's coding conventions.

## License

[MIT](LICENSE)
