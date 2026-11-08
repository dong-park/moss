package com.moss.server

import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** PR2: 이메일과 Google 신규가입이 같은 동의 규칙과 같은 계정 상한을 지킨다. */
class SignupPolicyTest : ApiTest() {

    private fun appWith(cfg: AppConfig, block: suspend ApplicationTestBuilder.() -> Unit) = testApplication {
        application { mossModule(cfg, google, TestDb.dataSource) }
        block()
    }

    private fun cfg(cap: Long = 1000, version: String? = TERMS_V) = config.copy(accountCap = cap, termsVersion = version)

    private fun userCount() = transaction { Users.selectAll().count() }

    private fun seedGoogleUser(sub: String) = transaction {
        Users.insert {
            it[id] = newId()
            it[googleSub] = sub
            it[name] = "Old"
            it[createdAt] = 1L
        }
    }

    private suspend fun HttpClient.signup(
        email: String,
        accepted: Boolean? = true,
        version: String? = TERMS_V,
    ): HttpResponse = post("/auth/signup") {
        contentType(ContentType.Application.Json)
        setBody(EmailSignupRequest(email, "password123", "Moss", accepted, version))
    }

    private suspend fun HttpClient.google(
        token: String,
        accepted: Boolean? = true,
        version: String? = TERMS_V,
    ): HttpResponse = post("/auth/google") {
        contentType(ContentType.Application.Json)
        setBody(GoogleLoginRequest(token, accepted, version))
    }

    @Test
    fun emailSignupWithoutExplicitConsentIsRejectedAndCreatesNothing() = appWith(cfg()) {
        val c = client()
        for (r in listOf(c.signup("a@x.com", null, null), c.signup("a@x.com", false), c.signup("a@x.com", true, null), c.signup("a@x.com", true, "old"))) {
            assertEquals(HttpStatusCode.BadRequest, r.status)
            assertTrue(r.bodyAsText().contains("consent_required"))
        }
        assertEquals(0L, userCount())
    }

    @Test
    fun emailSignupRecordsVersionAndServerTime() = appWith(cfg()) {
        val before = System.currentTimeMillis()
        assertEquals(HttpStatusCode.OK, client().signup("ok@x.com").status)
        val row = transaction { Users.selectAll().where { Users.email eq "ok@x.com" }.single() }
        assertEquals(TERMS_V, row[Users.termsVersion])
        assertTrue(row[Users.termsAcceptedAt]!! >= before)
    }

    @Test
    fun unsetTermsVersionClosesNewSignupOnlyAndKeepsExistingLogin() = appWith(cfg(version = null)) {
        google.register("tok-old", "sub-old", "Old")
        seedGoogleUser("sub-old")
        val c = client()
        val email = c.signup("n@x.com")
        assertEquals(HttpStatusCode.ServiceUnavailable, email.status)
        assertTrue(email.bodyAsText().contains("signup_closed"))
        google.register("tok-new", "sub-new", "New")
        assertEquals(HttpStatusCode.ServiceUnavailable, c.google("tok-new").status)
        val existing = c.google("tok-old", null, null)
        assertEquals(HttpStatusCode.OK, existing.status)
        val refresh = c.post("/auth/refresh") {
            contentType(ContentType.Application.Json)
            setBody(RefreshRequest(kotlinx.serialization.json.Json.decodeFromString<AuthResponse>(existing.bodyAsText()).refreshToken))
        }
        assertEquals(HttpStatusCode.OK, refresh.status)
        assertEquals(1L, userCount())
    }

    @Test
    fun capZeroClosesNewSignupButExistingGoogleLoginStaysWithoutFakeConsent() = appWith(cfg(cap = 0)) {
        google.register("tok-old", "sub-old", "Old")
        seedGoogleUser("sub-old")
        google.register("tok-new", "sub-new", "New")
        val c = client()
        val full = c.signup("n@x.com")
        assertEquals(HttpStatusCode.ServiceUnavailable, full.status)
        assertTrue(full.bodyAsText().contains("signup_capacity"))
        assertEquals(HttpStatusCode.ServiceUnavailable, c.google("tok-new").status)
        assertEquals(HttpStatusCode.OK, c.google("tok-old", null, null).status)
        val row = transaction { Users.selectAll().where { Users.googleSub eq "sub-old" }.single() }
        assertNull(row[Users.termsVersion])
        assertNull(row[Users.termsAcceptedAt])
    }

    @Test
    fun newGoogleSignupNeedsConsentThenSucceedsOnRetry() = appWith(cfg()) {
        google.register("tok-new", "sub-new", "New")
        val c = client()
        val first = c.google("tok-new", null, null)
        assertEquals(HttpStatusCode.BadRequest, first.status)
        assertTrue(first.bodyAsText().contains("consent_required"))
        assertEquals(0L, userCount())
        assertEquals(HttpStatusCode.OK, c.google("tok-new").status)
        val row = transaction { Users.selectAll().where { Users.googleSub eq "sub-new" }.single() }
        assertEquals(TERMS_V, row[Users.termsVersion])
        assertNotNull(row[Users.termsAcceptedAt])
    }

    @Test
    fun expiredGoogleTokenCreatesNothing() = appWith(cfg()) {
        assertEquals(HttpStatusCode.Unauthorized, client().google("expired-token").status)
        assertEquals(0L, userCount())
    }

    @Test
    fun doubleSubmitCreatesOneAccount() = appWith(cfg()) {
        google.register("tok-new", "sub-new", "New")
        val c = client()
        val g = coroutineScope { List(4) { async { c.google("tok-new").status } }.awaitAll() }
        assertTrue(g.all { it == HttpStatusCode.OK })
        val e = coroutineScope { List(4) { async { c.signup("dup@x.com").status } }.awaitAll() }
        assertEquals(1, e.count { it == HttpStatusCode.OK })
        assertEquals(3, e.count { it == HttpStatusCode.Conflict })
        assertEquals(2L, userCount())
    }

    @Test
    fun lastSeatGoesToExactlyOneOfEmailAndGoogle() = appWith(cfg(cap = 3)) {
        seedGoogleUser("sub-1")
        seedGoogleUser("sub-2")
        repeat(5) { round ->
            transaction { Users.selectAll().count() }
            google.register("tok-$round", "sub-race-$round", "R")
            val c = client()
            val results = coroutineScope {
                listOf(async { c.signup("race$round@x.com").status }, async { c.google("tok-$round").status }).awaitAll()
            }
            if (round == 0) {
                assertEquals(1, results.count { it == HttpStatusCode.OK })
                assertEquals(1, results.count { it == HttpStatusCode.ServiceUnavailable })
            } else {
                assertEquals(2, results.count { it == HttpStatusCode.ServiceUnavailable })
            }
            assertEquals(3L, userCount())
        }
    }

    @Test
    fun accountCapConfigIsStrict() {
        assertEquals(1000L, AppConfig.parseAccountCap(null))
        assertEquals(0L, AppConfig.parseAccountCap("0"))
        assertEquals(50L, AppConfig.parseAccountCap(" 50 "))
        for (bad in listOf("-1", "abc", "", "1.5")) assertFailsWith<IllegalArgumentException> { AppConfig.parseAccountCap(bad) }
    }
}
