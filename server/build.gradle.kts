plugins {
    kotlin("jvm") version "2.2.20"
    kotlin("plugin.serialization") version "2.2.20"
    application
}

group = "com.moss"
version = "0.1.0"

repositories {
    mavenCentral()
}

val ktorVersion = "3.3.3"

kotlin {
    jvmToolchain(17)
}

application {
    mainClass.set("com.moss.server.ApplicationKt")
}

dependencies {
    implementation("io.ktor:ktor-server-core:$ktorVersion")
    implementation("io.ktor:ktor-server-netty:$ktorVersion")
    implementation("io.ktor:ktor-server-content-negotiation:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")
    implementation("io.ktor:ktor-server-status-pages:$ktorVersion")
    implementation("io.ktor:ktor-server-call-logging:$ktorVersion")
    implementation("io.ktor:ktor-server-cors:$ktorVersion")
    implementation("io.ktor:ktor-server-rate-limit:$ktorVersion")
    implementation("io.ktor:ktor-server-double-receive:$ktorVersion")

    implementation("ch.qos.logback:logback-classic:1.5.18")
    implementation("com.zaxxer:HikariCP:6.3.3")
    implementation("org.postgresql:postgresql:42.7.13")

    implementation("org.jetbrains.exposed:exposed-core:0.61.0")
    implementation("org.jetbrains.exposed:exposed-jdbc:0.61.0")

    implementation("org.flywaydb:flyway-core:13.8.0")
    implementation("org.flywaydb:flyway-database-postgresql:13.8.0")

    implementation("com.auth0:java-jwt:4.6.1")
    implementation("com.google.api-client:google-api-client:2.9.1")
    implementation("at.favre.lib:bcrypt:0.10.2")

    // Local dev / tests without Docker: run Postgres inside the JVM.
    implementation("io.zonky.test:embedded-postgres:2.2.2")
    implementation("io.zonky.test.postgres:embedded-postgres-binaries-darwin-arm64v8:18.6.0")
    implementation("io.zonky.test.postgres:embedded-postgres-binaries-linux-amd64:18.6.0")

    testImplementation(kotlin("test"))
    testImplementation("io.ktor:ktor-server-test-host:$ktorVersion")
    testImplementation("io.ktor:ktor-client-content-negotiation:$ktorVersion")
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
