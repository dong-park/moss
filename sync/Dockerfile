FROM oven/bun:1.3.14-alpine

WORKDIR /app

# Runtime deps only: embedded-postgres is a devDependency for tests.
COPY shared/doc-model ../shared/doc-model
COPY sync/package.json sync/bun.lock ./
RUN bun install --frozen-lockfile --production

COPY sync/src ./src
ARG BUILD_SHA
RUN test "${#BUILD_SHA}" -eq 40 && ! printf '%s' "$BUILD_SHA" | LC_ALL=C grep -q '[^0-9a-fA-F]' && printf '%s' "$BUILD_SHA" > .build-sha

ENV NODE_ENV=production \
    PORT=1234 \
    INTERNAL_PORT=1235
EXPOSE 1234
HEALTHCHECK --interval=10s --timeout=7s --start-period=40s --retries=3 \
  CMD bun -e 'const r=await fetch(`http://127.0.0.1:${process.env.INTERNAL_PORT||1235}/deployment`,{headers:{"x-moss-internal":process.env.SYNC_INTERNAL_SECRET||""},signal:AbortSignal.timeout(5000)});const b=await r.json();if(!r.ok||b.status!=="ready"||b.sha!==process.env.RELEASE_SHA)process.exit(1)'

CMD ["bun", "run", "src/index.ts"]
