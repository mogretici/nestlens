# Runs the nestlens-mcp MCP server over stdio. Used by MCP directories (Glama)
# that build and introspect servers in a sandbox; tools/list answers without a
# NestLens to talk to. Point it at a running NestLens with --url, or set
# NESTLENS_URL.
FROM node:22-slim

RUN npm install --global nestlens-mcp@latest \
  && npm cache clean --force

USER node

ENTRYPOINT ["nestlens-mcp"]
