package com.moss.server

import com.moss.server.oauth.AttemptLimiter
import com.moss.server.oauth.ClientMetadataException
import com.moss.server.oauth.ClientResolver
import com.moss.server.oauth.HttpClientMetadataFetcher
import com.moss.server.oauth.OAuthStore
import com.moss.server.oauth.RedirectUris
import com.moss.server.oauth.pkceChallenge
import kotlinx.coroutines.runBlocking
import java.net.InetAddress
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OAuthUnitTest {

    private val strongSecret = "s".repeat(AppConfig.MIN_JWT_SECRET_BYTES)

    @Test
    fun pkceMatchesTheRfc7636Vector() {
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    }

    @Test
    fun redirectUrisAllowOnlySafeShapes() {
        assertTrue(RedirectUris.isValid("https://claude.ai/api/mcp/auth_callback"))
        assertTrue(RedirectUris.isValid("http://localhost:3000/cb"))
        assertTrue(RedirectUris.isValid("http://[::1]:8080/cb"))
        assertTrue(RedirectUris.isValid("cursor://anysphere.cursor-retrieval/oauth/callback"))
        assertFalse(RedirectUris.isValid("http://example.com/cb"))
        assertFalse(RedirectUris.isValid("https://example.com/cb#x"))
        assertFalse(RedirectUris.isValid("https://user:pw@example.com/cb"))
        assertFalse(RedirectUris.isValid("javascript:alert(1)"))
        assertFalse(RedirectUris.isValid("data:text/html,x"))
        assertFalse(RedirectUris.isValid("/relative"))
    }

    @Test
    fun redirectMatchingIsExactExceptLoopbackPorts() {
        val registered = listOf("https://a.example/cb", "http://127.0.0.1/cb")
        assertTrue(RedirectUris.matches(registered, "https://a.example/cb"))
        assertFalse(RedirectUris.matches(registered, "https://a.example/cb2"))
        assertFalse(RedirectUris.matches(registered, "https://a.example:444/cb"))
        assertTrue(RedirectUris.matches(registered, "http://127.0.0.1:51234/cb"))
        assertFalse(RedirectUris.matches(registered, "http://127.0.0.1:51234/other"))
        assertFalse(RedirectUris.matches(registered, "http://localhost:51234/cb"))
    }

    @Test
    fun metadataDocumentClientsAreValidatedAgainstTheirOwnUrl() = runBlocking {
        val url = "https://app.example/oauth/client.json"
        fun resolver(body: String) = ClientResolver(OAuthStore(AppConfig(jwtSecret = strongSecret)), { body })

        val ok = resolver("""{"client_id":"$url","client_name":"App","redirect_uris":["https://app.example/cb"]}""").resolve(url)
        assertEquals("App", ok?.name)
        assertEquals(listOf("https://app.example/cb"), ok?.redirectUris)
        // 이름이 없으면 호스트를 쓴다.
        assertEquals("app.example", resolver("""{"client_id":"$url","redirect_uris":["https://app.example/cb"]}""").resolve(url)?.name)

        assertNull(resolver("""{"client_id":"https://other.example/x.json","redirect_uris":["https://app.example/cb"]}""").resolve(url))
        assertNull(resolver("""{"client_id":"$url","redirect_uris":["http://app.example/cb"]}""").resolve(url))
        assertNull(resolver("""{"client_id":"$url","redirect_uris":[]}""").resolve(url))
        assertNull(resolver("""{"client_id":"$url","redirect_uris":["https://a/cb"],"token_endpoint_auth_method":"client_secret_basic"}""").resolve(url))
        assertNull(resolver("not json").resolve(url))
        assertNull(ClientResolver(OAuthStore(AppConfig(jwtSecret = strongSecret)), { throw ClientMetadataException("down") }).resolve(url))
    }

    @Test
    fun metadataUrlsNeedHttpsAndAPath() {
        assertTrue(ClientResolver.isValidMetadataUrl("https://app.example/client.json"))
        assertFalse(ClientResolver.isValidMetadataUrl("https://app.example"))
        assertFalse(ClientResolver.isValidMetadataUrl("https://app.example/"))
        assertFalse(ClientResolver.isValidMetadataUrl("https://app.example/a/../b"))
        assertFalse(ClientResolver.isValidMetadataUrl("https://app.example/c.json#frag"))
        assertFalse(ClientResolver.isValidMetadataUrl("http://app.example/c.json"))
    }

    @Test
    fun metadataFetchRefusesPrivateAddresses() {
        for (ip in listOf("127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "172.16.0.9", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1")) {
            assertFalse(HttpClientMetadataFetcher.isPublicAddress(InetAddress.getByName(ip)), ip)
        }
        assertTrue(HttpClientMetadataFetcher.isPublicAddress(InetAddress.getByName("93.184.216.34")))
        assertFailsWith<ClientMetadataException> {
            runBlocking { HttpClientMetadataFetcher().fetch("https://localhost/client.json") }
        }
    }

    @Test
    fun limiterBlocksAfterTheLimitAndResetsAfterTheWindow() {
        var now = 0L
        val limiter = AttemptLimiter(limit = 2, windowMillis = 1000, now = { now })
        assertTrue(limiter.tryAcquire("k"))
        assertTrue(limiter.tryAcquire("k"))
        assertFalse(limiter.tryAcquire("k"))
        assertTrue(limiter.tryAcquire("other"))
        now = 1000
        assertTrue(limiter.tryAcquire("k"))
    }

    @Test
    fun configDefaultsAndEnvForOAuth() {
        val d = AppConfig.fromEnv(mapOf("JWT_SECRET" to strongSecret))
        assertEquals("http://localhost:8080", d.publicBaseUrl)
        assertEquals("http://localhost:8080/mcp", d.mcpResourceUrl)
        assertEquals(3600L, d.mcpAccessTtlSeconds)
        assertEquals(30L * 24 * 3600, d.mcpRefreshTtlSeconds)

        val c = AppConfig.fromEnv(
            mapOf(
                "JWT_SECRET" to strongSecret,
                "PUBLIC_BASE_URL" to "https://api.moss.app/",
                "MCP_ACCESS_TTL_SECONDS" to "600",
                "MCP_REFRESH_TTL_SECONDS" to "86400",
            ),
        )
        assertEquals("https://api.moss.app", c.publicBaseUrl)
        assertEquals("https://api.moss.app/mcp", c.mcpResourceUrl)
        assertEquals(600L, c.mcpAccessTtlSeconds)
        assertEquals(86400L, c.mcpRefreshTtlSeconds)
        assertFailsWith<IllegalArgumentException> {
            AppConfig.fromEnv(mapOf("JWT_SECRET" to strongSecret, "MCP_ACCESS_TTL_SECONDS" to "0"))
        }
    }
}
