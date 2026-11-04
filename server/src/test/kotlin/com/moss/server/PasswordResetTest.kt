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
import kotlin.test.assertNotNull
import kotlin.test.assertNull
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

    private suspend fun HttpClient.requestReset(email: String) =
        post("/auth/password/reset-request") {
            contentType(ContentType.Application.Json)
            setBody(PasswordResetRequestBody(email))
        }

    private suspend fun HttpClient.confirmReset(token: String, password: String) =
        post("/auth/password/reset") {
            contentType(ContentType.Application.Json)
            setBody(PasswordResetConfirmRequest(token, password))
        }

    @Test
    fun resetReplacesPasswordAndOldPasswordStopsWorking() = app {
        val client = client()
        assertEquals(HttpStatusCode.OK, client.signup("reset@example.com", "password123").status)

        val issued = client.requestReset(" Reset@Example.com ")
        assertEquals(HttpStatusCode.OK, issued.status)
        val token = issued.body<PasswordResetRequestResponse>().token
        assertNotNull(token)

        assertEquals(HttpStatusCode.OK, client.confirmReset(token, "newpassword1").status)
        assertEquals(HttpStatusCode.Unauthorized, client.login("reset@example.com", "password123").status)
        assertEquals(HttpStatusCode.OK, client.login("reset@example.com", "newpassword1").status)
    }

    @Test
    fun usedTokenIsRejectedTheSecondTime() = app {
        val client = client()
        client.signup("once@example.com", "password123")
        val token = client.requestReset("once@example.com").body<PasswordResetRequestResponse>().token!!

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
        val token = client.requestReset("old@example.com").body<PasswordResetRequestResponse>().token!!
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
    fun unknownEmailReturnsOkWithoutToken() = app {
        val client = client()
        val missing = client.requestReset("nobody@example.com")
        assertEquals(HttpStatusCode.OK, missing.status)
        assertNull(missing.body<PasswordResetRequestResponse>().token)

        val bad = client.requestReset("not-an-email")
        assertEquals(HttpStatusCode.OK, bad.status)
        assertNull(bad.body<PasswordResetRequestResponse>().token)
    }

    @Test
    fun newerRequestInvalidatesThePreviousToken() = app {
        val client = client()
        client.signup("twice@example.com", "password123")
        val first = client.requestReset("twice@example.com").body<PasswordResetRequestResponse>().token!!
        val second = client.requestReset("twice@example.com").body<PasswordResetRequestResponse>().token!!

        assertEquals(HttpStatusCode.Gone, client.confirmReset(first, "newpassword1").status)
        assertEquals(HttpStatusCode.OK, client.confirmReset(second, "newpassword1").status)
    }

    @Test
    fun storedValueIsAHashAndTtlIsOneHour() = app {
        val client = client()
        client.signup("hash@example.com", "password123")
        val before = System.currentTimeMillis()
        val token = client.requestReset("hash@example.com").body<PasswordResetRequestResponse>().token!!
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
        val token = client.requestReset("short@example.com").body<PasswordResetRequestResponse>().token!!

        assertEquals(HttpStatusCode.BadRequest, client.confirmReset(token, "short").status)
        assertEquals(HttpStatusCode.OK, client.confirmReset(token, "newpassword1").status)
    }
}
