<!--
This file is the source of truth for the Docker Hub repository description,
but it is NOT synced there automatically: Docker Hub's description-update API
endpoint rejects Personal Access Tokens outright (a platform limitation, not
something fixable from this repo - see docker/hub-feedback#1927), and this
repo otherwise only ever hands CI a scoped access token, never the real
account password. So after merging a change to this file, paste its contents
into the Docker Hub repository's "Description" editor by hand:
https://hub.docker.com/repository/docker/dndmapp/template-app-angular/general

It's meant to stand on its own for a Docker Hub visitor, so keep it
self-contained rather than linking to other files in the source repo (except
the "Building the image" section, which intentionally redirects there).

If you change the "Available tags" table here, update the equivalent
narrative in docs/guides/dev/docker.md too - the two aren't kept in sync
automatically.
-->

# template-app-angular

Template repository for bootstrapping new Angular-based `dnd-mapp` repositories. This image builds the app and serves it with nginx on port `4000`.

## Running the image

```bash
docker run -p 4000:4000 dndmapp/template-app-angular:next
```

Open `http://localhost:4000`. The container runs as the unprivileged `nginx` user and takes no runtime environment variables or volumes - everything it needs is baked in at build time.

If you've cloned the source repository, `docker compose -f .docker/compose.yaml up` does the same thing, defaulting to the `next` tag and always pulling before starting.

## Available tags

| Tag      | Produced by            | Meaning                                                                                                           |
|----------|------------------------|-------------------------------------------------------------------------------------------------------------------|
| `pr-<N>` | CI, per pull request   | Built from pull request `<N>` whenever it touches Docker-relevant paths. Removed once the pull request is closed. |
| `next`   | CI, on merge to `main` | The most recently merged pull request's image, retagged after merge. Always reflects the current tip of `main`.   |

## Building the image

This image is built from [`.docker/Dockerfile`](https://github.com/dnd-mapp/template-app-angular/blob/main/.docker/Dockerfile) using [`.docker/docker-bake.hcl`](https://github.com/dnd-mapp/template-app-angular/blob/main/.docker/docker-bake.hcl). See [`docs/guides/dev/docker.md`](https://github.com/dnd-mapp/template-app-angular/blob/main/docs/guides/dev/docker.md) in the source repository for how to build it yourself.
