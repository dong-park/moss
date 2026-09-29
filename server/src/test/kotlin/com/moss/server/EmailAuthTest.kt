package com.moss.server

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import kotlin.math.abs
import kotlin.system.measureTimeMillis
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EmailAuthTest : ApiTest() {

    private suspend fun HttpClient.signup(email: String, password: String, name: String): HttpResponse =
        post("/auth/signup") {
            contentType(ContentType.Application.Json)
            setBody(EmailSignupRequest(email, password, name))
        }

    private suspend fun HttpClient.loginRequest(email: String, password: String): HttpResponse =
        post("/auth/login") {
            contentType(ContentType.Application.Json)
            setBody(EmailLoginRequest(email, password))
        }

    @Test
    fun signupReturnsTokensThatWork() = app {
        val response = client().signup("moss@example.com", "password123", "Moss")
        assertEquals(HttpStatusCode.OK, response.status)
        val auth = response.body<AuthResponse>()
        assertTrue(auth.accessToken.isNotBlank())
        assertTrue(auth.refreshToken.isNotBlank())
        assertEquals("Moss", auth.user.name)

        val protected = client().get("/me/boards") {
            header(HttpHeaders.Authorization, "Bearer ${auth.accessToken}")
        }
        assertEquals(HttpStatusCode.OK, protected.status)
    }

    @Test
    fun emailAccountCanRefresh() = app {
        val auth = client().signup("refresh@example.com", "password123", "Refresh").body<AuthResponse>()
        val refreshed = client().post("/auth/refresh") {
            contentType(ContentType.Application.Json)
            setBody(RefreshRequest(auth.refreshToken))
        }
        assertEquals(HttpStatusCode.OK, refreshed.status)
        assertEquals(auth.user.id, refreshed.body<AuthResponse>().user.id)
    }

    @Test
    fun duplicateSignupIs409CaseInsensitive() = app {
        assertEquals(HttpStatusCode.OK, client().signup("a@x.com", "password123", "A").status)
        val dup = client().signup(" A@X.com ", "password123", "B")
        assertEquals(HttpStatusCode.Conflict, dup.status)
        assertEquals("이미 가입된 메일이에요", dup.body<ErrorResponse>().message)
        val count = transaction { Users.selectAll().where { Users.email eq "a@x.com" }.count() }
        assertEquals(1L, count)
    }

    @Test
    fun loginNormalizesEmailCaseAndWhitespace() = app {
        val signed = client().signup("Moss@Example.com", "password123", "Moss").body<AuthResponse>()
        val logged = client().loginRequest(" moss@example.com ", "password123")
        assertEquals(HttpStatusCode.OK, logged.status)
        assertEquals(signed.user.id, logged.body<AuthResponse>().user.id)
    }

    @Test
    fun wrongPasswordAndUnknownEmailLookTheSameAndTakeSimilarTime() = app {
        client().signup("known@example.com", "password123", "Known")
        // 워밍업: bcrypt/JIT를 먼저 데운다.
        client().loginRequest("known@example.com", "wrongpass1")
        client().loginRequest("missing@example.com", "wrongpass1")

        val wrong = client().loginRequest("known@example.com", "wrongpass1")
        val unknown = client().loginRequest("missing@example.com", "wrongpass1")
        assertEquals(HttpStatusCode.Unauthorized, wrong.status)
        assertEquals(HttpStatusCode.Unauthorized, unknown.status)
        val wrongMessage = wrong.body<ErrorResponse>().message
        assertEquals("메일이나 비밀번호가 맞지 않아요", wrongMessage)
        assertEquals(wrongMessage, unknown.body<ErrorResponse>().message)

        val knownTimes = (1..3).map { measureTimeMillis { client().loginRequest("known@example.com", "wrongpass1") } }
        val missingTimes = (1..3).map { measureTimeMillis { client().loginRequest("missing@example.com", "wrongpass1") } }
        val diff = abs(knownTimes.min() - missingTimes.min())
        assertTrue(diff < 50, "응답 시간 차 ${diff}ms (known=${knownTimes.min()} missing=${missingTimes.min()})")
    }

    @Test
    fun signupRejectsBadInput() = app {
        val cases = listOf(
            Triple("bad-email", "password123", "Name"),
            Triple("a@x.com", "short7c", "Name"),
            Triple("a@x.com", "x".repeat(73), "Name"),
            Triple("a@x.com", "password123", "   "),
        )
        for ((email, password, name) in cases) {
            val response = client().signup(email, password, name)
            assertEquals(
                HttpStatusCode.BadRequest,
                response.status,
                "email=$email passwordLen=${password.length} name='$name'",
            )
        }
    }

    @Test
    fun loginRejectsMalformedEmailWith400() = app {
        assertEquals(HttpStatusCode.BadRequest, client().loginRequest("not-an-email", "password123").status)
    }

    @Test
    fun passwordIsStoredAsBcryptHash() = app {
        val password = "password123"
        client().signup("hash@example.com", password, "Hash")
        val stored = transaction {
            Users.selectAll().where { Users.email eq "hash@example.com" }.single()[Users.passwordHash]
        }
        assertTrue(stored != null && stored.startsWith("\$2a\$12\$"), "hash=$stored")
        assertFalse(stored!!.contains(password))
    }

    @Test
    fun loginIsRateLimitedAfterTenFailures() = app {
        client().signup("limit@example.com", "password123", "Limit")
        val http = client()
        repeat(10) {
            assertEquals(HttpStatusCode.Unauthorized, http.loginRequest("limit@example.com", "wrongpass1").status)
        }
        val blocked = http.loginRequest("limit@example.com", "wrongpass1")
        assertEquals(HttpStatusCode.TooManyRequests, blocked.status)
        assertEquals("잠시 뒤 다시 시도해 주세요", blocked.body<ErrorResponse>().message)
        // 맞는 비밀번호도 잠금이 풀릴 때까지 429다.
        assertEquals(HttpStatusCode.TooManyRequests, http.loginRequest("limit@example.com", "password123").status)
    }

    @Test
    fun signupIsRateLimitedAfterTwentyFromOneIp() = app {
        val http = client()
        repeat(20) { index ->
            assertEquals(HttpStatusCode.OK, http.signup("user$index@example.com", "password123", "U$index").status)
        }
        assertEquals(HttpStatusCode.TooManyRequests, http.signup("late@example.com", "password123", "Late").status)
    }

    @Test
    fun googleLoginStillWorksAlongsideEmailAccounts() = app {
        google.register("tok-g", "sub-g", "G")
        val googleAuth = login("tok-g")
        assertEquals("G", googleAuth.user.name)

        val emailAuth = client().signup("g@example.com", "password123", "E").body<AuthResponse>()
        assertTrue(emailAuth.user.id != googleAuth.user.id)

        val storedEmail = transaction {
            Users.selectAll().where { Users.googleSub eq "sub-g" }.single()[Users.email]
        }
        assertNull(storedEmail)
    }

    @Test
    fun signupRejectsEmailLongerThan254() = app {
        val longEmail = "a".repeat(250) + "@x.com"
        assertEquals(HttpStatusCode.BadRequest, client().signup(longEmail, "password123", "Name").status)
    }

    @Test
    fun loginRejectsEmailLongerThan254() = app {
        val longEmail = "a".repeat(250) + "@x.com"
        assertEquals(HttpStatusCode.BadRequest, client().loginRequest(longEmail, "password123").status)
    }

    @Test
    fun loginIsRateLimitedAcrossEmailsFromOneIp() = app {
        val http = client()
        // 메일마다 버킷이 따로여도 IP 전용 집계 60회가 걸린다. 빈 비번은 400이라 bcrypt를 아낀다.
        repeat(60) { index ->
            val response = http.loginRequest("user$index@example.com", "")
            assertEquals(HttpStatusCode.BadRequest, response.status, "request $index")
        }
        assertEquals(HttpStatusCode.TooManyRequests, http.loginRequest("late@example.com", "").status)
    }

    @Test
    fun loginWithSevenCharPasswordIsUnauthorized() = app {
        client().signup("seven@example.com", "password123", "Seven")
        // 가입 정책(8자)과 달리 로그인은 형식을 보지 않는다 — 7자도 틀린 비번이면 401.
        assertEquals(
            HttpStatusCode.Unauthorized,
            client().loginRequest("seven@example.com", "short7c").status,
        )
    }

    @Test
    fun loginWithOver72BytePasswordIsUnauthorizedNot500() = app {
        client().signup("long@example.com", "password123", "Long")
        // bcrypt는 72바이트 초과에서 예외를 던진다. 500이 아니라 같은 401이어야 한다.
        val long = "가".repeat(30)
        assertEquals(HttpStatusCode.Unauthorized, client().loginRequest("long@example.com", long).status)
        assertEquals(HttpStatusCode.Unauthorized, client().loginRequest("none@example.com", long).status)
    }

    @Test
    fun googleOnlyAccountCannotLoginWithEmail() = app {
        google.register("tok-g2", "sub-g2", "G2")
        login("tok-g2")
        // Google 전용 계정은 email이 null이라 어떤 메일로도 찾히지 않는다.
        assertEquals(
            HttpStatusCode.Unauthorized,
            client().loginRequest("g2@example.com", "password123").status,
        )
    }
}
