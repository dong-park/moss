package com.moss.server.oauth

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.SNIHostName
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

/** 인가 요청이 가리키는 클라이언트. 이름은 동의 화면에 그대로 보이고, 등록된 redirect_uri 밖으로는 코드를 보내지 않는다. */
data class ResolvedClient(val clientId: String, val name: String, val redirectUris: List<String>)

private val uriListSerializer = ListSerializer(String.serializer())

fun encodeUris(uris: List<String>): String = Json.encodeToString(uriListSerializer, uris)
fun decodeUris(raw: String): List<String> = Json.decodeFromString(uriListSerializer, raw)

object RedirectUris {
    const val MAX_URIS = 10
    private const val MAX_LENGTH = 2000
    private val LOOPBACK_HOSTS = setOf("localhost", "127.0.0.1", "[::1]")
    private val FORBIDDEN_SCHEMES = setOf("javascript", "data", "file", "vbscript", "about", "blob", "ftp", "ws", "wss")
    private val SCHEME_RE = Regex("^[a-z][a-z0-9+.-]*$")

    private fun parse(uri: String): URI? =
        if (uri.length > MAX_LENGTH) null else runCatching { URI(uri) }.getOrNull()

    /** https, 루프백 http, 앱 커스텀 스킴(cursor:// 등)만 받는다. 프래그먼트와 userinfo는 받지 않는다. */
    fun isValid(uri: String): Boolean {
        val parsed = parse(uri) ?: return false
        val scheme = parsed.scheme?.lowercase() ?: return false
        if (parsed.fragment != null || parsed.userInfo != null) return false
        return when {
            scheme == "https" -> !parsed.host.isNullOrBlank()
            scheme == "http" -> parsed.host?.lowercase()?.let { it in LOOPBACK_HOSTS } == true
            scheme in FORBIDDEN_SCHEMES -> false
            else -> SCHEME_RE.matches(scheme)
        }
    }

    /** 문자열이 완전히 같거나, 루프백 http 끼리 포트만 다를 때(RFC 8252 7.3) 같은 주소로 본다. */
    fun matches(registered: List<String>, requested: String): Boolean {
        if (requested in registered) return true
        val req = parse(requested) ?: return false
        if (req.scheme?.lowercase() != "http" || req.host?.lowercase() !in LOOPBACK_HOSTS) return false
        return registered.any { reg ->
            val r = parse(reg) ?: return@any false
            r.scheme?.lowercase() == "http" && r.host.equals(req.host, ignoreCase = true) &&
                r.rawPath == req.rawPath && r.rawQuery == req.rawQuery
        }
    }
}

class ClientMetadataException(message: String) : RuntimeException(message)

fun interface ClientMetadataFetcher {
    /** 메타데이터 문서 원문을 가져온다. 실패하면 [ClientMetadataException]. */
    suspend fun fetch(url: String): String
}

/**
 * 사용자가 고른 URL을 서버가 대신 여는 것이라 SSRF를 막는다:
 * - https, 기본 포트(443)만 받는다.
 * - DNS를 한 번만 풀어 모든 주소가 공개 주소일 때만 쓰고, 그 푼 주소로 직접 접속한다(HttpClient가 다시 풀지 않으니 재바인딩 틈이 없다).
 *   TLS는 원래 호스트 이름으로 SNI와 인증서 이름을 검사한다.
 * - 리다이렉트는 따르지 않고(200만 받음), 응답 크기와 전체 소요 시간에 상한을 둔다.
 * 요청은 HTTP/1.0 이라 응답이 청크 없이 연결 종료로 끝난다.
 */
