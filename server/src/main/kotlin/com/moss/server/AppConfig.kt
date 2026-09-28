package com.moss.server

import com.moss.server.boards.BoardRepository
import java.util.UUID

/**
 * Runtime configuration, sourced from environment variables with local-dev defaults.
 *
 * Token lifetimes follow docs/specs/FEAT-collab-auth.md §4: access 15m, refresh 30d, board 1h.
 */
data class AppConfig(
    val port: Int = 8080,
    val jwtSecret: String,
    val accessTtlSeconds: Long = 15 * 60,
    val refreshTtlSeconds: Long = 30L * 24 * 60 * 60,
    val boardTokenTtlSeconds: Long = 60 * 60,
    val googleClientId: String = "",
    // When null the app starts an embedded Postgres (local dev / no Docker).
    val databaseUrl: String? = null,
    val databaseUser: String = "postgres",
    val databasePassword: String = "postgres",
    // Optional Ktor -> Hocuspocus internal close hook (n5). Unset means "skip".
    val syncInternalUrl: String? = null,
    // Shared secret sent as `X-Moss-Internal` on the sync control hook.
    val syncInternalSecret: String? = null,
    val maxMembersPerBoard: Int = 20,
    // Board attachment storage root (n10, D12). A docker volume mounts here.
    val filesDir: String = "/data/files",
    // Per-file cap (n10, D12). Defaults live here so a PREVIOUS bug report cannot
    // silently change them; env vars override for ops.
    val maxFileBytes: Long = DEFAULT_MAX_FILE_BYTES,
    // Per-board cap; kept in step with [BoardRepository].
    val maxBoardFileBytes: Long = BoardRepository.DEFAULT_MAX_BOARD_FILE_BYTES,
    // Browser origins allowed by CORS. Exact matches only, never a wildcard.
    val allowedOrigins: List<String> = listOf(DEFAULT_ALLOWED_ORIGIN),
) {
    companion object {
        const val MIN_JWT_SECRET_BYTES = 32
        const val DEFAULT_ALLOWED_ORIGIN = "http://localhost:3000"

        /** D12: 20 MB per file. */
        const val DEFAULT_MAX_FILE_BYTES: Long = 20L * 1024 * 1024

        fun fromEnv(env: Map<String, String> = System.getenv()): AppConfig {
            val jwtSecret = env["JWT_SECRET"]
            require(!jwtSecret.isNullOrBlank()) { "JWT_SECRET is required" }
            require(jwtSecret.toByteArray(Charsets.UTF_8).size >= MIN_JWT_SECRET_BYTES) {
                "JWT_SECRET must be at least $MIN_JWT_SECRET_BYTES bytes"
            }
            // [P1] The sync control hook is secret-gated. A URL without the
            // secret would make every revoke/kick silently 401 (fail-open), so
            // refuse to boot instead.
            val syncInternalUrl = env["SYNC_INTERNAL_URL"]
            val syncInternalSecret = env["SYNC_INTERNAL_SECRET"]
            require(syncInternalUrl.isNullOrBlank() || !syncInternalSecret.isNullOrBlank()) {
                "SYNC_INTERNAL_SECRET is required when SYNC_INTERNAL_URL is set"
            }
            return AppConfig(
                port = env["PORT"]?.toIntOrNull() ?: 8080,
                jwtSecret = jwtSecret,
                googleClientId = env["GOOGLE_CLIENT_ID"] ?: "",
                databaseUrl = env["DATABASE_URL"],
                databaseUser = env["DATABASE_USER"] ?: "postgres",
                databasePassword = env["DATABASE_PASSWORD"] ?: "postgres",
                syncInternalUrl = syncInternalUrl,
                syncInternalSecret = syncInternalSecret,
                maxMembersPerBoard = env["MAX_MEMBERS_PER_BOARD"]?.let { raw ->
                    requireNotNull(raw.toIntOrNull()?.takeIf { it > 0 }) { "MAX_MEMBERS_PER_BOARD must be a positive integer, got '$raw'" }
                } ?: 20,
                filesDir = env["FILES_DIR"]?.takeIf { it.isNotBlank() } ?: "/data/files",
                maxFileBytes = env["MAX_FILE_BYTES"]?.let { positiveBytes("MAX_FILE_BYTES", it) }
                    ?: DEFAULT_MAX_FILE_BYTES,
                maxBoardFileBytes = env["MAX_BOARD_FILE_BYTES"]?.let { positiveBytes("MAX_BOARD_FILE_BYTES", it) }
                    ?: BoardRepository.DEFAULT_MAX_BOARD_FILE_BYTES,
                allowedOrigins = parseAllowedOrigins(env["ALLOWED_ORIGINS"]),
            )
        }

        fun parseAllowedOrigins(raw: String?): List<String> {
            val origins = raw?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }.orEmpty()
            require(origins.none { it.contains('*') }) { "ALLOWED_ORIGINS must not contain a wildcard" }
            require(origins.all { "://" in it }) { "ALLOWED_ORIGINS entries must be scheme://host[:port]" }
            return origins.ifEmpty { listOf(DEFAULT_ALLOWED_ORIGIN) }
        }

        private fun positiveBytes(name: String, raw: String): Long =
            requireNotNull(raw.toLongOrNull()?.takeIf { it > 0 }) {
                "$name must be a positive integer, got '$raw'"
            }
    }
}

data class GoogleUser(val sub: String, val name: String, val avatar: String?)

private val BOARD_ID_RE = Regex("^[A-Za-z0-9_-]{1,64}$")

/**
 * Board ids are opaque client-chosen strings (web `b-…` ids too). The allowlist keeps
 * them safe as a path segment under FILES_DIR and in the sync URL. Must match
 * `isBoardId` in the sync server.
 */
fun parseBoardId(raw: String?): String {
    val id = raw ?: throw InvalidRequestException("보드 id 가 필요해요")
    if (!BOARD_ID_RE.matches(id)) throw InvalidRequestException("보드 id 형식이 올바르지 않아요")
    return id
}

fun parseUuid(raw: String?, field: String = "id"): UUID =
    try {
        UUID.fromString(raw ?: throw InvalidRequestException("$field 가 필요해요"))
    } catch (e: IllegalArgumentException) {
        throw InvalidRequestException("$field 형식이 올바르지 않아요")
    }
