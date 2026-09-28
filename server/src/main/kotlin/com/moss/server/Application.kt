package com.moss.server

import com.moss.server.auth.GoogleVerifier
import com.moss.server.auth.TokenService
import com.moss.server.auth.authRoutes
import com.moss.server.boards.BoardRepository
import com.moss.server.boards.boardRoutes
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.application.log
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.Database
import org.slf4j.event.Level
import javax.sql.DataSource

fun main() {
    val config = AppConfig.fromEnv()
    val handle = DatabaseFactory.connect(config)
    Runtime.getRuntime().addShutdownHook(Thread { handle.close() })

    val verifier = if (config.googleClientId.isBlank()) {
        // Local run without Google credentials: /health and the rest still boot,
        // only /auth/google will reject tokens.
        GoogleVerifier.google("unconfigured-client-id")
    } else {
        GoogleVerifier.google(config.googleClientId)
    }

    embeddedServer(Netty, port = config.port, host = "0.0.0.0") {
        mossModule(config, verifier, handle.dataSource)
    }.start(wait = true)
}

fun Application.mossModule(
    config: AppConfig,
    googleVerifier: GoogleVerifier,
    dataSource: DataSource,
) {
    Database.connect(dataSource)

    val server = MossServer(
        config = config,
        tokens = TokenService(
            secret = config.jwtSecret,
            accessTtlSeconds = config.accessTtlSeconds,
            refreshTtlSeconds = config.refreshTtlSeconds,
            boardTtlSeconds = config.boardTokenTtlSeconds,
        ),
        repo = BoardRepository(config.maxMembersPerBoard, config.maxBoardFileBytes),
        googleVerifier = googleVerifier,
        syncClose = SyncCloseClient(config.syncInternalUrl, config.syncInternalSecret),
        fileStore = FileStore(java.nio.file.Path.of(config.filesDir)),
    )

    install(ContentNegotiation) {
        json(Json { ignoreUnknownKeys = true; encodeDefaults = true })
    }
    install(CallLogging) { level = Level.INFO }
    install(CORS) {
        config.allowedOrigins.forEach { origin ->
            val (scheme, host) = origin.split("://", limit = 2)
            allowHost(host, schemes = listOf(scheme))
        }
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Delete)
        allowHeader(HttpHeaders.Authorization)
        allowHeader(HttpHeaders.ContentType)
    }
    install(StatusPages) {
        exception<ApiFailure> { call, cause ->
            call.respond(cause.status, ErrorResponse(cause.code, cause.message ?: cause.code))
        }
        exception<io.ktor.server.plugins.BadRequestException> { call, cause ->
            call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("bad_request", cause.message ?: "요청을 읽을 수 없어요"),
            )
        }
        exception<Throwable> { call, cause ->
            call.application.log.error("unhandled error", cause)
            call.respond(
                HttpStatusCode.InternalServerError,
                ErrorResponse("internal_error", "서버에서 문제가 생겼어요"),
            )
        }
    }

    routing {
        get("/health") { call.respond(HttpStatusCode.OK, HealthResponse("ok")) }
        authRoutes(server)
        boardRoutes(server)
    }
}