class PinnedMetadataFetcher(
    private val resolve: (String) -> List<InetAddress> = { InetAddress.getAllByName(it).toList() },
    private val openSocket: (InetAddress, Int, String, Int) -> Socket = ::openTlsSocket,
    private val timeoutMillis: Long = TIMEOUT_MILLIS,
) : ClientMetadataFetcher {

    override suspend fun fetch(url: String): String = withContext(Dispatchers.IO) {
        val uri = runCatching { URI(url) }.getOrNull()
            ?: throw ClientMetadataException("클라이언트 주소가 올바르지 않아요")
        val host = uri.host
        if (uri.scheme != "https" || host.isNullOrBlank() || uri.userInfo != null || uri.fragment != null ||
            (uri.port != -1 && uri.port != HTTPS_PORT)
        ) throw ClientMetadataException("클라이언트 주소가 올바르지 않아요")
        val addresses = try {
            resolve(host)
        } catch (e: Exception) {
            throw ClientMetadataException("클라이언트 주소를 찾을 수 없어요")
        }
        if (addresses.isEmpty() || addresses.any { !isPublicAddress(it) }) {
            throw ClientMetadataException("클라이언트 주소가 공개 주소가 아니에요")
        }
        val deadline = System.nanoTime() + timeoutMillis * 1_000_000
        val socket = connect(addresses, host, deadline)
        try {
            socket.use { exchange(it, host, uri, deadline) }
        } catch (e: ClientMetadataException) {
            throw e
        } catch (e: IOException) {
            throw ClientMetadataException("클라이언트 문서를 가져오지 못했어요")
        }
    }

    private fun remainingMillis(deadline: Long): Int {
        val left = (deadline - System.nanoTime()) / 1_000_000
        if (left <= 0) throw ClientMetadataException("클라이언트 문서가 너무 느려요")
        return left.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }

    /** 검사한 주소만 차례로 시도한다. 호스트 이름은 다시 풀지 않는다. */
    private fun connect(addresses: List<InetAddress>, host: String, deadline: Long): Socket {
        for (address in addresses) {
            try {
                return openSocket(address, HTTPS_PORT, host, remainingMillis(deadline))
            } catch (e: IOException) {
                continue
            }
        }
        throw ClientMetadataException("클라이언트 문서를 가져오지 못했어요")
    }

    private fun exchange(socket: Socket, host: String, uri: URI, deadline: Long): String {
        val path = (uri.rawPath?.ifEmpty { "/" } ?: "/") + (uri.rawQuery?.let { "?$it" } ?: "")
        val request = "GET $path HTTP/1.0\r\nHost: $host\r\nAccept: application/json\r\n" +
            "Accept-Encoding: identity\r\nConnection: close\r\n\r\n"
        socket.soTimeout = remainingMillis(deadline)
        socket.getOutputStream().apply { write(request.toByteArray(Charsets.ISO_8859_1)); flush() }

        val input = socket.getInputStream()
        val out = ByteArrayOutputStream()
        val chunk = ByteArray(4096)
        val cap = MAX_HEADER_BYTES + MAX_BYTES + 1
        while (out.size() < cap) {
            socket.soTimeout = remainingMillis(deadline)
            val n = try {
                input.read(chunk, 0, minOf(chunk.size, cap - out.size()))
            } catch (e: SocketTimeoutException) {
                throw ClientMetadataException("클라이언트 문서가 너무 느려요")
            }
            if (n < 0) break
            out.write(chunk, 0, n)
        }
        val bytes = out.toByteArray()
        val end = indexOfHeaderEnd(bytes)
        if (end < 0 || end > MAX_HEADER_BYTES) throw ClientMetadataException("클라이언트 응답이 올바르지 않아요")
        val lines = String(bytes, 0, end, Charsets.ISO_8859_1).split("\r\n")
        if (!STATUS_RE.matches(lines.first())) throw ClientMetadataException("클라이언트 문서를 가져오지 못했어요")
        for (line in lines.drop(1)) {
            val name = line.substringBefore(':').trim().lowercase()
            val value = line.substringAfter(':', "").trim().lowercase()
            if (name == "transfer-encoding" || (name == "content-encoding" && value != "identity")) {
                throw ClientMetadataException("클라이언트 응답이 올바르지 않아요")
            }
        }
        val bodyStart = end + 4
        if (bytes.size - bodyStart > MAX_BYTES) throw ClientMetadataException("클라이언트 문서가 너무 커요")
        return String(bytes, bodyStart, bytes.size - bodyStart, Charsets.UTF_8)
    }

    private fun indexOfHeaderEnd(b: ByteArray): Int {
        for (i in 0..b.size - 4) {
            if (b[i] == '\r'.code.toByte() && b[i + 1] == '\n'.code.toByte() && b[i + 2] == '\r'.code.toByte() && b[i + 3] == '\n'.code.toByte()) return i
        }
        return -1
    }

    companion object {
        const val MAX_BYTES = 64 * 1024
        const val TIMEOUT_MILLIS = 5_000L
        private const val MAX_HEADER_BYTES = 16 * 1024
        private const val HTTPS_PORT = 443
        private val STATUS_RE = Regex("^HTTP/1\\.[01] 200( .*)?$")

        /** 검사한 주소로 직접 연결하고, TLS 이름 검사는 원래 호스트로 한다. */
        private fun openTlsSocket(address: InetAddress, port: Int, host: String, timeoutMillis: Int): Socket {
            val raw = Socket()
            try {
                raw.connect(InetSocketAddress(address, port), timeoutMillis)
                raw.soTimeout = timeoutMillis
                val tls = (SSLSocketFactory.getDefault() as SSLSocketFactory).createSocket(raw, host, port, true) as SSLSocket
                tls.sslParameters = tls.sslParameters.apply {
                    endpointIdentificationAlgorithm = "HTTPS"
                    runCatching { SNIHostName(host) }.getOrNull()?.let { serverNames = listOf(it) }
                }
                tls.startHandshake()
                return tls
            } catch (e: Exception) {
                runCatching { raw.close() }
                throw if (e is IOException) e else IOException(e)
            }
        }

        fun isPublicAddress(address: InetAddress): Boolean {
            if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress ||
                address.isSiteLocalAddress || address.isMulticastAddress
            ) return false
            val b = address.address.map { it.toInt() and 0xFF }
            return when (address) {
                is Inet4Address -> isPublicV4(b)
                is Inet6Address -> isPublicV6(b)
                else -> false
            }
        }

        private fun isPublicV4(b: List<Int>): Boolean {
            val (a, c, d) = b
            return !(
                a == 0 || a == 10 || a == 127 || a >= 224 ||
                    (a == 100 && c in 64..127) || // 통신사 NAT
                    (a == 169 && c == 254) ||
                    (a == 172 && c in 16..31) ||
                    (a == 192 && c == 168) ||
                    (a == 192 && c == 0 && (d == 0 || d == 2)) || // 192.0.0.0/24, 192.0.2.0/24(문서용)
                    (a == 198 && c in 18..19) || // 벤치마크
                    (a == 198 && c == 51 && d == 100) ||
                    (a == 203 && c == 0 && d == 113)
                )
        }

        private fun isPublicV6(b: List<Int>): Boolean {
            val firstTenZero = b.take(10).all { it == 0 }
            if (firstTenZero && b[10] == 0 && b[11] == 0) return false // ::/96(호환 주소, 미지정, 루프백)
            if (firstTenZero && b[10] == 0xFF && b[11] == 0xFF) return isPublicV4(b.subList(12, 16)) // IPv4 매핑
            if ((b[0] and 0xFE) == 0xFC) return false // fc00::/7
            if (b[0] == 0xFE && (b[1] and 0xC0) != 0) return false // fe80::/10, fec0::/10
            if (b[0] == 0xFF) return false
            if (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xFF && b[3] == 0x9B) { // NAT64: 안에 든 IPv4가 공개여야 한다
                return b.subList(4, 12).all { it == 0 } && isPublicV4(b.subList(12, 16))
            }
            if (b[0] == 0x20 && b[1] == 0x02) return isPublicV4(b.subList(2, 6)) // 6to4
            if (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0 && b[3] == 0) return false // Teredo
            if (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0D && b[3] == 0xB8) return false // 문서용
            if (b[0] == 0x01 && b.subList(1, 8).all { it == 0 }) return false // 100::/64
            return true
        }
    }
}

