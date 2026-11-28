# Runs the nestlens-mcp MCP server over stdio, built from this commit's source
# with the dependency versions package-lock.json pins. Used by MCP directories
# (Docker MCP Catalog, Glama) that build and introspect servers in a sandbox;
# tools/list answers without a NestLens to talk to. Point it at a running
# NestLens with --url, or set NESTLENS_URL. Inside a container localhost is the
# container: reach an application on the host at
# http://host.docker.internal:<port>/nestlens.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# devEngines refuses any npm but the one packageManager names.
RUN npm install --global --no-audit --no-fund \
    "$(node -p "require('./package.json').packageManager")"
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build:lib
# The SDK is an optional peer of the library and a dev dependency here, so it is
# promoted before pruning; prune only removes, so what stays is what npm ci
# installed from the lockfile.
RUN sdk="$(npm pkg get 'devDependencies.@modelcontextprotocol/sdk' | tr -d '"')" \
  && npm pkg delete 'devDependencies.@modelcontextprotocol/sdk' \
  && npm pkg set "dependencies.@modelcontextprotocol/sdk=$sdk" \
  && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# bin.js requires nestlens/mcp, which resolves to this package by its own name.
COPY packages/mcp/bin.js ./bin.js
USER node
ENTRYPOINT ["node", "/app/bin.js"]
