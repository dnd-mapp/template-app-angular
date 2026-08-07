# @dnd-mapp/changelog

Keep a Changelog release automation: a CLI for moving `Unreleased` entries into a versioned section, extracting a release's notes, and guarding a release workflow against shipping an empty release.

## Prerequisites

Part of this repository's pnpm workspace, so it needs no separate installation. See the [repository root README](../../README.md) for the shared Node.js/pnpm setup.

## Usage

Run every command from the repository root:

```bash
node scripts/changelog/index.ts <command> [arguments]
```

`CHANGELOG.md` resolves relative to the current working directory, not this package's own directory. Run the CLI from the repository root rather than via `pnpm --filter @dnd-mapp/changelog run ...`, which changes into this directory first and would fail to find the file.

### Commands

- `bump <version> <repo>`: moves every entry out of `## [Unreleased]` into a new `## [<version>] - YYYY-MM-DD` section, resets `Unreleased` to bare, and inserts a `[<version>]` reference link pointing at `https://github.com/<repo>/releases/tag/v<version>`.
- `extract <version>`: prints the `## [<version>]` section's body to stdout, for reuse as GitHub Release notes.
- `check`: exits non-zero if `Unreleased` has no entries, for a release workflow's freshness guard.

Each command reads `CHANGELOG.md`, and `bump` also writes it back. On failure, a command prints an error to stderr and exits non-zero instead of writing a partial file.

```bash
$ node scripts/changelog/index.ts bump 1.2.0 dnd-mapp/template-app-angular
$ node scripts/changelog/index.ts extract 1.2.0
### Added

- Added a widget.
$ node scripts/changelog/index.ts check; echo $?
0
```

A changelog entry can wrap onto extra lines or carry a nested sub-list, as long as each continuation line is indented under its leading `-`. `bump` and `check` keep the whole block together as one entry either way.

See [Changelog Conventions](https://wiki.dndmapp.nl.eu.org/development-conventions/changelogs) for the `CHANGELOG.md` format this CLI assumes.

## Contributing

See [Creating a Pull Request](https://wiki.dndmapp.nl.eu.org/development-conventions/creating-a-pull-request) for how to open a pull request in any `dnd-mapp` repository, and [Angular & TypeScript Conventions](https://wiki.dndmapp.nl.eu.org/development-conventions/angular-typescript) for this repo's coding conventions.

## License

[MIT](../../LICENSE)
