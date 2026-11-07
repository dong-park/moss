package com.moss.server

import com.moss.server.auth.PASSWORD_RESET_TTL_MILLIS
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PasswordResetTest : ApiTest() {

    private suspend fun HttpClient.signup(email: String, password: String) =
        post("/auth/signup") {
            contentType(ContentType.Application.Json)
            setBody(EmailSignupRequest(email, password, "Moss", true, TERMS_V))
        }

    private suspend fun HttpClient.login(email: String, password: String) =
        post("/auth/login") {
            contentType(ContentType.Application.Json)
            setBody(EmailLoginRequest(email, password))
        }

    /** 응답 본문은 비어 있다. 원문은 테스트가 저장 직전에 정한다. */
    private suspend fun HttpClient.requestReset(email: String, token: String = "raw-token"): String {
        val previous = com.moss.server.boards.InviteTokens.next
        com.moss.server.boards.InviteTokens.next = { token }
        try {
            val response = post("/auth/password/reset-request") {
                contentType(ContentType.Application.Json)
                setBody(PasswordResetRequestBody(email))
            }
            assertEquals(HttpStatusCode.OK, response.status)
            assertEquals("", response.body<String>())
            return token
        } finally {
            com.moss.server.boards.InviteTokens.next = previous
        }
    }

    private suspend fun HttpClient.confirmReset(token: String, password: String) =
        post("/auth/password/reset") {
            contentType(ContentType.Application.Json)
            setBody(PasswordResetConfirmRequest(token, password))
        }

    @Test
    fun refreshIssuedRightAfterResetStillWorks() = app {
        val client = client()
        assertEquals(HttpStatusCode.OK, client.signup("fresh@example.com", "password123").status)
        val token = client.requestReset("fresh@example.com")
        assertEquals(HttpStatusCode.OK, client.confirmReset(token, "newpassword1").status)
        // 재설정과 같은 초 안에 발급돼도 새 로그인은 살아 있어야 한다.
        val auth = client.login("fresh@example.com", "newpassword1").body<AuthResponse>()
        val refreshed = client.post("/auth/refresh") {
            contentType(ContentType.Application.Json)
            setBody(RefreshRequest(auth.refreshToken))
        }
        assertEquals(HttpStatusCode.OK, refreshed.status)
    }

    @Test
    fun confirmIsRateLimitedPerIpBeforeHashing() = app {
        val client = client()
        repeat(10) { index ->
            assertEquals(HttpStatusCode.Gone, client.confirmReset("bogus-$index", "newpassword1").status, "request $index")
        }
        assertEquals(HttpStatusCode.TooManyRequests, client.confirmReset("bogus-late", "newpassword1").status)
    }

    @Test
    fun resetReplacesPasswordAndOldPasswordStopsWorking() = app {
        val client = client()
        assertEquals(HttpStatusCode.OK, client.signup("reset@example.com", "password123").status)

        val token = client.requestReset(" Reset@Example.com ")

        val session = client.login("reset@example.com", "password123").body<AuthResponse>()
        assertEquals(HttpStatusCode.OK, client.confirmReset(token, "newpassword1").status)
        assertEquals(HttpStatusCode.Unauthorized, client.login("reset@example.com", "password123").status)
        assertEquals(HttpStatusCode.OK, client.login("reset@example.com", "newpassword1").status)
        val kept = client.post("/auth/refresh") {
            contentType(ContentType.Application.Json)
            setBody(RefreshRequest(session.refreshToken))
        }
        assertEquals(HttpStatusCode.Unauthorized, kept.status)
    }

    @Test
    fun usedTokenIsRejectedTheSecondTime() = app {
        val client = client()
        client.signup("once@example.com", "password123")
        val token = client.requestReset("once@example.com")

        assertEquals(HttpStatusCode.OK, client.confirmReset(token, "newpassword1").status)
        val again = client.confirmReset(token, "anotherpass1")
        assertEquals(HttpStatusCode.Gone, again.status)
        assertEquals(HttpStatusCode.OK, client.login("once@example.com", "newpassword1").status)
        assertEquals(HttpStatusCode.Unauthorized, client.login("once@example.com", "anotherpass1").status)
    }

    @Test
    fun expiredTokenIsRejected() = app {
        val client = client()
        client.signup("old@example.com", "password123")
        val token = client.requestReset("old@example.com")
        transaction {
            PasswordResets.update({ PasswordResets.tokenHash eq com.moss.server.boards.InviteTokens.hash(token) }) {
                it[expiresAt] = System.currentTimeMillis() - 1
            }
        }

        val expired = client.confirmReset(token, "newpassword1")
        assertEquals(HttpStatusCode.Gone, expired.status)
        assertEquals(HttpStatusCode.OK, client.login("old@example.com", "password123").status)
    }

    @Test
    fun responseBodyNeverContainsTheToken() = app {
        val client = client()
        client.signup("hidden@example.com", "password123")
        val token = "hidden-token"
        val previous = com.moss.server.boards.InviteTokens.next
        com.moss.server.boards.InviteTokens.next = { token }
        try {
            val response = client.post("/auth/password/reset-request") {
                contentType(ContentType.Application.Json)
                setBody(PasswordResetRequestBody("hidden@example.com"))
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = response.body<String>()
            assertTrue(token !in body)
            assertEquals("", body)
        } finally {
            com.moss.server.boards.InviteTokens.next = previous
        }
    }

    @Test
    fun unknownEmailReturnsOkWithoutToken() = app {
        val client = client()
        client.requestReset("nobody@example.com")
        client.requestReset("not-an-email")
        assertEquals(0, transaction { PasswordResets.selectAll().count() })
    }

    @Test
    fun newerRequestInvalidatesThePreviousToken() = app {
        val client = client()
        client.signup("twice@example.com", "password123")
        val first = client.requestReset("twice@example.com", "first-token")
        val second = client.requestReset("twice@example.com", "second-token")

        assertEquals(HttpStatusCode.Gone, client.confirmReset(first, "newpassword1").status)
        assertEquals(HttpStatusCode.OK, client.confirmReset(second, "newpassword1").status)
    }

    @Test
    fun storedValueIsAHashAndTtlIsOneHour() = app {
        val client = client()
        client.signup("hash@example.com", "password123")
        val before = System.currentTimeMillis()
        val token = client.requestReset("hash@example.com", "hash-token")
        val row = transaction { PasswordResets.selectAll().single() }
        assertEquals(com.moss.server.boards.InviteTokens.hash(token), row[PasswordResets.tokenHash])
        assertTrue(row[PasswordResets.tokenHash] != token)
        val ttl = row[PasswordResets.expiresAt] - row[PasswordResets.createdAt]
        assertEquals(PASSWORD_RESET_TTL_MILLIS, ttl)
        assertTrue(row[PasswordResets.createdAt] >= before)
    }

    @Test
    fun shortNewPasswordIsRejectedAndTokenStaysUsable() = app {
        val client = client()
        client.signup("short@example.com", "password123")
        val token = client.requestReset("short@example.com")

        assertEquals(HttpStatusCode.BadRequest, client.confirmReset(token, "short").status)
        assertEquals(HttpStatusCode.OK, client.confirmReset(token, "newpassword1").status)
    }
}
