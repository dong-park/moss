package com.moss.server.auth

import com.moss.server.AuthResponse
import com.moss.server.EmailLoginRequest
import com.moss.server.EmailSignupRequest
import com.moss.server.GoneException
import com.moss.server.GoogleLoginRequest
import com.moss.server.GoogleVerificationException
import com.moss.server.MossServer
import com.moss.server.PasswordResetConfirmRequest
import com.moss.server.PasswordResetRequestBody
import com.moss.server.LogoutRequest
import com.moss.server.RefreshRequest
import com.moss.server.UnauthorizedException
import com.moss.server.boards.SignupConsent
import com.moss.server.boards.UserRow
import com.moss.server.toDto
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.install
import io.ktor.util.AttributeKey
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

/** 재설정 요청과 확인은 합쳐서 IP당 1시간 10회. 메일 열거와 bcrypt 비용 폭주를 같이 막는다. */
val PasswordResetRateLimit = RateLimitName("password-reset")

/** 재설정 토큰 유효 시간. */
val PASSWORD_RESET_TTL_MILLIS = 1.hours.inWholeMilliseconds

/**
 * RateLimit의 requestKey가 로그인 본문을 읽어야 한다. 본문은 한 번만 읽히므로 [receiveEmailLogin]이
 * 첫 읽기를 call 속성에 담고 핸들러도 같은 함수로 받는다. DoubleReceive 플러그인을 전역에 깔았다가
 * 업로드 본문까지 힙에 통째로 복사해 되돌렸다.
 *
 * IP는 `origin.remoteHost`다. 지금은 compose가 8080 직결이라 프록시가 없어 이 값이 진짜
 * 클라이언트 IP다. 프록시 뒤로 옮기면 전원이 한 버킷이 되므로 `XForwardedHeaders`를
 * 설치해야 하는데, 무조건 믿으면 헤더 위조로 우회된다. 도입 시 신뢰 프록시 수를 정해
 * 그만큼의 홉만 반영해야 한다 — 스펙 D8·11절 참고.
 */
fun Application.installAuthRateLimits() {
    install(RateLimit) {
        register(EmailLoginRateLimit) {
            rateLimiter(limit = 10, refillPeriod = 1.minutes)
            requestKey { call ->
                val email = rateLimitEmail(call.receiveEmailLogin().email)
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
        register(PasswordResetRateLimit) {
            rateLimiter(limit = 10, refillPeriod = 1.hours)
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
        val user = server.repo.upsertUser(googleUser, consentOf(body.termsAccepted, body.termsVersion))
        call.respondAuth(server, user)
    }

    post("/auth/refresh") {
        val body = call.receive<RefreshRequest>()
        val decoded = server.tokens.verify(body.refreshToken, TokenService.TokenType.REFRESH)
        val userId = server.tokens.userId(decoded)
        val jti = decoded.id ?: throw UnauthorizedException("토큰이 유효하지 않아요")
        val now = System.currentTimeMillis()
        server.repo.requireRefreshActive(jti, now)
        server.repo.requireRefreshIssuedAfterReset(userId, server.tokens.issuedAtMillis(decoded))
        val user = server.repo.userById(userId) ?: throw UnauthorizedException("사용자를 찾을 수 없어요")
        call.respondAuth(server, user)
    }

    post("/auth/logout") {
        val body = call.receive<LogoutRequest>()
        val decoded = runCatching {
            server.tokens.verify(body.refreshToken, TokenService.TokenType.REFRESH)
        }.getOrNull()
        if (decoded != null && decoded.id != null) {
            val expiresAt = decoded.expiresAt?.time ?: System.currentTimeMillis()
            server.repo.revokeRefresh(server.tokens.userId(decoded), decoded.id, expiresAt, System.currentTimeMillis())
        }
        // 이미 깨진 토큰도 로그아웃은 끝난다. 브라우저가 로컬 세션을 지우게 한다.
        call.respond(HttpStatusCode.OK)
    }

    rateLimit(EmailSignupRateLimit) {
        post("/auth/signup") {
            val body = call.receive<EmailSignupRequest>()
            val consent = consentOf(body.termsAccepted, body.termsVersion)
            // 해시 비용을 쓰기 전에 닫힘과 동의를 먼저 거른다. 저장 때 잠금 안에서 다시 확인한다.
            server.repo.signupPolicy.requireConsent(consent)
            val email = normalizeEmail(body.email)
            validateEmail(email)
            validatePassword(body.password)
            val name = normalizeName(body.name)
            val user = server.repo.createEmailUser(email, PasswordHasher.hash(body.password), name, consent)
            call.respondAuth(server, user)
        }
    }

    rateLimit(EmailLoginIpRateLimit) {
        rateLimit(EmailLoginRateLimit) {
            post("/auth/login") {
                val body = call.receiveEmailLogin()
                val email = normalizeEmail(body.email)
                validateEmail(email)
                validateLoginPassword(body.password)
                if (!PasswordHasher.canVerify(body.password)) {
                    throw UnauthorizedException("메일이나 비밀번호가 맞지 않아요")
                }
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

    rateLimit(PasswordResetRateLimit) {
        post("/auth/password/reset-request") {
            val body = call.receive<PasswordResetRequestBody>()
            val email = normalizeEmail(body.email)
            // 형식이 틀린 메일은 계정이 없는 것과 같은 응답을 준다. 존재 여부를 가르지 않는다.
            if (runCatching { validateEmail(email) }.isSuccess) {
                server.repo.createPasswordReset(email, System.currentTimeMillis(), PASSWORD_RESET_TTL_MILLIS)
            }
            call.respond(HttpStatusCode.OK)
        }

        // 확인도 토큰을 보기 전에 bcrypt를 돌린다. 같은 IP 버킷에 묶어 비로그인 CPU 비용을 막는다.
        post("/auth/password/reset") {
            val body = call.receive<PasswordResetConfirmRequest>()
            if (body.token.isBlank()) throw GoneException("재설정 링크가 유효하지 않아요")
            validatePassword(body.password)
            server.repo.consumePasswordReset(body.token, PasswordHasher.hash(body.password), System.currentTimeMillis())
            call.respond(HttpStatusCode.OK)
        }
    }
}

private fun consentOf(accepted: Boolean?, version: String?): SignupConsent? =
    if (accepted == true && !version.isNullOrBlank()) SignupConsent(version.trim()) else null

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
