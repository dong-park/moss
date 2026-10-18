package com.moss.server.oauth

import com.moss.server.AppConfig
import com.moss.server.Users
import com.moss.server.dbQuery
import com.moss.server.newId
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.less
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.update
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID

object OAuthClients : Table("oauth_clients") {
    val clientId = text("client_id")
    val clientName = text("client_name")
    val redirectUris = text("redirect_uris")
    val createdAt = long("created_at")
    override val primaryKey = PrimaryKey(clientId)
}

object OAuthGrants : Table("oauth_grants") {
    val id = uuid("id")
    val userId = uuid("user_id").references(Users.id)
    val clientId = text("client_id")
    val clientName = text("client_name")
    val resource = text("resource")
    val createdAt = long("created_at")
    val lastUsedAt = long("last_used_at").nullable()
    val revokedAt = long("revoked_at").nullable()
    override val primaryKey = PrimaryKey(id)
}

object OAuthCodes : Table("oauth_codes") {
    val codeHash = text("code_hash")
    val userId = uuid("user_id").references(Users.id)
    val clientId = text("client_id")
    val clientName = text("client_name")
    val redirectUri = text("redirect_uri")
    val codeChallenge = text("code_challenge")
    val resource = text("resource")
    val expiresAt = long("expires_at")
    override val primaryKey = PrimaryKey(codeHash)
}

object OAuthTokens : Table("oauth_tokens") {
    val tokenHash = text("token_hash")
    val grantId = uuid("grant_id").references(OAuthGrants.id)
    val kind = text("kind")
    val expiresAt = long("expires_at")
    val consumedAt = long("consumed_at").nullable()
    override val primaryKey = PrimaryKey(tokenHash)
}

/** 연결된 앱 화면의 한 줄. */
data class GrantRow(
    val id: UUID,
    val clientId: String,
    val clientName: String,
    val createdAt: Long,
    val lastUsedAt: Long?,
)

/** 동의가 끝나 인가 코드에 묶여 있는 내용. */
data class CodeRecord(
    val userId: UUID,
    val clientId: String,
    val clientName: String,
    val redirectUri: String,
    val codeChallenge: String,
    val resource: String,
)

data class TokenPair(val accessToken: String, val refreshToken: String, val expiresInSeconds: Long)

/** 유효한 접근 토큰이 가리키는 연결. n4(sync의 MCP 엔드포인트)가 도구 호출마다 확인한다. */
data class TokenInfo(
    val grantId: UUID,
    val userId: UUID,
    val clientId: String,
    val resource: String,
    val expiresAtMillis: Long,
)

sealed interface RefreshResult {
    data class Ok(val tokens: TokenPair) : RefreshResult
    data object Invalid : RefreshResult
    /** 이미 쓴 갱신 토큰이 다시 왔다. 연결 전체를 폐기했다. */
    data object Reused : RefreshResult
}

/**
 * OAuth 상태 저장소. 토큰과 코드는 원문을 저장하지 않고 SHA-256 해시만 둔다.
 * 접근/갱신 토큰은 웹 세션 JWT와 형식이 달라 서로의 자리에서 통하지 않는다.
 */
class OAuthStore(private val config: AppConfig) {

    private val random = SecureRandom()

