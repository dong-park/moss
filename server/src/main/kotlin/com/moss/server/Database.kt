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
