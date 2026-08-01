# Build definitions for the image in `.docker/Dockerfile`.
#
# `context` and `dockerfile` below are resolved relative to the working
# directory the `docker buildx bake` command runs in, not to this file's own
# location, so always run it from the repository root:
#
#   docker buildx bake -f .docker/docker-bake.hcl ...
#
# IMAGE_NAME and IMAGE_TAG below control the image's tags; set them via
# environment variables. IMAGE_TAG accepts a comma-separated list to apply
# more than one tag in a single build, e.g. "latest,v1.2.3,sha-abc123".
#
# Two targets are defined:
#
# - "local" (the default): builds a single platform (whatever the builder
#   runs on) with no attestations, and loads the result into the local
#   Docker image store. For everyday local builds:
#
#     export NPM_TOKEN=<personal access token with packages:read>
#     IMAGE_NAME=<image-name> IMAGE_TAG=<tag>[,<tag>...] docker buildx bake -f .docker/docker-bake.hcl
#
# - "ci": builds linux/amd64 and linux/arm64 together and attaches SBOM and
#   provenance attestations. Requires a builder that supports multi-platform
#   output and attestations, e.g. the default "docker-container" driver:
#
#     docker buildx create --use
#
#   That driver can't load a multi-platform image into the local image
#   store, so building the "ci" target requires either pushing the result:
#
#     export NPM_TOKEN=<personal access token with packages:read>
#     IMAGE_NAME=<registry>/<image-name> IMAGE_TAG=<tag>[,<tag>...] docker buildx bake -f .docker/docker-bake.hcl ci --push
#
#   or exporting it to a multi-platform-aware format instead:
#
#     docker buildx bake -f .docker/docker-bake.hcl ci --set ci.output=type=oci,dest=./image.tar
#
#   "ci" also inherits from "docker-metadata-action", an empty placeholder
#   target that docker/metadata-action's generated bake file overrides with
#   its computed tags and OCI labels when passed alongside this file, e.g.
#   in GitHub Actions via docker/bake-action:
#
#     - uses: docker/setup-buildx-action@v3
#
#     - uses: docker/metadata-action@v5
#       id: meta
#       with:
#         images: <registry>/<image-name>
#
#     - uses: docker/login-action@v3
#       with:
#         registry: <registry>
#         username: ${{ github.actor }}
#         password: ${{ secrets.GITHUB_TOKEN }}
#
#     - uses: docker/bake-action@v4
#       with:
#         files: |
#           .docker/docker-bake.hcl
#           ${{ steps.meta.outputs.bake-file }}
#         targets: ci
#         push: true
#
#   "ci" reads and writes its build cache through the GitHub Actions cache
#   backend (mode=max, so cache covers every layer of every build stage, not
#   just the final image). This only works inside a GitHub Actions job: it
#   needs the cache service URL and runtime token that docker/setup-buildx-
#   action wires up automatically, so it doesn't need registry credentials.

variable "IMAGE_NAME" {
    default = "angular-app-template"

    validation {
        condition     = can(regex("^[a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*$", IMAGE_NAME))
        error_message = "IMAGE_NAME must be a valid Docker image name."
    }
}

# Comma-separated list of tags, e.g. "latest,v1.2.3,sha-abc123".
variable "IMAGE_TAG" {
    default = "latest"

    validation {
        condition     = length([for t in split(",", IMAGE_TAG) : t if !can(regex("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$", t))]) == 0
        error_message = "IMAGE_TAG must be a comma-separated list of valid Docker tags."
    }
}

group "default" {
    targets = ["local"]
}

# Populated by docker/metadata-action when its generated bake file is passed
# alongside this one (see the "ci" target below). Left empty so this file
# stays valid on its own for local, non-Actions builds.
target "docker-metadata-action" {}

target "_common" {
    context    = "."
    dockerfile = ".docker/Dockerfile"
    tags       = formatlist("${IMAGE_NAME}:%s", split(",", IMAGE_TAG))
    secret     = ["id=npm_token,env=NPM_TOKEN"]
}

target "local" {
    inherits = ["_common"]
    output   = ["type=docker"]
    attest   = ["type=provenance,disabled=true"]
}

target "ci" {
    inherits  = ["_common", "docker-metadata-action"]
    platforms = ["linux/amd64", "linux/arm64"]
    attest = [
        "type=sbom",
        "type=provenance,mode=max",
    ]
    cache-from = ["type=gha"]
    cache-to   = ["type=gha,mode=max"]
}
