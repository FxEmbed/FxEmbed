FROM node:24.19.0-bookworm-slim AS base

WORKDIR /app

# FxEmbed's build script shells out to git for release metadata.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package.json package-lock.json ./
COPY packages/atmosphere/package.json ./packages/atmosphere/package.json
RUN npm ci

FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN test -f wrangler.toml || cp wrangler.example.toml wrangler.toml
RUN test -f .env || cp .env.example .env
RUN npm run build:atmosphere && npm run build-local

FROM base AS runtime

ENV NODE_ENV=production
ENV WRANGLER_SEND_METRICS=false

RUN groupadd --gid 1001 fxembed \
  && useradd --uid 1001 --gid fxembed --home-dir /app --no-create-home --shell /usr/sbin/nologin fxembed

COPY --from=build --chown=fxembed:fxembed /app /app
RUN chown fxembed:fxembed /app

EXPOSE 8787

USER fxembed

CMD ["npx", "wrangler", "dev", "./dist/worker.js", "--local", "--ip", "0.0.0.0", "--port", "8787"]
