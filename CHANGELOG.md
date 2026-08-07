# Changelog

All notable, consumer-facing changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added a `CHANGELOG.md`, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
- Added CI that publishes multi-platform Docker images to Docker Hub: pull requests get a `pr-<N>` tag, merging to `main` promotes it to `next`, and closed/unmerged PRs have their image removed. Added `.docker/compose.yaml` to run the published image locally.
- Added the design system's token layer (primitive tokens, Brand x Mode resolution emitting semantic CSS custom properties, Base/Reset styles) and a self-hosted Roboto font.
- Added a multi-resolution favicon icon set.
- Added a multi-stage Dockerfile to containerize the app, with `docker-bake.hcl` for multi-platform, attested builds.
- Added Stylelint (`stylelint-config-recess-order`), enabled in CI, with WebStorm/VS Code integration.
- Added ESLint (`angular-eslint`), enabled in CI, with WebStorm/VS Code integration.
- Scaffolded the Angular application, with CI to build and test it, and WebStorm/VS Code task runner configs.

[Unreleased]: https://github.com/dnd-mapp/template-app-angular/commits/main
