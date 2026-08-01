# syntax=docker/dockerfile:1

FROM --platform="$BUILDPLATFORM" node:24.18.0-alpine3.24@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base

RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

WORKDIR /app


FROM --platform="$BUILDPLATFORM" base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN --mount=type=secret,id=npm_token,required=true \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    sh -c ' \
        set -e; \
        echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/npm_token)" >> "$HOME/.npmrc"; \
        pnpm install --frozen-lockfile; \
        rm -f "$HOME/.npmrc" \
    '


FROM --platform="$BUILDPLATFORM" dependencies AS build

COPY . .

RUN pnpm build


FROM nginx:1.31.3-alpine3.24@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752 AS runtime

COPY .docker/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist/app/browser /usr/share/nginx/html

RUN chown -R nginx:nginx /var/cache/nginx && \
    sed -i \
        -e '/^user[[:space:]]\+nginx;/d' \
        -e 's#^pid[[:space:]]\+/run/nginx.pid;#pid /tmp/nginx.pid;#' \
        /etc/nginx/nginx.conf

USER nginx

EXPOSE 4000

STOPSIGNAL SIGQUIT

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget --quiet --tries=1 --spider http://localhost:4000/ || exit 1
