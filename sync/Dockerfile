FROM oven/bun:1.3.14-alpine

WORKDIR /app

# Runtime deps only: embedded-postgres is a devDependency for tests.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src

ENV NODE_ENV=production \
    PORT=1234 \
    INTERNAL_PORT=1235
EXPOSE 1234

CMD ["bun", "run", "src/index.ts"]
