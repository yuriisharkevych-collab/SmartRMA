# npm workspaces hoist dependencies to the ROOT node_modules — apps/api/node_modules
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
RUN npm install --workspace apps/api --include-workspace-root --ignore-scripts

FROM base AS build
COPY --from=deps /workspace/node_modules ./node_modules
COPY package.json ./
COPY apps/api apps/api
RUN npm run prisma:generate --workspace apps/api
RUN npm run build --workspace apps/api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
