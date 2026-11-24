package com.moss.server

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.transactions.transaction
import javax.sql.DataSource
import java.util.UUID

object Users : Table("users") {
    val id = uuid("id")
    val googleSub = text("google_sub").nullable()
    val email = text("email").nullable()
    val passwordHash = text("password_hash").nullable()
    val emailVerifiedAt = long("email_verified_at").nullable()
    val name = text("name")
    val avatar = text("avatar").nullable()
    val createdAt = long("created_at")
    val termsVersion = text("terms_version").nullable()
    val termsAcceptedAt = long("terms_accepted_at").nullable()
    override val primaryKey = PrimaryKey(id)
}

/**
 * 비밀번호 재설정 토큰. 원문은 저장하지 않고 SHA-256 해시만 둔다.
 * 한 행은 한 번만 쓰인다. 같은 메일의 새 요청은 아직 안 쓴 행을 무효로 만든다.
 */
object PasswordResets : Table("password_resets") {
    val tokenHash = text("token_hash")
    val userId = uuid("user_id")
    val expiresAt = long("expires_at")
    val usedAt = long("used_at").nullable()
    val createdAt = long("created_at")
    override val primaryKey = PrimaryKey(tokenHash)
}

/** 로그아웃으로 폐기한 리프레시 토큰. 원문은 저장하지 않고 jti 해시만 둔다. */
object RevokedRefreshTokens : Table("revoked_refresh_tokens") {
    val jtiHash = text("jti_hash")
    val userId = uuid("user_id")
    val expiresAt = long("expires_at")
    val revokedAt = long("revoked_at")
    override val primaryKey = PrimaryKey(jtiHash)
}

/** 신규가입 직렬화용 잠금 행(id=1). */
/**
 * 비밀번호를 바꾼 시각. 이 시각 이전에 발급한 리프레시 토큰은 갱신하지 않는다.
 * 행이 없으면 재설정으로 끊은 적이 없다.
 */
object RefreshInvalidations : Table("refresh_invalidations") {
    val userId = uuid("user_id")
    val invalidBefore = long("invalid_before")
    override val primaryKey = PrimaryKey(userId)
}

object SignupPolicyLock : Table("signup_policy") {
    val id = short("id")
    override val primaryKey = PrimaryKey(id)
}

object Boards : Table("boards") {
    val id = text("id")
    val ownerId = uuid("owner_id")
    val name = text("name")
    val createdAt = long("created_at")
    /** 공유 보드 안 파일함이면 부모 보드 id. 권한은 부모 체인에서 물려받는다 (V6). */
    val parentId = text("parent_id").nullable()
    override val primaryKey = PrimaryKey(id)
}

object Members : Table("members") {
    val boardId = text("board_id")
    val userId = uuid("user_id")
    val role = text("role")
    val createdAt = long("created_at")
    override val primaryKey = PrimaryKey(boardId, userId)
}

object Invites : Table("invites") {
    val token = text("token")
    val boardId = text("board_id")
    val createdAt = long("created_at")
    val revokedAt = long("revoked_at").nullable()
    override val primaryKey = PrimaryKey(token)
}

object Files : Table("files") {
    val id = uuid("id")
    val boardId = text("board_id")
    val name = text("name")
    val size = long("size")
    val contentType = text("content_type").nullable()
    val createdAt = long("created_at")
    override val primaryKey = PrimaryKey(id)
}

/** Result of bringing the datasource up: either an external DB or an embedded Postgres. */
class DatabaseHandle(
    val dataSource: DataSource,
    private val embedded: EmbeddedPostgres?,
) : AutoCloseable {
    override fun close() {
        (dataSource as? HikariDataSource)?.close()
        embedded?.close()
    }
}

object DatabaseFactory {

    fun connect(config: AppConfig): DatabaseHandle {
        val handle = if (config.databaseUrl == null) startEmbedded() else connectExternal(config)
        Database.connect(handle.dataSource)
        Flyway.configure().dataSource(handle.dataSource).load().migrate()
        return handle
    }

    private fun startEmbedded(): DatabaseHandle {
        val pg = EmbeddedPostgres.builder().start()
        return DatabaseHandle(pg.postgresDatabase, pg)
    }

    private fun connectExternal(config: AppConfig): DatabaseHandle {
        val hikari = HikariDataSource(
            HikariConfig().apply {
                jdbcUrl = config.databaseUrl
                username = config.databaseUser
                password = config.databasePassword
                maximumPoolSize = 10
            },
        )
        return DatabaseHandle(hikari, null)
    }
}

suspend fun <T> dbQuery(block: () -> T): T = withContext(Dispatchers.IO) { transaction { block() } }

fun newId(): UUID = UUID.randomUUID()
