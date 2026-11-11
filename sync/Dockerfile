FROM oven/bun:1.3.14-alpine

WORKDIR /app

# Runtime deps only: embedded-postgres is a devDependency for tests.
COPY shared/doc-model ../shared/doc-model
COPY sync/package.json sync/bun.lock ./
RUN bun install --frozen-lockfile --production

COPY sync/src ./src
# Release builds pass the exact 40-hex event SHA (strict). Manual/local Compose builds omit it and
# produce an explicitly UNVERSIONED image: no identity file, never a verified release.
ARG BUILD_SHA=
RUN if [ -n "$BUILD_SHA" ]; then test "${#BUILD_SHA}" -eq 40 && ! printf '%s' "$BUILD_SHA" | LC_ALL=C grep -q '[^0-9a-fA-F]' && printf '%s' "$BUILD_SHA" > .build-sha; fi

ENV NODE_ENV=production \
    PORT=1234 \
    INTERNAL_PORT=1235
EXPOSE 1234
HEALTHCHECK --interval=10s --timeout=7s --start-period=40s --retries=3 \
  CMD bun -e 'const r=await fetch(`http://127.0.0.1:${process.env.INTERNAL_PORT||1235}/deployment`,{headers:{"x-moss-internal":process.env.SYNC_INTERNAL_SECRET||""},signal:AbortSignal.timeout(5000)});const b=await r.json();const w=process.env.RELEASE_SHA;if(!r.ok||(w?b.status!=="ready"||b.sha!==w:b.status!=="unversioned"))process.exit(1)'

CMD ["bun", "run", "src/index.ts"]
