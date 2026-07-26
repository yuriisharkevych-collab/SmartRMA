# npm workspaces hoist dependencies to the ROOT node_modules — apps/web/node_modules
# is not guaranteed to exist, so this Dockerfile only ever copies the root one.
FROM node:20-alpine AS base
WORKDIR /workspace

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# --ignore-scripts: pomija root `prepare` (husky wymaga .git, nigdy nie
# kopiowanego do obrazu) i `postinstall` (bootstrap .env — bez sensu w
# kontenerze, który dostaje zmienne środowiskowe wprost z docker-compose.yml).
RUN npm install --workspace apps/web --include-workspace-root --ignore-scripts

FROM base AS runtime
ENV NODE_ENV=development
COPY --from=deps /workspace/node_modules ./node_modules
COPY apps/web apps/web
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace", "apps/web", "--", "--host"]
