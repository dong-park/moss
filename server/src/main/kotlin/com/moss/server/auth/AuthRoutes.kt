package com.moss.server.auth

import com.moss.server.AuthResponse
import com.moss.server.EmailLoginRequest
import com.moss.server.EmailSignupRequest
import com.moss.server.GoogleLoginRequest
import com.moss.server.GoogleVerificationException
import com.moss.server.MossServer
import com.moss.server.RefreshRequest
import com.moss.server.UnauthorizedException
import com.moss.server.boards.UserRow
import com.moss.server.toDto
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.install
import io.ktor.server.plugins.origin
import io.ktor.server.plugins.ratelimit.RateLimit
import io.ktor.server.plugins.ratelimit.RateLimitName
import io.ktor.server.plugins.ratelimit.rateLimit
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.util.AttributeKey
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes

/** D8: 로그인은 IP+메일당 1분 10회, 가입은 IP당 1시간 20회. */
val EmailLoginRateLimit = RateLimitName("email-login")
val EmailSignupRateLimit = RateLimitName("email-signup")

/**
 * D8: 서버가 1대라 메모리 저장으로 충분하다. 로그인 키는 본문의 이메일까지 포함해야
 * 하므로 requestKey에서 본문을 한 번 읽어 [emailLoginBodyKey]에 담아 둔다 — 핸들러가
 * 다시 receive하면 이미 소비된 본문이라 실패한다.
 */
fun Application.installAuthRateLimits() {
    install(RateLimit) {
        register(EmailLoginRateLimit) {
            rateLimiter(limit = 10, refillPeriod = 1.minutes)
            requestKey { call ->
                val ip = call.request.origin.remoteHost
                "$ip:${normalizeEmail(call.receiveEmailLogin().email)}"
            }
        }
        register(EmailSignupRateLimit) {
            rateLimiter(limit = 20, refillPeriod = 1.hours)
            requestKey { call -> call.request.origin.remoteHost }
        }
    }
}

private val emailLoginBodyKey = AttributeKey<EmailLoginRequest>("EmailLoginBody")

private suspend fun ApplicationCall.receiveEmailLogin(): EmailLoginRequest =
    attributes.getOrNull(emailLoginBodyKey)
        ?: receive<EmailLoginRequest>().also { attributes.put(emailLoginBodyKey, it) }

fun Route.authRoutes(server: MossServer) {
    post("/auth/google") {
        val body = call.receive<GoogleLoginRequest>()
        val googleUser = try {
            server.googleVerifier.verify(body.idToken)
        } catch (e: GoogleVerificationException) {
            throw UnauthorizedException("구글 로그인을 확인할 수 없어요")
        }
        val user = server.repo.upsertUser(googleUser)
        call.respondAuth(server, user)
    }

    post("/auth/refresh") {
        val body = call.receive<RefreshRequest>()
        val decoded = server.tokens.verify(body.refreshToken, TokenService.TokenType.REFRESH)
        val userId = server.tokens.userId(decoded)
        val user = server.repo.userById(userId) ?: throw UnauthorizedException("사용자를 찾을 수 없어요")
        call.respondAuth(server, user)
    }

    rateLimit(EmailSignupRateLimit) {
        post("/auth/signup") {
            val body = call.receive<EmailSignupRequest>()
            val email = normalizeEmail(body.email)
            validateEmail(email)
            validatePassword(body.password)
            val name = normalizeName(body.name)
            val user = server.repo.createEmailUser(email, PasswordHasher.hash(body.password), name)
            call.respondAuth(server, user)
        }
    }

    rateLimit(EmailLoginRateLimit) {
        post("/auth/login") {
            val body = call.receiveEmailLogin()
            val email = normalizeEmail(body.email)
            validateEmail(email)
            validatePassword(body.password)
            val credential = server.repo.findByEmail(email)
            if (credential == null) {
                PasswordHasher.wasteTime(body.password)
                throw UnauthorizedException("메일이나 비밀번호가 맞지 않아요")
            }
            if (!PasswordHasher.verify(body.password, credential.passwordHash)) {
                throw UnauthorizedException("메일이나 비밀번호가 맞지 않아요")
            }
            val user = server.repo.userById(credential.id)
                ?: throw UnauthorizedException("메일이나 비밀번호가 맞지 않아요")
            call.respondAuth(server, user)
        }
    }
}

private suspend fun ApplicationCall.respondAuth(server: MossServer, user: UserRow) {
    respond(
        HttpStatusCode.OK,
        AuthResponse(
            accessToken = server.tokens.accessToken(user.id),
            refreshToken = server.tokens.refreshToken(user.id),
            user = user.toDto(),
        ),
    )
}
