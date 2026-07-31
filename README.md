# dnd-mapp/project-template

Template repository for bootstrapping new `dnd-mapp` repositories, with shared tooling and CI pre-configured.

## Installation

Click **Use this template** on GitHub to create a new repository from this one. In the new repository, install dependencies and set up the Husky git hooks:

```bash
pnpm install
```

Then update `package.json`'s `name` and `description`, and this README, to match the new repository.

## Usage

```bash
pnpm format        # Format all files with Prettier
pnpm format-check  # Check formatting without writing changes
pnpm lint-md       # Lint Markdown files with markdownlint-cli2
```

Husky and lint-staged run Prettier and markdownlint on staged files before each commit. GitHub Actions runs the same checks on every pull request and on pushes to `main` (see `.github/workflows/`). It also validates commit messages against [Conventional Commits](https://www.conventionalcommits.org/) via commitlint.

## Contributing

See [Creating a Pull Request](https://wiki.dndmapp.nl.eu.org/development-conventions/creating-a-pull-request) for how to open a pull request in any `dnd-mapp` repository.

## License

[MIT](LICENSE)
