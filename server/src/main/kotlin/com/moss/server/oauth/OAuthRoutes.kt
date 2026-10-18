package com.moss.server.oauth

import com.moss.server.ApiFailure
import com.moss.server.InvalidRequestException
import com.moss.server.MossServer
import com.moss.server.NotFoundException
import com.moss.server.auth.PasswordHasher
import com.moss.server.auth.normalizeEmail
import com.moss.server.auth.validateEmail
import com.moss.server.auth.validateLoginPassword
import com.moss.server.parseUuid
import com.moss.server.requireUserId
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.Parameters
import io.ktor.server.application.ApplicationCall
import io.ktor.server.plugins.origin
import io.ktor.server.request.header
import io.ktor.server.request.receiveParameters
import io.ktor.server.request.receiveText
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondRedirect
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.net.URLEncoder
import java.security.MessageDigest
import java.util.Base64

/** OAuth 오류 응답(RFC 6749 5.2)용. StatusPages의 일반 오류 형식과 다르다. */
class OAuthException(val error: String, description: String, val status: HttpStatusCode = HttpStatusCode.BadRequest) :
    RuntimeException(description)

@Serializable
data class ProtectedResourceMetadata(
    val resource: String,
    @SerialName("authorization_servers") val authorizationServers: List<String>,
    @SerialName("bearer_methods_supported") val bearerMethodsSupported: List<String> = listOf("header"),
)

@Serializable
data class AuthorizationServerMetadata(
    val issuer: String,
    @SerialName("authorization_endpoint") val authorizationEndpoint: String,
    @SerialName("token_endpoint") val tokenEndpoint: String,
    @SerialName("registration_endpoint") val registrationEndpoint: String,
    @SerialName("revocation_endpoint") val revocationEndpoint: String,
    @SerialName("response_types_supported") val responseTypesSupported: List<String> = listOf("code"),
    @SerialName("grant_types_supported") val grantTypesSupported: List<String> =
        listOf("authorization_code", "refresh_token"),
    @SerialName("code_challenge_methods_supported") val codeChallengeMethodsSupported: List<String> = listOf("S256"),
    @SerialName("token_endpoint_auth_methods_supported") val tokenEndpointAuthMethodsSupported: List<String> =
        listOf("none"),
    @SerialName("client_id_metadata_document_supported") val clientIdMetadataDocumentSupported: Boolean = true,
    @SerialName("authorization_response_iss_parameter_supported") val issParameterSupported: Boolean = true,
)

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("token_type") val tokenType: String = "Bearer",
    @SerialName("expires_in") val expiresIn: Long,
    @SerialName("refresh_token") val refreshToken: String,
)

@Serializable
data class OAuthErrorBody(val error: String, @SerialName("error_description") val errorDescription: String)

@Serializable
data class IntrospectionResponse(
    val active: Boolean,
    val sub: String? = null,
    @SerialName("client_id") val clientId: String? = null,
    val aud: String? = null,
    val exp: Long? = null,
    @SerialName("grant_id") val grantId: String? = null,
)

/** 연결된 앱 화면(n7)이 읽는 한 줄. */
@Serializable
data class ConnectedAppDto(val id: String, val clientId: String, val clientName: String, val createdAt: Long, val lastUsedAt: Long? = null)

/** 메모리 안 고정 창 횟수 제한. 인스턴스 하나짜리 서버라 이걸로 충분하다. */
class AttemptLimiter(private val limit: Int, private val windowMillis: Long, private val now: () -> Long = System::currentTimeMillis) {
    private class Bucket(var start: Long, var count: Int)

    private val buckets = HashMap<String, Bucket>()

    @Synchronized
    fun tryAcquire(key: String): Boolean {
        val t = now()
        if (buckets.size > MAX_KEYS) buckets.entries.removeIf { t - it.value.start >= windowMillis }
        val b = buckets.getOrPut(key) { Bucket(t, 0) }
        if (t - b.start >= windowMillis) { b.start = t; b.count = 0 }
        b.count++
        return b.count <= limit
    }

    private companion object { const val MAX_KEYS = 10_000 }
}

private val CODE_CHALLENGE_RE = Regex("^[A-Za-z0-9_-]{43,128}$")
private val CODE_VERIFIER_RE = Regex("^[A-Za-z0-9._~-]{43,128}$")

fun pkceChallenge(verifier: String): String =
    Base64.getUrlEncoder().withoutPadding()
        .encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))

private val json = Json { encodeDefaults = true }

private suspend fun ApplicationCall.respondOAuthJson(status: HttpStatusCode, body: String) {
    response.header(HttpHeaders.CacheControl, "no-store")
    response.header("Pragma", "no-cache")
    respondText(body, ContentType.Application.Json, status)
}

