package com.moss.server.auth

import com.moss.server.AuthResponse
import com.moss.server.GoogleLoginRequest
import com.moss.server.GoogleVerificationException
import com.moss.server.MossServer
import com.moss.server.RefreshRequest
import com.moss.server.UnauthorizedException
import com.moss.server.toDto
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post

fun Route.authRoutes(server: MossServer) {
    post("/auth/google") {
        val body = call.receive<GoogleLoginRequest>()
        val googleUser = try {
            server.googleVerifier.verify(body.idToken)
        } catch (e: GoogleVerificationException) {
            throw UnauthorizedException("구글 로그인을 확인할 수 없어요")
        }
        val user = server.repo.upsertUser(googleUser)
        call.respond(
            HttpStatusCode.OK,
            AuthResponse(
                accessToken = server.tokens.accessToken(user.id),
                refreshToken = server.tokens.refreshToken(user.id),
                user = user.toDto(),
            ),
        )
    }

    post("/auth/refresh") {
        val body = call.receive<RefreshRequest>()
        val decoded = server.tokens.verify(body.refreshToken, TokenService.TokenType.REFRESH)
        val userId = server.tokens.userId(decoded)
        val user = server.repo.userById(userId) ?: throw UnauthorizedException("사용자를 찾을 수 없어요")
        call.respond(
            HttpStatusCode.OK,
            AuthResponse(
                accessToken = server.tokens.accessToken(user.id),
                refreshToken = server.tokens.refreshToken(user.id),
                user = user.toDto(),
            ),
        )
    }
}