/**
 * D3 → A: 동적 등록(DCR)으로 만든 client_id와, https URL 자체가 client_id인 메타데이터 문서 방식을 둘 다 받는다.
 */
class ClientResolver(
    private val store: OAuthStore,
    private val fetcher: ClientMetadataFetcher = PinnedMetadataFetcher(),
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    private val cache = ConcurrentHashMap<String, Pair<Long, ResolvedClient>>()

    /** 알 수 없거나 문서가 잘못됐으면 null. */
    suspend fun resolve(clientId: String): ResolvedClient? {
        if (!clientId.startsWith("https://")) return store.registeredClient(clientId)
        cache[clientId]?.let { (at, client) -> if (nowMillis() - at < CACHE_MILLIS) return client }
        if (!isValidMetadataUrl(clientId)) return null
        val client = try {
            parseDocument(clientId, fetcher.fetch(clientId))
        } catch (e: ClientMetadataException) {
            null
        } ?: return null
        if (cache.size >= MAX_CACHE) cache.clear()
        cache[clientId] = nowMillis() to client
        return client
    }

    companion object {
        private const val CACHE_MILLIS = 5 * 60_000L
        private const val MAX_CACHE = 500
        private const val MAX_NAME = 100

        fun isValidMetadataUrl(url: String): Boolean {
            val uri = runCatching { URI(url) }.getOrNull() ?: return false
            if (uri.scheme != "https" || uri.host.isNullOrBlank() || uri.fragment != null || uri.userInfo != null) return false
            if (uri.port != -1 && uri.port != 443) return false
            val path = uri.path ?: return false
            return path.length > 1 && path.split('/').none { it == "." || it == ".." }
        }

        fun parseDocument(clientId: String, body: String): ResolvedClient? {
            val doc = runCatching { Json.parseToJsonElement(body) }.getOrNull() as? JsonObject ?: return null
            if ((doc["client_id"] as? JsonPrimitive)?.contentOrNull != clientId) return null
            val method = (doc["token_endpoint_auth_method"] as? JsonPrimitive)?.contentOrNull
            if (method != null && method != "none") return null
            val uris = (doc["redirect_uris"] as? JsonArray)
                ?.map { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content ?: return null }
                ?: return null
            if (uris.isEmpty() || uris.size > RedirectUris.MAX_URIS || !uris.all(RedirectUris::isValid)) return null
            val name = (doc["client_name"] as? JsonPrimitive)?.contentOrNull?.trim()?.take(MAX_NAME)
                ?.takeIf { it.isNotEmpty() } ?: URI(clientId).host
            return ResolvedClient(clientId, name, uris)
        }
    }
}
