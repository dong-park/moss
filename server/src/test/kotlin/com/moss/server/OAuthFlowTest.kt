package com.moss.server

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.forms.submitForm
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.parameters
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import com.moss.server.oauth.OAuthTokens
import com.moss.server.oauth.OAuthCodes
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.transactions.transaction
import java.net.URI
import java.net.URLDecoder
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OAuthFlowTest : ApiTest() {

    private val cfg = config.copy(
        syncInternalSecret = "internal-secret",
        publicBaseUrl = "https://moss.test",
        mcpResourceUrl = "https://moss.test/mcp",
    )

    // RFC 7636 부록 B의 값 쌍.
    private val verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    private val challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    private val redirect = "https://claude.example/callback"

    private fun oauthApp(appConfig: AppConfig = cfg, block: suspend ApplicationTestBuilder.() -> Unit) = testApplication {
        application { mossModule(appConfig, google, TestDb.dataSource) }
        block()
    }

    private fun ApplicationTestBuilder.plain(): HttpClient = createClient {
        followRedirects = false
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    }

    private suspend fun HttpClient.signup(email: String = "moss@example.com", password: String = "password123"): AuthResponse =
        post("/auth/signup") {
            contentType(ContentType.Application.Json)
            setBody(EmailSignupRequest(email, password, "Moss"))
        }.body()

    private suspend fun HttpClient.register(uris: String = "[\"$redirect\"]"): String {
        val res = post("/oauth/register") {
            contentType(ContentType.Application.Json)
            setBody("""{"client_name":"Claude","redirect_uris":$uris}""")
        }
        assertEquals(HttpStatusCode.Created, res.status, res.bodyAsText())
        return Json.parseToJsonElement(res.bodyAsText()).jsonObject["client_id"]!!.jsonPrimitive.content
    }

    private suspend fun HttpClient.decide(
        clientId: String,
        email: String = "moss@example.com",
        password: String = "password123",
        decision: String = "approve",
        redirectUri: String = redirect,
        extra: Map<String, String> = emptyMap(),
    ): HttpResponse {
        val fields = mapOf(
            "response_type" to "code",
            "client_id" to clientId,
            "redirect_uri" to redirectUri,
            "state" to "xyz",
            "code_challenge" to challenge,
            "code_challenge_method" to "S256",
            "email" to email,
            "password" to password,
            "decision" to decision,
        ) + extra
        return submitForm("/oauth/authorize", parameters { fields.forEach { (k, v) -> append(k, v) } })
    }

    private fun HttpResponse.location(): URI = URI(headers[HttpHeaders.Location]!!)

    private fun URI.params(): Map<String, String> =
        rawQuery.orEmpty().split('&').filter { it.isNotEmpty() }.associate {
            val (k, v) = it.split('=', limit = 2)
            k to URLDecoder.decode(v, Charsets.UTF_8)
        }

    private suspend fun HttpClient.exchange(clientId: String, code: String, codeVerifier: String = verifier): HttpResponse =
        submitForm("/oauth/token", parameters {
            append("grant_type", "authorization_code")
            append("code", code)
            append("client_id", clientId)
            append("redirect_uri", redirect)
            append("code_verifier", codeVerifier)
        })

    private suspend fun HttpClient.refresh(token: String, clientId: String?): HttpResponse =
        submitForm("/oauth/token", parameters {
            append("grant_type", "refresh_token")
            append("refresh_token", token)
            clientId?.let { append("client_id", it) }
        })

    private suspend fun HttpClient.introspect(token: String, secret: String = "internal-secret"): HttpResponse =
        submitForm("/oauth/introspect", parameters { append("token", token) }) {
            header("X-Moss-Internal", secret)
        }

    private suspend fun HttpResponse.obj(): JsonObject = Json.parseToJsonElement(bodyAsText()).jsonObject

    /** 등록 → 로그인·동의 → 코드 교환까지 끝낸 토큰. */
    private suspend fun HttpClient.connect(clientId: String): JsonObject {
        val code = decide(clientId).location().params().getValue("code")
        return exchange(clientId, code).also { assertEquals(HttpStatusCode.OK, it.status) }.obj()
    }

    @Test
    fun metadataDocumentsDescribeTheEndpoints() = oauthApp {
        val client = plain()
        val resource = client.get("/.well-known/oauth-protected-resource").obj()
        assertEquals("https://moss.test/mcp", resource["resource"]!!.jsonPrimitive.content)
        assertEquals("https://moss.test", resource["authorization_servers"]!!.jsonArray[0].jsonPrimitive.content)
        // 경로가 붙은 형태로도 찾을 수 있다.
        assertEquals(HttpStatusCode.OK, client.get("/.well-known/oauth-protected-resource/mcp").status)

        val server = client.get("/.well-known/oauth-authorization-server").obj()
        assertEquals("https://moss.test/oauth/authorize", server["authorization_endpoint"]!!.jsonPrimitive.content)
        assertEquals("https://moss.test/oauth/token", server["token_endpoint"]!!.jsonPrimitive.content)
        assertEquals("https://moss.test/oauth/register", server["registration_endpoint"]!!.jsonPrimitive.content)
        assertEquals("S256", server["code_challenge_methods_supported"]!!.jsonArray[0].jsonPrimitive.content)
        assertEquals("true", server["client_id_metadata_document_supported"]!!.jsonPrimitive.content)
    }

    @Test
    fun connectorFlowIssuesTokensAndLeavesTheWebSessionAlone() = oauthApp {
        val client = plain()
        val web = client.signup()
        val clientId = client.register()

        val page = client.get("/oauth/authorize") {
            url {
                parameters.append("response_type", "code")
                parameters.append("client_id", clientId)
                parameters.append("redirect_uri", redirect)
                parameters.append("code_challenge", challenge)
                parameters.append("code_challenge_method", "S256")
            }
        }
        assertEquals(HttpStatusCode.OK, page.status)
        assertTrue("Claude" in page.bodyAsText())
        assertEquals("DENY", page.headers["X-Frame-Options"])

        val approved = client.decide(clientId)
        assertEquals(HttpStatusCode.Found, approved.status)
        val back = approved.location()
        assertEquals("claude.example", back.host)
        assertEquals("xyz", back.params()["state"])
        val tokens = client.exchange(clientId, back.params().getValue("code")).obj()
        val access = tokens["access_token"]!!.jsonPrimitive.content
        assertEquals("Bearer", tokens["token_type"]!!.jsonPrimitive.content)
        assertEquals("3600", tokens["expires_in"]!!.jsonPrimitive.content)
        assertTrue(tokens["refresh_token"]!!.jsonPrimitive.content.isNotBlank())

        val info = client.introspect(access).obj()
        assertEquals("true", info["active"]!!.jsonPrimitive.content)
        assertEquals(web.user.id, info["sub"]!!.jsonPrimitive.content)
        assertEquals("https://moss.test/mcp", info["aud"]!!.jsonPrimitive.content)

        // MCP 토큰은 웹 API에서 통하지 않고, 웹 세션은 그대로 쓸 수 있다.
        assertEquals(HttpStatusCode.Unauthorized, client.authedGet("/me/boards", access).status)
        assertEquals(HttpStatusCode.OK, client.authedGet("/me/boards", web.accessToken).status)
    }

    @Test
    fun withoutLoginNothingIsConnected() = oauthApp {
        val client = plain()
        client.signup()
        val clientId = client.register()

        val wrong = client.decide(clientId, password = "not-the-password")
        assertEquals(HttpStatusCode.Unauthorized, wrong.status)
        assertNull(wrong.headers[HttpHeaders.Location])
        val unknown = client.decide(clientId, email = "nobody@example.com")
        assertEquals(HttpStatusCode.Unauthorized, unknown.status)
        assertNull(unknown.headers[HttpHeaders.Location])

        val denied = client.decide(clientId, password = "", decision = "deny")
        assertEquals(HttpStatusCode.Found, denied.status)
        assertEquals("access_denied", denied.location().params()["error"])
        assertNull(denied.location().params()["code"])
    }

    @Test
    fun unknownClientOrUnregisteredRedirectNeverRedirects() = oauthApp {
        val client = plain()
        client.signup()
        val clientId = client.register()

        val badRedirect = client.decide(clientId, redirectUri = "https://evil.example/cb")
        assertEquals(HttpStatusCode.BadRequest, badRedirect.status)
        assertNull(badRedirect.headers[HttpHeaders.Location])
        assertEquals(HttpStatusCode.BadRequest, client.decide("moss_nope").status)
    }

    @Test
    fun registrationRejectsBadRedirectUris() = oauthApp {
        val client = plain()
        for (bad in listOf("[\"javascript:alert(1)\"]", "[\"http://example.com/cb\"]", "[\"https://a.example/cb#frag\"]", "[]")) {
            val res = client.post("/oauth/register") {
                contentType(ContentType.Application.Json)
                setBody("""{"redirect_uris":$bad}""")
            }
            assertEquals(HttpStatusCode.BadRequest, res.status, bad)
            assertEquals("invalid_redirect_uri", res.obj()["error"]!!.jsonPrimitive.content)
        }
        // 루프백 http 와 앱 커스텀 스킴은 받는다.
        client.register("[\"http://127.0.0.1:33418/cb\",\"cursor://anysphere.cursor-retrieval/oauth\"]")
    }

    @Test
    fun invalidAuthorizeParametersComeBackAsRedirectErrors() = oauthApp {
        val client = plain()
        client.signup()
        val clientId = client.register()
        val badMethod = client.decide(clientId, extra = mapOf("code_challenge_method" to "plain"))
        assertEquals("invalid_request", badMethod.location().params()["error"])
        val badResource = client.decide(clientId, extra = mapOf("resource" to "https://other.example/mcp"))
        assertEquals("invalid_target", badResource.location().params()["error"])
        val goodResource = client.decide(clientId, extra = mapOf("resource" to "https://moss.test/mcp/"))
        assertNotNull(goodResource.location().params()["code"])
    }

    @Test
    fun codeIsSingleUseAndBoundToPkceAndClient() = oauthApp {
        val client = plain()
        client.signup()
        val clientId = client.register()

        val code = client.decide(clientId).location().params().getValue("code")
        val wrongVerifier = client.exchange(clientId, code, "x".repeat(43))
        assertEquals(HttpStatusCode.BadRequest, wrongVerifier.status)
        // 틀린 시도에서도 코드는 소모된다.
        assertEquals("invalid_grant", client.exchange(clientId, code).obj()["error"]!!.jsonPrimitive.content)

        val code2 = client.decide(clientId).location().params().getValue("code")
        assertEquals(HttpStatusCode.OK, client.exchange(clientId, code2).status)
        assertEquals("invalid_grant", client.exchange(clientId, code2).obj()["error"]!!.jsonPrimitive.content)

        val otherClient = client.register()
        val code3 = client.decide(clientId).location().params().getValue("code")
        assertEquals("invalid_grant", client.exchange(otherClient, code3).obj()["error"]!!.jsonPrimitive.content)
    }

    @Test
    fun expiredCodeAndExpiredAccessTokenAreRejected() = oauthApp {
        val client = plain()
        client.signup()
        val clientId = client.register()

        val code = client.decide(clientId).location().params().getValue("code")
        transaction { OAuthCodes.update { it[expiresAt] = 1L } }
        assertEquals("invalid_grant", client.exchange(clientId, code).obj()["error"]!!.jsonPrimitive.content)

        val access = client.connect(clientId)["access_token"]!!.jsonPrimitive.content
        transaction { OAuthTokens.update({ OAuthTokens.kind eq "access" }) { it[expiresAt] = 1L } }
        assertEquals("false", client.introspect(access).obj()["active"]!!.jsonPrimitive.content)
    }

    @Test
    fun refreshRotatesAndReuseRevokesTheConnection() = oauthApp {
        val client = plain()
        client.signup()
        val clientId = client.register()
        val first = client.connect(clientId)
        val refresh1 = first["refresh_token"]!!.jsonPrimitive.content

        val second = client.refresh(refresh1, clientId).also { assertEquals(HttpStatusCode.OK, it.status) }.obj()
        val access2 = second["access_token"]!!.jsonPrimitive.content
        val refresh2 = second["refresh_token"]!!.jsonPrimitive.content
        assertEquals("true", client.introspect(access2).obj()["active"]!!.jsonPrimitive.content)

        // 옛 갱신 토큰을 다시 내면 연결 전체가 죽는다.
        assertEquals(HttpStatusCode.BadRequest, client.refresh(refresh1, clientId).status)
        assertEquals("false", client.introspect(access2).obj()["active"]!!.jsonPrimitive.content)
        assertEquals(HttpStatusCode.BadRequest, client.refresh(refresh2, clientId).status)
    }

    @Test
    fun refreshFromAnotherClientEndsTheConnection() = oauthApp {
        val client = plain()
        client.signup()
        val clientId = client.register()
        val otherClientId = client.register()
        val tokens = client.connect(clientId)
        val refresh = tokens["refresh_token"]!!.jsonPrimitive.content
        val access = tokens["access_token"]!!.jsonPrimitive.content

        val missing = client.refresh(refresh, null)
        assertEquals(HttpStatusCode.BadRequest, missing.status)
        assertEquals("invalid_request", missing.obj()["error"]!!.jsonPrimitive.content)
        // client_id 가 빠진 요청은 형식 오류일 뿐이라 연결을 건드리지 않는다.
        assertEquals("true", client.introspect(access).obj()["active"]!!.jsonPrimitive.content)

        // 다른 클라이언트가 갱신 토큰을 내면 샌 것으로 보고 재사용과 같게 연결 전체를 끊는다.
        val other = client.refresh(refresh, otherClientId)
        assertEquals(HttpStatusCode.BadRequest, other.status)
        assertEquals("invalid_grant", other.obj()["error"]!!.jsonPrimitive.content)
        assertEquals("false", client.introspect(access).obj()["active"]!!.jsonPrimitive.content)
        assertEquals(HttpStatusCode.BadRequest, client.refresh(refresh, clientId).status)
    }

    @Test
    fun authorizeRequestsAreRateLimited() = oauthApp {
        val client = plain()
        repeat(60) { assertEquals(HttpStatusCode.BadRequest, client.get("/oauth/authorize?client_id=moss_nope").status) }
        assertEquals(HttpStatusCode.TooManyRequests, client.get("/oauth/authorize?client_id=moss_nope").status)
        assertEquals(HttpStatusCode.TooManyRequests, client.decide("moss_nope").status)
    }

    @Test
    fun forgedForwardedForDoesNotEscapeTheAuthorizeLimit() = oauthApp {
        // 기본값(믿을 프록시 0)에서는 헤더를 보지 않으므로 요청마다 다른 값을 넣어도 한 버킷이다.
        val client = plain()
        repeat(60) { i ->
            assertEquals(HttpStatusCode.BadRequest, client.get("/oauth/authorize?client_id=moss_nope") { header("X-Forwarded-For", "198.51.100.$i") }.status)
        }
        assertEquals(HttpStatusCode.TooManyRequests, client.get("/oauth/authorize?client_id=moss_nope") { header("X-Forwarded-For", "198.51.100.99") }.status)
    }

    @Test
    fun trustedProxyHopsSplitTheAuthorizeLimitPerClient() = oauthApp(cfg.copy(trustedProxyHops = 1)) {
        val client = plain()
        // 프록시가 덧붙인 맨 오른쪽 주소가 같으면, 왼쪽을 위조해도 같은 버킷이다.
        repeat(60) { i ->
            assertEquals(HttpStatusCode.BadRequest, client.get("/oauth/authorize?client_id=moss_nope") { header("X-Forwarded-For", "forged-$i, 203.0.113.7") }.status)
        }
        assertEquals(HttpStatusCode.TooManyRequests, client.get("/oauth/authorize?client_id=moss_nope") { header("X-Forwarded-For", "forged-x, 203.0.113.7") }.status)
        // 프록시 뒤의 다른 사용자는 자기 버킷을 쓴다.
        assertEquals(HttpStatusCode.BadRequest, client.get("/oauth/authorize?client_id=moss_nope") { header("X-Forwarded-For", "203.0.113.8") }.status)
    }

    @Test
    fun disconnectingFromConnectedAppsBlocksTheNextCall() = oauthApp {
        val client = plain()
        val web = client.signup()
        val clientId = client.register()
        val tokens = client.connect(clientId)
        val access = tokens["access_token"]!!.jsonPrimitive.content
        val refresh = tokens["refresh_token"]!!.jsonPrimitive.content

        val list = client.authedGet("/oauth/grants", web.accessToken).bodyAsText()
        val grants = Json.parseToJsonElement(list).jsonArray
        assertEquals(1, grants.size)
        assertEquals("Claude", grants[0].jsonObject["clientName"]!!.jsonPrimitive.content)
        val grantId = grants[0].jsonObject["id"]!!.jsonPrimitive.content
        assertEquals("true", client.introspect(access).obj()["active"]!!.jsonPrimitive.content)

        // 다른 사용자는 이 연결을 끊을 수 없다.
        val other = client.signup("other@example.com")
        assertEquals(HttpStatusCode.NotFound, client.authedDelete("/oauth/grants/$grantId", other.accessToken).status)
        assertEquals("true", client.introspect(access).obj()["active"]!!.jsonPrimitive.content)

        assertEquals(HttpStatusCode.NoContent, client.authedDelete("/oauth/grants/$grantId", web.accessToken).status)
        assertEquals("false", client.introspect(access).obj()["active"]!!.jsonPrimitive.content)
        assertEquals(HttpStatusCode.BadRequest, client.refresh(refresh, clientId).status)
        assertEquals(0, Json.parseToJsonElement(client.authedGet("/oauth/grants", web.accessToken).bodyAsText()).jsonArray.size)
    }

    @Test
    fun revokeEndpointEndsTheConnectionWithEitherToken() = oauthApp {
        val client = plain()
        client.signup()
        val clientId = client.register()
        val tokens = client.connect(clientId)
        val access = tokens["access_token"]!!.jsonPrimitive.content
        val refresh = tokens["refresh_token"]!!.jsonPrimitive.content

        assertEquals(HttpStatusCode.OK, client.submitForm("/oauth/revoke", parameters { append("token", refresh) }).status)
        assertEquals("false", client.introspect(access).obj()["active"]!!.jsonPrimitive.content)
        assertEquals(HttpStatusCode.OK, client.submitForm("/oauth/revoke", parameters { append("token", "unknown") }).status)
    }

    @Test
    fun introspectionNeedsTheInternalSecret() = oauthApp {
        val client = plain()
        assertEquals(HttpStatusCode.Unauthorized, client.introspect("mat_x", secret = "wrong").status)
        assertEquals(HttpStatusCode.Unauthorized, client.submitForm("/oauth/introspect", parameters { append("token", "x") }).status)
        assertEquals("false", client.introspect("mat_unknown").obj()["active"]!!.jsonPrimitive.content)
    }

    @Test
    fun tooManyPasswordGuessesAreStopped() = oauthApp {
        val client = plain()
        client.signup()
        val clientId = client.register()
        repeat(10) { client.decide(clientId, password = "bad-guess-$it") }
        assertEquals(HttpStatusCode.TooManyRequests, client.decide(clientId, password = "password123").status)
    }
}
