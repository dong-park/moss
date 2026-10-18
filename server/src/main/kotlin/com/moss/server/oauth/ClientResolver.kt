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
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

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
 * JDK HttpClient 기반. 사용자가 고른 URL을 서버가 대신 여는 것이라 SSRF를 막는다:
 * https만, 사설·루프백·링크로컬 주소로 풀리면 거절, 리다이렉트 안 따라감, 크기·시간 상한.
 * 남은 틈: 검사한 뒤 HttpClient가 DNS를 한 번 더 풀어 그 사이 주소가 바뀌는 재바인딩.
 */
class HttpClientMetadataFetcher : ClientMetadataFetcher {
    private val http = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NEVER)
        .connectTimeout(Duration.ofSeconds(3))
        .build()

    override suspend fun fetch(url: String): String = withContext(Dispatchers.IO) {
        val uri = runCatching { URI(url) }.getOrNull()
            ?: throw ClientMetadataException("클라이언트 주소가 올바르지 않아요")
        val addresses = try {
            InetAddress.getAllByName(uri.host)
        } catch (e: Exception) {
            throw ClientMetadataException("클라이언트 주소를 찾을 수 없어요")
        }
        if (addresses.isEmpty() || addresses.any { !isPublicAddress(it) }) {
            throw ClientMetadataException("클라이언트 주소가 공개 주소가 아니에요")
        }
        val request = HttpRequest.newBuilder(uri)
            .timeout(Duration.ofSeconds(5))
            .header("Accept", "application/json")
            .GET()
            .build()
        val response = try {
            http.send(request, HttpResponse.BodyHandlers.ofInputStream())
        } catch (e: Exception) {
            throw ClientMetadataException("클라이언트 문서를 가져오지 못했어요")
        }
        response.body().use { stream ->
            if (response.statusCode() != 200) throw ClientMetadataException("클라이언트 문서를 가져오지 못했어요")
            val bytes = stream.readNBytes(MAX_BYTES + 1)
            if (bytes.size > MAX_BYTES) throw ClientMetadataException("클라이언트 문서가 너무 커요")
            String(bytes, Charsets.UTF_8)
        }
    }

    companion object {
        const val MAX_BYTES = 64 * 1024

        fun isPublicAddress(address: InetAddress): Boolean {
            if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress ||
                address.isSiteLocalAddress || address.isMulticastAddress
            ) return false
            val b = address.address
            return when (address) {
                // 100.64.0.0/10(통신사 NAT), 0.0.0.0/8
                is Inet4Address -> !(b[0].toInt() == 0 ||
                    (b[0].toInt() == 100 && (b[1].toInt() and 0xC0) == 64))
                // fc00::/7(고유 로컬)
                is Inet6Address -> (b[0].toInt() and 0xFE) != 0xFC
                else -> false
            }
        }
    }
}

/**
 * D3 → A: 동적 등록(DCR)으로 만든 client_id와, https URL 자체가 client_id인 메타데이터 문서 방식을 둘 다 받는다.
 */
class ClientResolver(
    private val store: OAuthStore,
    private val fetcher: ClientMetadataFetcher = HttpClientMetadataFetcher(),
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
