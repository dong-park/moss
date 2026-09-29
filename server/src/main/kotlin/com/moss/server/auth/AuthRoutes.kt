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
import io.ktor.server.plugins.doublereceive.DoubleReceive
import io.ktor.server.plugins.origin
import io.ktor.server.plugins.ratelimit.RateLimit
import io.ktor.server.plugins.ratelimit.RateLimitName
import io.ktor.server.plugins.ratelimit.rateLimit
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes

/** D8: 로그인은 IP+메일당 1분 10회, 가입은 IP당 1시간 20회. */
val EmailLoginRateLimit = RateLimitName("email-login")
val EmailSignupRateLimit = RateLimitName("email-signup")

/**
 * D8 보강: 위 IP+메일 버킷은 메일만 바꿔도 새로 생겨 bcrypt CPU DoS를 막지 못한다.
 * IP 전용 로그인 집계(1분 60회)를 겹쳐 메일 회전 공격까지 묶는다.
 */
val EmailLoginIpRateLimit = RateLimitName("email-login-ip")

/**
 * RateLimit의 requestKey가 본문을 읽어야 하므로 [DoubleReceive]를 설치한다 — 핸들러가
 * 평범하게 `receive`해도 이미 소비된 본문 예외가 나지 않는다.
 *
 * IP는 `origin.remoteHost`다. 지금은 compose가 8080 직결이라 프록시가 없어 이 값이 진짜
 * 클라이언트 IP다. 프록시 뒤로 옮기면 전원이 한 버킷이 되므로 `XForwardedHeaders`를
 * 설치해야 하는데, 무조건 믿으면 헤더 위조로 우회된다. 도입 시 신뢰 프록시 수를 정해
 * 그만큼의 홉만 반영해야 한다 — 스펙 D8·11절 참고.
 */
fun Application.installAuthRateLimits() {
    install(DoubleReceive)
    install(RateLimit) {
        register(EmailLoginRateLimit) {
            rateLimiter(limit = 10, refillPeriod = 1.minutes)
            requestKey { call ->
                val email = rateLimitEmail(call.receive<EmailLoginRequest>().email)
                "${call.request.origin.remoteHost}:$email"
            }
        }
        register(EmailLoginIpRateLimit) {
            rateLimiter(limit = 60, refillPeriod = 1.minutes)
            requestKey { call -> call.request.origin.remoteHost }
        }
        register(EmailSignupRateLimit) {
            rateLimiter(limit = 20, refillPeriod = 1.hours)
            requestKey { call -> call.request.origin.remoteHost }
        }
    }
}

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

    rateLimit(EmailLoginIpRateLimit) {
        rateLimit(EmailLoginRateLimit) {
            post("/auth/login") {
                val body = call.receive<EmailLoginRequest>()
                val email = normalizeEmail(body.email)
                validateEmail(email)
                validateLoginPassword(body.password)
                val credential = server.repo.findByEmail(email)
                if (credential == null) {
                    PasswordHasher.wasteTime(body.password)
                    throw UnauthorizedException("메일이나 비밀번호가 맞지 않아요")
                }
                if (!PasswordHasher.verify(body.password, credential.passwordHash)) {
                    throw UnauthorizedException("메일이나 비밀번호가 맞지 않아요")
                }
                call.respondAuth(server, credential.user)
            }
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
