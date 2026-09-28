package com.moss.server

import com.moss.server.auth.GoogleVerifier
import com.moss.server.boards.BoardRepository
import com.moss.server.auth.TokenService
import io.ktor.http.HttpHeaders
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.header
import java.util.UUID

class MossServer(
    val config: AppConfig,
    val tokens: TokenService,
    val repo: BoardRepository,
    val googleVerifier: GoogleVerifier,
    val syncClose: SyncCloseClient,
    val fileStore: FileStore,
)

suspend fun ApplicationCall.requireUserId(server: MossServer): UUID {
    val header = request.header(HttpHeaders.Authorization)
        ?: throw UnauthorizedException("인증이 필요해요")
    if (!header.startsWith("Bearer ")) throw UnauthorizedException("인증 헤더 형식이 올바르지 않아요")
    val token = header.removePrefix("Bearer ").trim()
    val decoded = server.tokens.verify(token, TokenService.TokenType.ACCESS)
    return server.tokens.userId(decoded)
}
