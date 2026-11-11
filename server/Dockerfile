FROM gradle:8.14-jdk17 AS build
WORKDIR /app
COPY . .
# Release builds pass the exact 40-hex event SHA (strict). Manual/local Compose builds omit it and
# produce an explicitly UNVERSIONED image: no identity file, never a verified release.
ARG BUILD_SHA=
RUN if [ -n "$BUILD_SHA" ]; then test "${#BUILD_SHA}" -eq 40 && ! printf '%s' "$BUILD_SHA" | LC_ALL=C grep -q '[^0-9a-fA-F]' && printf '%s' "$BUILD_SHA" > src/main/resources/build-sha; fi
RUN gradle installDist --no-daemon

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/build/install/moss-server/ ./
EXPOSE 8080
# Flyway runs before Ktor binds. Probes failing inside the start period do not count, so a slow
# migration is not marked unhealthy before the deployer's 660s start budget (runtime.SERVER_START_SECONDS).
HEALTHCHECK --interval=10s --timeout=8s --start-period=600s --retries=3 \
  CMD ["java", "-cp", "lib/*", "com.moss.server.DeploymentProbe"]
CMD ["./bin/moss-server"]
