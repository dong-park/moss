FROM gradle:8.14-jdk17 AS build
WORKDIR /app
COPY . .
RUN gradle installDist --no-daemon

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/build/install/moss-server/ ./
EXPOSE 8080
CMD ["./bin/moss-server"]
