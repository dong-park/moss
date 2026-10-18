# 로컬 OrbStack 배포용. NEXT_PUBLIC_* 는 빌드 때 번들에 박히므로 build arg로 받는다.
FROM oven/bun:1 AS build
WORKDIR /app
COPY shared/doc-model ../shared/doc-model
COPY web/package.json web/bun.lock* ./
RUN bun install
# bun은 file: 의존성의 package.json을 /shared를 가리키는 절대 심볼릭 링크로 둔다.
# Turbopack은 프로젝트 밖을 가리키는 링크를 못 읽고, 런타임 이미지에는 /shared가 없다.
# 링크 대신 실제 파일로 바꿔 둔다.
RUN rm -rf node_modules/@moss/doc-model && cp -r ../shared/doc-model node_modules/@moss/doc-model
COPY web/ .
ARG NEXT_PUBLIC_MOSS_API_URL
ARG NEXT_PUBLIC_MOSS_SYNC_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_MOSS_API_URL=$NEXT_PUBLIC_MOSS_API_URL \
    NEXT_PUBLIC_MOSS_SYNC_URL=$NEXT_PUBLIC_MOSS_SYNC_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
EXPOSE 3000
CMD ["bun", "run", "start", "-p", "3000", "-H", "0.0.0.0"]
