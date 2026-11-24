package com.moss.server

import com.moss.server.oauth.AttemptLimiter
import com.moss.server.oauth.ClientMetadataException
import com.moss.server.oauth.ClientResolver
import com.moss.server.oauth.OAuthStore
import com.moss.server.oauth.PinnedMetadataFetcher
import com.moss.server.oauth.RedirectUris
import com.moss.server.oauth.clientAddress
import com.moss.server.oauth.pkceChallenge
import kotlinx.coroutines.runBlocking
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
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
    fun metadataUrlsOnlyAllowThePlainHttpsPort() {
        assertTrue(ClientResolver.isValidMetadataUrl("https://app.example:443/client.json"))
        assertFalse(ClientResolver.isValidMetadataUrl("https://app.example:8443/client.json"))
        assertFalse(ClientResolver.isValidMetadataUrl("https://app.example:6379/client.json"))
        assertFalse(ClientResolver.isValidMetadataUrl("https://user:pw@app.example/client.json"))
    }

    @Test
    fun metadataFetchRefusesNonPublicAddresses() {
        val refused = listOf(
            "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "172.16.0.9", "172.31.255.255", "100.64.0.1", "0.0.0.0",
            "192.0.0.8", "192.0.2.1", "198.18.0.1", "198.51.100.7", "203.0.113.9", "224.0.0.1", "240.0.0.1", "255.255.255.255",
            "::1", "::", "fc00::1", "fd00:ec2::254", "fe80::1", "fec0::1", "ff02::1", "2001:db8::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2",
            "::10.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "64:ff9b::a00:1", "64:ff9b::7f00:1", "64:ff9b:1::1",
            "2002:0a00:0001::1", "2002:7f00:0001::1", "2002:a9fe:a9fe::1", "100::1",
        )
        for (ip in refused) assertFalse(PinnedMetadataFetcher.isPublicAddress(InetAddress.getByName(ip)), ip)
        for (ip in listOf("93.184.216.34", "8.8.8.8", "172.32.0.1", "100.63.255.255", "192.0.1.1", "2606:4700:4700::1111", "64:ff9b::808:808", "2002:0808:0808::1")) {
            assertTrue(PinnedMetadataFetcher.isPublicAddress(InetAddress.getByName(ip)), ip)
        }
        assertFailsWith<ClientMetadataException> {
            runBlocking { PinnedMetadataFetcher().fetch("https://localhost/client.json") }
        }
    }

    private val publicIp = InetAddress.getByName("93.184.216.34")

    /** 가짜 원격 서버: 요청을 읽고 [respond]가 낸 바이트를 쓴 뒤 [holdMillis] 동안 붙잡고 닫는다. */
    private class FakeRemote(val respond: ByteArray, val holdMillis: Long = 0) : AutoCloseable {
        val server = ServerSocket(0)
        @Volatile var request = ""
        init {
            Thread {
                runCatching {
                    server.accept().use { s ->
                        val buf = StringBuilder()
                        while (!buf.endsWith("\r\n\r\n")) buf.append(s.getInputStream().read().toChar())
                        request = buf.toString()
                        s.getOutputStream().apply { write(respond); flush() }
                        Thread.sleep(holdMillis)
                    }
                }
            }.apply { isDaemon = true }.start()
        }
        override fun close() = server.close()
    }

    private class Recorder(val addresses: List<InetAddress>, val port: Int) {
        var resolves = 0
        var connectedTo: InetAddress? = null
        var connectedHost: String? = null
        fun fetcher(timeoutMillis: Long = 5_000) = PinnedMetadataFetcher(
            resolve = { resolves++; addresses },
            openSocket = { address, _, host, _ -> connectedTo = address; connectedHost = host; Socket("127.0.0.1", port) },
            timeoutMillis = timeoutMillis,
        )
    }

    private fun ok(body: String) = "HTTP/1.0 200 OK\r\nContent-Type: application/json\r\n\r\n$body".toByteArray()

    @Test
    fun metadataFetchConnectsToTheAddressItChecked() = runBlocking {
        FakeRemote(ok("{}")).use { remote ->
            val rec = Recorder(listOf(publicIp), remote.server.localPort)
            assertEquals("{}", rec.fetcher().fetch("https://app.example/client.json?v=1"))
            // DNS는 한 번만 풀고, 검사한 그 주소와 원래 호스트 이름(TLS 이름 검사용)으로 접속한다.
            assertEquals(1, rec.resolves)
            assertEquals(publicIp, rec.connectedTo)
            assertEquals("app.example", rec.connectedHost)
            assertTrue(remote.request.startsWith("GET /client.json?v=1 HTTP/1.0\r\n"), remote.request)
            assertTrue(remote.request.contains("Host: app.example\r\n"))
        }
    }

    @Test
    fun metadataFetchRefusesBadTargetsBeforeConnecting() {
        fun check(addresses: List<InetAddress>, url: String) {
            val rec = Recorder(addresses, 1)
            assertFailsWith<ClientMetadataException>(url) { runBlocking { rec.fetcher().fetch(url) } }
            assertNull(rec.connectedTo, url)
        }
        check(listOf(publicIp), "http://app.example/client.json")
        check(listOf(publicIp), "https://app.example:8443/client.json")
        check(listOf(publicIp), "https://user@app.example/client.json")
        check(listOf(InetAddress.getByName("169.254.169.254")), "https://metadata.example/client.json")
        check(listOf(InetAddress.getByName("::1")), "https://v6.example/client.json")
        // 공개 주소와 사설 주소가 섞여 풀리면 거절한다(재바인딩용 다중 레코드).
        check(listOf(publicIp, InetAddress.getByName("10.0.0.5")), "https://mixed.example/client.json")
        check(emptyList(), "https://empty.example/client.json")
    }

    @Test
    fun metadataFetchDoesNotFollowRedirectsOrAcceptOddResponses() {
        val responses = listOf(
            "HTTP/1.0 302 Found\r\nLocation: http://169.254.169.254/latest\r\n\r\n",
            "HTTP/1.0 404 Not Found\r\n\r\n{}",
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\n{}\r\n0\r\n\r\n",
            "HTTP/1.0 200 OK\r\nContent-Encoding: gzip\r\n\r\n{}",
            "garbage",
            "HTTP/1.0 200 OK\r\n" + "X-Pad: " + "a".repeat(20_000) + "\r\n\r\n{}",
        )
        for (response in responses) {
            FakeRemote(response.toByteArray()).use { remote ->
                val rec = Recorder(listOf(publicIp), remote.server.localPort)
                assertFailsWith<ClientMetadataException>(response.take(40)) { runBlocking { rec.fetcher().fetch("https://app.example/c.json") } }
            }
        }
    }

    @Test
    fun metadataFetchCapsResponseSize() = runBlocking {
        val atLimit = "x".repeat(PinnedMetadataFetcher.MAX_BYTES)
        FakeRemote(ok(atLimit)).use { remote ->
            assertEquals(atLimit, Recorder(listOf(publicIp), remote.server.localPort).fetcher().fetch("https://app.example/c.json"))
        }
        FakeRemote(ok("x".repeat(PinnedMetadataFetcher.MAX_BYTES + 1))).use { remote ->
            assertFailsWith<ClientMetadataException> {
                Recorder(listOf(publicIp), remote.server.localPort).fetcher().fetch("https://app.example/c.json")
            }
        }
        // 끝없이 흘려보내는 서버도 상한에서 끊긴다.
        FakeRemote(ok("x".repeat(5_000_000))).use { remote ->
            assertFailsWith<ClientMetadataException> {
                Recorder(listOf(publicIp), remote.server.localPort).fetcher().fetch("https://app.example/c.json")
            }
        }
        Unit
    }

    @Test
    fun metadataFetchGivesUpOnASlowServer() {
        // 헤더 일부만 보내고 붙잡는 서버: 전체 시간 상한(여기서는 300ms)에서 끊어야 한다.
        FakeRemote("HTTP/1.0 200 OK\r\n".toByteArray(), holdMillis = 3_000).use { remote ->
            val rec = Recorder(listOf(publicIp), remote.server.localPort)
            val started = System.nanoTime()
            assertFailsWith<ClientMetadataException> { runBlocking { rec.fetcher(timeoutMillis = 300).fetch("https://app.example/c.json") } }
            assertTrue((System.nanoTime() - started) / 1_000_000 < 2_000)
        }
    }

    @Test
    fun metadataFetchGivesUpOnSlowDns() {
        // 이름 서버가 응답하지 않아도 전체 시간 상한 안에서 끝나야 한다.
        val fetcher = PinnedMetadataFetcher(
            resolve = { Thread.sleep(3_000); listOf(publicIp) },
            openSocket = { _, _, _, _ -> error("접속까지 가면 안 된다") },
            timeoutMillis = 300,
        )
        val started = System.nanoTime()
        assertFailsWith<ClientMetadataException> { runBlocking { fetcher.fetch("https://slow-dns.example/c.json") } }
        assertTrue((System.nanoTime() - started) / 1_000_000 < 2_000)
    }

    @Test
    fun tlsHandshakeIsBoundedByTheTotalDeadline() {
        // TLS 레코드를 100ms마다 한 바이트씩 흘리는 서버: 읽기마다 걸리는 soTimeout(300ms)으로는 끊기지 않으니 전체 상한이 끊어야 한다.
        ServerSocket(0).use { server ->
            Thread {
                runCatching {
                    server.accept().use { s ->
                        val out = s.getOutputStream()
                        out.write(byteArrayOf(0x16, 0x03, 0x03, 0x01, 0x00)); out.flush()
                        repeat(256) { out.write(0x02); out.flush(); Thread.sleep(100) }
                    }
                }
            }.apply { isDaemon = true }.start()
            val started = System.nanoTime()
            assertFailsWith<java.io.IOException> {
                PinnedMetadataFetcher.openTlsSocket(InetAddress.getLoopbackAddress(), server.localPort, "app.example", 300)
            }
            assertTrue((System.nanoTime() - started) / 1_000_000 < 2_000)
        }
    }

    @Test
    fun limiterKeyUsesForwardedForOnlyForTrustedHops() {
        // 기본(0)은 헤더를 보지 않는다.
        assertEquals("10.0.0.1", clientAddress("10.0.0.1", listOf("1.2.3.4"), 0))
        // 믿을 프록시 하나: 그 프록시가 덧붙인 맨 오른쪽. 클라이언트가 앞에 써 넣은 값은 무시한다.
        assertEquals("203.0.113.7", clientAddress("10.0.0.1", listOf("forged, 203.0.113.7"), 1))
        assertEquals("203.0.113.7", clientAddress("10.0.0.1", listOf("forged", "203.0.113.7"), 1))
        // 믿을 프록시 둘: 오른쪽에서 두 번째.
        assertEquals("203.0.113.7", clientAddress("10.0.0.1", listOf("forged, 203.0.113.7, 10.0.0.9"), 2))
        // 프록시를 거치지 않아 항목이 모자라면 접속 주소.
        assertEquals("10.0.0.1", clientAddress("10.0.0.1", emptyList(), 1))
        assertEquals("10.0.0.1", clientAddress("10.0.0.1", listOf("203.0.113.7"), 2))
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
        assertEquals(0, d.trustedProxyHops)
        assertEquals(1, AppConfig.fromEnv(mapOf("JWT_SECRET" to strongSecret, "TRUSTED_PROXY_HOPS" to "1")).trustedProxyHops)
        assertFailsWith<IllegalArgumentException> {
            AppConfig.fromEnv(mapOf("JWT_SECRET" to strongSecret, "TRUSTED_PROXY_HOPS" to "-1"))
        }

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