    private fun newSecret(prefix: String): String {
        val bytes = ByteArray(32).also { random.nextBytes(it) }
        return prefix + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    // ---- 클라이언트 ----

    suspend fun registerClient(name: String, redirectUris: List<String>): String = dbQuery {
        val id = "moss_" + newId().toString().replace("-", "")
        OAuthClients.insert {
            it[clientId] = id
            it[clientName] = name
            it[OAuthClients.redirectUris] = encodeUris(redirectUris)
            it[createdAt] = System.currentTimeMillis()
        }
        id
    }

    suspend fun registeredClient(clientId: String): ResolvedClient? = dbQuery {
        OAuthClients.selectAll().where { OAuthClients.clientId eq clientId }.singleOrNull()?.let {
            ResolvedClient(clientId, it[OAuthClients.clientName], decodeUris(it[OAuthClients.redirectUris]))
        }
    }

    // ---- 인가 코드 ----

    suspend fun issueCode(rec: CodeRecord): String {
        val code = newSecret("mac_")
        dbQuery {
            OAuthCodes.insert {
                it[codeHash] = sha256(code)
                it[userId] = rec.userId
                it[clientId] = rec.clientId
                it[clientName] = rec.clientName
                it[redirectUri] = rec.redirectUri
                it[codeChallenge] = rec.codeChallenge
                it[resource] = rec.resource
                it[expiresAt] = System.currentTimeMillis() + CODE_TTL_MILLIS
            }
        }
        return code
    }

    /** 코드를 한 번만 꺼낸다. 없거나 만료됐거나 이미 쓰였으면 null. */
    suspend fun consumeCode(code: String): CodeRecord? = dbQuery {
        val hash = sha256(code)
        val row = OAuthCodes.selectAll().where { OAuthCodes.codeHash eq hash }.singleOrNull()
            ?: return@dbQuery null
        // 동시에 두 번 오면 삭제에 성공한 쪽만 코드를 쓴다.
        if (OAuthCodes.deleteWhere { OAuthCodes.codeHash eq hash } == 0) return@dbQuery null
        if (row[OAuthCodes.expiresAt] < System.currentTimeMillis()) return@dbQuery null
        CodeRecord(
            row[OAuthCodes.userId], row[OAuthCodes.clientId], row[OAuthCodes.clientName],
            row[OAuthCodes.redirectUri], row[OAuthCodes.codeChallenge], row[OAuthCodes.resource],
        )
    }

    // ---- 연결과 토큰 ----

    suspend fun createGrant(rec: CodeRecord): TokenPair = dbQuery {
        purgeExpired()
        val grantId = newId()
        OAuthGrants.insert {
            it[id] = grantId
            it[userId] = rec.userId
            it[clientId] = rec.clientId
            it[clientName] = rec.clientName
            it[resource] = rec.resource
            it[createdAt] = System.currentTimeMillis()
        }
        issueTokens(grantId)
    }

    private fun issueTokens(grantId: UUID): TokenPair {
        val now = System.currentTimeMillis()
        val access = newSecret("mat_")
        val refresh = newSecret("mrt_")
        OAuthTokens.insert {
            it[tokenHash] = sha256(access)
            it[OAuthTokens.grantId] = grantId
            it[kind] = KIND_ACCESS
            it[expiresAt] = now + config.mcpAccessTtlSeconds * 1000
        }
        OAuthTokens.insert {
            it[tokenHash] = sha256(refresh)
            it[OAuthTokens.grantId] = grantId
            it[kind] = KIND_REFRESH
            it[expiresAt] = now + config.mcpRefreshTtlSeconds * 1000
        }
        return TokenPair(access, refresh, config.mcpAccessTtlSeconds)
    }

    /** 갱신 토큰을 한 번 쓰고 새 쌍을 낸다. 이미 쓴 토큰이 다시 오면 연결 전체를 폐기한다. */
    suspend fun refresh(refreshToken: String, clientId: String?): RefreshResult = dbQuery {
        val hash = sha256(refreshToken)
        val now = System.currentTimeMillis()
        val row = (OAuthTokens innerJoin OAuthGrants).selectAll()
            .where { (OAuthTokens.tokenHash eq hash) and (OAuthTokens.kind eq KIND_REFRESH) }
            .singleOrNull() ?: return@dbQuery RefreshResult.Invalid
        val grantId = row[OAuthTokens.grantId]
        if (row[OAuthGrants.revokedAt] != null || row[OAuthTokens.expiresAt] < now) {
            return@dbQuery RefreshResult.Invalid
        }
        if (clientId != null && clientId != row[OAuthGrants.clientId]) return@dbQuery RefreshResult.Invalid
        // 동시에 두 번 오면 먼저 표시한 쪽만 통과하고 나머지는 재사용으로 본다.
        val claimed = OAuthTokens.update({ (OAuthTokens.tokenHash eq hash) and OAuthTokens.consumedAt.isNull() }) {
            it[consumedAt] = now
        }
        if (claimed == 0) {
            revokeInTx(grantId)
            return@dbQuery RefreshResult.Reused
        }
        RefreshResult.Ok(issueTokens(grantId))
    }

    /** 살아 있는 접근 토큰이면 연결 정보를, 아니면 null. 마지막 사용 시각도 1분 단위로 갱신한다. */
    suspend fun introspect(accessToken: String): TokenInfo? = dbQuery {
        val hash = sha256(accessToken)
        val now = System.currentTimeMillis()
        val row = (OAuthTokens innerJoin OAuthGrants).selectAll()
            .where { (OAuthTokens.tokenHash eq hash) and (OAuthTokens.kind eq KIND_ACCESS) }
            .singleOrNull() ?: return@dbQuery null
        if (row[OAuthGrants.revokedAt] != null || row[OAuthTokens.expiresAt] < now) return@dbQuery null
        val grantId = row[OAuthGrants.id]
        val last = row[OAuthGrants.lastUsedAt]
        if (last == null || now - last > LAST_USED_GRANULARITY_MILLIS) {
            OAuthGrants.update({ OAuthGrants.id eq grantId }) { it[lastUsedAt] = now }
        }
        TokenInfo(
            grantId, row[OAuthGrants.userId], row[OAuthGrants.clientId],
            row[OAuthGrants.resource], row[OAuthTokens.expiresAt],
        )
    }

    suspend fun grantsOf(userId: UUID): List<GrantRow> = dbQuery {
        OAuthGrants.selectAll()
            .where { (OAuthGrants.userId eq userId) and OAuthGrants.revokedAt.isNull() }
            .orderBy(OAuthGrants.createdAt, org.jetbrains.exposed.sql.SortOrder.DESC)
            .map {
                GrantRow(
                    it[OAuthGrants.id], it[OAuthGrants.clientId], it[OAuthGrants.clientName],
                    it[OAuthGrants.createdAt], it[OAuthGrants.lastUsedAt],
                )
            }
    }

    /** T6: 사용자가 연결을 끊는다. 이 연결의 토큰이 모두 죽어 다음 호출부터 인증 실패다. */
    suspend fun revokeGrant(userId: UUID, grantId: UUID): Boolean = dbQuery {
        val owned = OAuthGrants.selectAll()
            .where { (OAuthGrants.id eq grantId) and (OAuthGrants.userId eq userId) and OAuthGrants.revokedAt.isNull() }
            .any()
        if (owned) revokeInTx(grantId)
        owned
    }

    /** RFC 7009: 접근/갱신 토큰 어느 쪽이든 그 연결 전체를 폐기한다. 모르는 토큰이면 아무 일도 하지 않는다. */
    suspend fun revokeByToken(token: String) {
        dbQuery {
            OAuthTokens.selectAll().where { OAuthTokens.tokenHash eq sha256(token) }.singleOrNull()
                ?.let { revokeInTx(it[OAuthTokens.grantId]) }
        }
    }

    private fun revokeInTx(grantId: UUID) {
        OAuthGrants.update({ (OAuthGrants.id eq grantId) and OAuthGrants.revokedAt.isNull() }) {
            it[revokedAt] = System.currentTimeMillis()
        }
        OAuthTokens.deleteWhere { OAuthTokens.grantId eq grantId }
    }

    private fun purgeExpired() {
        val now = System.currentTimeMillis()
        OAuthCodes.deleteWhere { expiresAt less now }
        OAuthTokens.deleteWhere { expiresAt less now }
    }

    companion object {
        const val CODE_TTL_MILLIS = 60_000L
        private const val KIND_ACCESS = "access"
        private const val KIND_REFRESH = "refresh"
        private const val LAST_USED_GRANULARITY_MILLIS = 60_000L

        fun sha256(value: String): String =
            MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
    }
}
