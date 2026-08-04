# Docker

[`.docker/Dockerfile`](../../../.docker/Dockerfile) builds the app and serves it with nginx on port `4000`, matching the local dev server's port. Installing dependencies requires a GitHub Package Registry token with at least the `packages:read` permission to resolve any `@dnd-mapp/*` scoped packages. Forward it as a build secret, rather than an environment variable or `ARG`, so it never ends up baked into the image:

```bash
export NPM_TOKEN=<personal access token with packages:read>
docker build --secret id=npm_token,env=NPM_TOKEN -f .docker/Dockerfile -t <image-name> .
```

The build fails immediately if `npm_token` isn't provided, even before any `@dnd-mapp/*` packages are added to `package.json`. In GitHub Actions, pass it via the `secrets` input of `docker/build-push-action` instead of `env`.

Run the built image and open `http://localhost:4000`:

```bash
docker run -p 4000:4000 <image-name>
```

The container runs as the unprivileged `nginx` user and takes no runtime environment variables or volumes. Everything it needs is baked in at build time.

## Building with `docker buildx bake`

[`.docker/docker-bake.hcl`](../../../.docker/docker-bake.hcl) defines two targets. Run it from the repository root, the same as `docker build` above. The `IMAGE_NAME` and `IMAGE_TAG` variables control the image's tags; `IMAGE_TAG` accepts a comma-separated list to apply more than one tag in a single build, e.g. `latest,v1.2.3,sha-abc123`.

- `local` (the default target): builds a single platform (whatever the builder runs on) with no attestations, and loads the result into the local Docker image store, for everyday local builds:

  ```bash
  export NPM_TOKEN=<personal access token with packages:read>
  IMAGE_NAME=<image-name> IMAGE_TAG=<tag>[,<tag>...] docker buildx bake -f .docker/docker-bake.hcl
  ```

- `ci`: builds `linux/amd64` and `linux/arm64` together and attaches SBOM and provenance attestations, for use in CI/CD pipelines. It reads and writes its build cache through the GitHub Actions cache backend (`mode=max`, covering every layer of every build stage), which only works inside a GitHub Actions job: it needs the cache service URL and runtime token that `docker/setup-buildx-action` wires up automatically, so it needs no registry credentials of its own. It also needs a builder that supports multi-platform output and attestations, e.g. the default `docker-container` driver:

  ```bash
  docker buildx create --use
  ```

  That driver can't load a multi-platform image into the local image store, so building the `ci` target requires either pushing the result:

  ```bash
  export NPM_TOKEN=<personal access token with packages:read>
  IMAGE_NAME=<registry>/<image-name> IMAGE_TAG=<tag>[,<tag>...] docker buildx bake -f .docker/docker-bake.hcl ci --push
  ```

  or exporting it to a multi-platform-aware format instead:

  ```bash
  docker buildx bake -f .docker/docker-bake.hcl ci --set ci.output=type=oci,dest=./image.tar
  ```

  The `ci` target inherits from an empty `docker-metadata-action` placeholder target, so it's compatible with [`docker/metadata-action`](https://github.com/docker/metadata-action): pass its generated bake file alongside this one to have its computed tags and OCI labels override `IMAGE_NAME`/`IMAGE_TAG`, e.g. via [`docker/bake-action`](https://github.com/docker/bake-action) in GitHub Actions. See [`.github/workflows/pull-request.yml`](../../../.github/workflows/pull-request.yml) for how this repository builds and pushes images to GHCR in CI.

## Image lifecycle in CI

Pull requests that touch relevant paths get an image built and pushed to GHCR, tagged `pr-<N>`. What happens to that tag next depends on how the pull request is resolved:

- **Merged**: [`.github/workflows/push-main.yml`](../../../.github/workflows/push-main.yml) checks whether a `pr-<N>` image was built for the merged pull request. If so, it retags the image `next`.
