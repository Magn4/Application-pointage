FROM node:22-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

RUN apk add --no-cache openssl bash tini curl \
  && curl -fsSL -L https://github.com/minio/minio/releases/download/RELEASE.2025-04-22T22-12-26Z/minio.linux-amd64.RELEASE.2025-04-22T22-12-26Z -o /usr/local/bin/minio \
  && chmod +x /usr/local/bin/minio \
  && corepack enable \
  && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile --prod=false

COPY . .

# Recheck workspace links without --force, which downloads optional binaries
# for unrelated operating systems and architectures.
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm db:generate
RUN pnpm --filter @pointage360/api run build
RUN API_PROXY_URL=http://127.0.0.1:4000 NEXT_PUBLIC_API_URL=/api \
  pnpm --filter @pointage360/web run build
RUN chmod +x /app/docker/start-render-free.sh

ENV NODE_ENV="production"

EXPOSE 10000

ENTRYPOINT ["/sbin/tini", "-g", "--"]
CMD ["/app/docker/start-render-free.sh"]