private suspend fun ApplicationCall.oauthError(e: OAuthException) =
    respondOAuthJson(e.status, json.encodeToString(OAuthErrorBody(e.error, e.message ?: e.error)))

private fun appendQuery(uri: String, params: List<Pair<String, String?>>): String {
    val query = params.filter { it.second != null }
        .joinToString("&") { "${it.first}=${URLEncoder.encode(it.second, Charsets.UTF_8)}" }
    return uri + (if ('?' in uri) "&" else "?") + query
}

/** 인가 요청 검증 결과. 클라이언트나 redirect_uri가 틀리면 돌려보낼 곳이 없어 [PageError]다. */
private sealed interface Authz {
    data class Valid(val client: ResolvedClient, val redirectUri: String, val state: String?, val challenge: String, val resource: String) : Authz
    data class PageError(val message: String) : Authz
    data class RedirectError(val redirectUri: String, val state: String?, val error: String, val description: String) : Authz
}

fun Route.oauthRoutes(
    server: MossServer,
    store: OAuthStore = OAuthStore(server.config),
    resolver: ClientResolver = ClientResolver(store),
) {
    val config = server.config
    val registerLimiter = AttemptLimiter(limit = 20, windowMillis = 60 * 60_000L)
    val consentLoginLimiter = AttemptLimiter(limit = 10, windowMillis = 60_000L)
    val tokenLimiter = AttemptLimiter(limit = 120, windowMillis = 60_000L)

    // ---- 메타데이터 ----
    // 보호 리소스는 경로가 붙은 형태(/.well-known/oauth-protected-resource/mcp)로도 찾을 수 있다(RFC 9728).
    val resourceMetadata = ProtectedResourceMetadata(config.mcpResourceUrl, listOf(config.publicBaseUrl))
    val serverMetadata = AuthorizationServerMetadata(
        issuer = config.publicBaseUrl,
        authorizationEndpoint = "${config.publicBaseUrl}/oauth/authorize",
        tokenEndpoint = "${config.publicBaseUrl}/oauth/token",
        registrationEndpoint = "${config.publicBaseUrl}/oauth/register",
        revocationEndpoint = "${config.publicBaseUrl}/oauth/revoke",
    )
    for (path in listOf("/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/{path...}")) {
        get(path) { call.respond(resourceMetadata) }
    }
    for (path in listOf("/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/{path...}")) {
        get(path) { call.respond(serverMetadata) }
    }

    // ---- 클라이언트 등록(DCR, RFC 7591) ----
    post("/oauth/register") {
        try {
            if (!registerLimiter.tryAcquire(call.request.origin.remoteHost)) {
                throw OAuthException("rate_limited", "잠시 뒤 다시 시도해 주세요", HttpStatusCode.TooManyRequests)
            }
            val doc = runCatching { Json.parseToJsonElement(call.receiveText()) }.getOrNull() as? JsonObject
                ?: throw OAuthException("invalid_client_metadata", "JSON 객체가 필요해요")
            val uris = (doc["redirect_uris"] as? JsonArray)
                ?.map { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content ?: throw OAuthException("invalid_redirect_uri", "redirect_uris 는 문자열이어야 해요") }
                ?: throw OAuthException("invalid_redirect_uri", "redirect_uris 가 필요해요")
            if (uris.isEmpty() || uris.size > RedirectUris.MAX_URIS || !uris.all(RedirectUris::isValid)) {
                throw OAuthException("invalid_redirect_uri", "redirect_uris 가 올바르지 않아요")
            }
            val method = (doc["token_endpoint_auth_method"] as? JsonPrimitive)?.contentOrNull
            if (method != null && method != "none") {
                throw OAuthException("invalid_client_metadata", "공개 클라이언트(none)만 받아요")
            }
            val name = (doc["client_name"] as? JsonPrimitive)?.contentOrNull?.trim()?.take(100)?.takeIf { it.isNotEmpty() } ?: "MCP 클라이언트"
            val clientId = store.registerClient(name, uris)
            call.respondOAuthJson(
                HttpStatusCode.Created,
                Json.encodeToString(
                    JsonObject.serializer(),
                    JsonObject(
                        mapOf(
                            "client_id" to JsonPrimitive(clientId),
                            "client_name" to JsonPrimitive(name),
                            "redirect_uris" to JsonArray(uris.map(::JsonPrimitive)),
                            "token_endpoint_auth_method" to JsonPrimitive("none"),
                            "grant_types" to JsonArray(listOf(JsonPrimitive("authorization_code"), JsonPrimitive("refresh_token"))),
                            "response_types" to JsonArray(listOf(JsonPrimitive("code"))),
                        ),
                    ),
                ),
            )
        } catch (e: OAuthException) {
            call.oauthError(e)
        }
    }

    // ---- 인가 요청: 로그인 + 동의 ----
    suspend fun validate(params: Parameters): Authz {
        val clientId = params["client_id"]?.takeIf { it.isNotBlank() } ?: return Authz.PageError("client_id 가 필요해요")
        val client = resolver.resolve(clientId) ?: return Authz.PageError("알 수 없는 앱이에요")
        val redirectUri = params["redirect_uri"]?.takeIf { it.isNotBlank() }
            ?: client.redirectUris.singleOrNull()
            ?: return Authz.PageError("redirect_uri 가 필요해요")
        if (!RedirectUris.matches(client.redirectUris, redirectUri)) return Authz.PageError("등록되지 않은 돌아갈 주소예요")
        val state = params["state"]
        fun fail(error: String, description: String) = Authz.RedirectError(redirectUri, state, error, description)
        if (params["response_type"] != "code") return fail("unsupported_response_type", "response_type 은 code 만 받아요")
        val challenge = params["code_challenge"]
        if (challenge == null || !CODE_CHALLENGE_RE.matches(challenge)) return fail("invalid_request", "code_challenge 가 필요해요")
        if (params["code_challenge_method"] != "S256") return fail("invalid_request", "code_challenge_method 는 S256 만 받아요")
        val resource = params["resource"]?.trimEnd('/')
        if (resource != null && resource != config.mcpResourceUrl) return fail("invalid_target", "알 수 없는 resource 예요")
        return Authz.Valid(client, redirectUri, state, challenge, config.mcpResourceUrl)
    }

    fun hiddenFields(params: Parameters): Map<String, String> =
        listOf("response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "resource")
            .mapNotNull { k -> params[k]?.let { k to it } }.toMap()

    suspend fun ApplicationCall.respondPage(status: HttpStatusCode, html: String) {
        response.header(HttpHeaders.CacheControl, "no-store")
        response.header("X-Frame-Options", "DENY")
        response.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'")
        respondText(html, ContentType.Text.Html, status)
    }

    suspend fun ApplicationCall.respondAuthz(a: Authz, params: Parameters, email: String = "", error: String? = null, status: HttpStatusCode = HttpStatusCode.OK) {
        when (a) {
            is Authz.PageError -> respondPage(HttpStatusCode.BadRequest, OAuthPages.errorPage(a.message))
            is Authz.RedirectError -> respondRedirect(
                appendQuery(a.redirectUri, listOf("error" to a.error, "error_description" to a.description, "state" to a.state, "iss" to config.publicBaseUrl)),
            )
            is Authz.Valid -> respondPage(status, OAuthPages.consentPage(a.client, a.redirectUri, hiddenFields(params), email, error))
        }
    }

    get("/oauth/authorize") {
        val params = call.request.queryParameters
        call.respondAuthz(validate(params), params)
    }

    post("/oauth/authorize") {
        val params = call.receiveParameters()
        val authz = validate(params)
        if (authz !is Authz.Valid) return@post call.respondAuthz(authz, params)
        if (params["decision"] != "approve") {
            return@post call.respondRedirect(
                appendQuery(authz.redirectUri, listOf("error" to "access_denied", "error_description" to "사용자가 거부했어요", "state" to authz.state, "iss" to config.publicBaseUrl)),
            )
        }
        val email = normalizeEmail(params["email"].orEmpty())
        val password = params["password"].orEmpty()
        if (!consentLoginLimiter.tryAcquire("${call.request.origin.remoteHost}:${email.take(200)}")) {
            return@post call.respondAuthz(authz, params, email, "시도가 너무 많아요. 잠시 뒤 다시 해 주세요", HttpStatusCode.TooManyRequests)
        }
        val failed = "메일이나 비밀번호가 맞지 않아요"
        val userId = try {
            validateEmail(email)
            validateLoginPassword(password)
            if (!PasswordHasher.canVerify(password)) null else {
                val credential = server.repo.findByEmail(email)
                if (credential == null) {
                    PasswordHasher.wasteTime(password)
                    null
                } else if (!PasswordHasher.verify(password, credential.passwordHash)) null else credential.user.id
            }
        } catch (e: InvalidRequestException) {
            null
        }
        if (userId == null) return@post call.respondAuthz(authz, params, email, failed, HttpStatusCode.Unauthorized)
        val code = store.issueCode(
            CodeRecord(userId, authz.client.clientId, authz.client.name, authz.redirectUri, authz.challenge, authz.resource),
        )
        call.respondRedirect(appendQuery(authz.redirectUri, listOf("code" to code, "state" to authz.state, "iss" to config.publicBaseUrl)))
    }

    // ---- 토큰 발급·갱신 ----
    post("/oauth/token") {
        try {
            if (!tokenLimiter.tryAcquire(call.request.origin.remoteHost)) {
                throw OAuthException("rate_limited", "잠시 뒤 다시 시도해 주세요", HttpStatusCode.TooManyRequests)
            }
            val p = call.receiveParameters()
            val pair = when (p["grant_type"]) {
                "authorization_code" -> {
                    val code = p["code"] ?: throw OAuthException("invalid_request", "code 가 필요해요")
                    val verifier = p["code_verifier"]?.takeIf { CODE_VERIFIER_RE.matches(it) }
                        ?: throw OAuthException("invalid_request", "code_verifier 가 올바르지 않아요")
                    val rec = store.consumeCode(code) ?: throw OAuthException("invalid_grant", "코드가 유효하지 않아요")
                    if (p["client_id"] != rec.clientId || p["redirect_uri"] != rec.redirectUri) {
                        throw OAuthException("invalid_grant", "코드가 이 요청과 맞지 않아요")
                    }
                    if (!MessageDigest.isEqual(pkceChallenge(verifier).toByteArray(), rec.codeChallenge.toByteArray())) {
                        throw OAuthException("invalid_grant", "code_verifier 가 맞지 않아요")
                    }
                    p["resource"]?.let { if (it.trimEnd('/') != rec.resource) throw OAuthException("invalid_target", "resource 가 맞지 않아요") }
                    store.createGrant(rec)
                }
                "refresh_token" -> {
                    val token = p["refresh_token"] ?: throw OAuthException("invalid_request", "refresh_token 이 필요해요")
                    when (val result = store.refresh(token, p["client_id"])) {
                        is RefreshResult.Ok -> result.tokens
                        RefreshResult.Invalid -> throw OAuthException("invalid_grant", "갱신 토큰이 유효하지 않아요")
                        RefreshResult.Reused -> throw OAuthException("invalid_grant", "이미 쓴 갱신 토큰이라 연결을 해제했어요. 다시 연결해 주세요")
                    }
                }
                else -> throw OAuthException("unsupported_grant_type", "authorization_code 와 refresh_token 만 받아요")
            }
            call.respondOAuthJson(HttpStatusCode.OK, json.encodeToString(TokenResponse(pair.accessToken, expiresIn = pair.expiresInSeconds, refreshToken = pair.refreshToken)))
        } catch (e: OAuthException) {
            call.oauthError(e)
        }
    }

    // RFC 7009: 토큰을 가진 쪽이 스스로 연결을 끊는다. 모르는 토큰이어도 200.
    post("/oauth/revoke") {
        call.receiveParameters()["token"]?.let { store.revokeByToken(it) }
        call.respondOAuthJson(HttpStatusCode.OK, "{}")
    }

    // n4(sync)가 도구 호출마다 접근 토큰을 확인한다. 같은 내부 비밀을 쓰고, 비밀이 없으면 꺼 둔다.
    post("/oauth/introspect") {
        val secret = config.syncInternalSecret
        if (secret.isNullOrBlank()) {
            return@post call.respondOAuthJson(HttpStatusCode.ServiceUnavailable, json.encodeToString(OAuthErrorBody("unavailable", "내부 비밀이 설정되지 않았어요")))
        }
        val sent = call.request.header("X-Moss-Internal").orEmpty()
        if (!MessageDigest.isEqual(sent.toByteArray(), secret.toByteArray())) {
            return@post call.respondOAuthJson(HttpStatusCode.Unauthorized, json.encodeToString(OAuthErrorBody("unauthorized", "인증이 필요해요")))
        }
        val info = call.receiveParameters()["token"]?.let { store.introspect(it) }
        val body = if (info == null) IntrospectionResponse(active = false) else IntrospectionResponse(
            active = true, sub = info.userId.toString(), clientId = info.clientId, aud = info.resource,
            exp = info.expiresAtMillis / 1000, grantId = info.grantId.toString(),
        )
        call.respondOAuthJson(HttpStatusCode.OK, json.encodeToString(body))
    }

    // ---- 연결된 앱(T6): 웹 세션으로 목록을 보고 연결을 끊는다 ----
    get("/oauth/grants") {
        val userId = call.requireUserId(server)
        call.respond(store.grantsOf(userId).map { ConnectedAppDto(it.id.toString(), it.clientId, it.clientName, it.createdAt, it.lastUsedAt) })
    }

    delete("/oauth/grants/{id}") {
        val userId = call.requireUserId(server)
        val id = parseUuid(call.parameters["id"])
        if (!store.revokeGrant(userId, id)) throw NotFoundException("연결을 찾을 수 없어요")
        call.respond(HttpStatusCode.NoContent)
    }
}
