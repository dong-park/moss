FROM gradle:8.14-jdk17 AS build
WORKDIR /app
COPY . .
ARG BUILD_SHA
RUN test "${#BUILD_SHA}" -eq 40 && ! printf '%s' "$BUILD_SHA" | LC_ALL=C grep -q '[^0-9a-fA-F]' && printf '%s' "$BUILD_SHA" > src/main/resources/build-sha
RUN gradle installDist --no-daemon

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/build/install/moss-server/ ./
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=8s --start-period=40s --retries=3 \
  CMD ["java", "-cp", "lib/*", "com.moss.server.DeploymentProbe"]
CMD ["./bin/moss-server"]
