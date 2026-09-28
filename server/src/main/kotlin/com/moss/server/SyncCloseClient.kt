package com.moss.server

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.UUID

/**
 * Best-effort hook into the Hocuspocus server (n5) so a board share/revoke can drop
 * live connections. n4 is built before n5, so when [AppConfig.syncInternalUrl] is unset
 * the call is skipped. The contract n5 must expose:
 *   POST {base}/internal/close/{boardId}            -> drop every connection to the board
 *   POST {base}/internal/close/{boardId}?userId={u} -> drop one user's connections
 *
 * The internal endpoint is gated by a shared secret, sent as `X-Moss-Internal`.
 */
class SyncCloseClient(
    private val baseUrl: String?,
    private val internalSecret: String? = null,
) {

    // HTTP/1.1 explicitly: the n5 internal endpoint is a plain Node `http` server.
    // Java's default HTTP/2 client sends an h2c upgrade preface that Node never
    // answers, so the request timed out before reaching the handler (n9 prove).
    private val client = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(Duration.ofSeconds(2))
        .build()

    suspend fun closeBoard(boardId: String, userId: UUID? = null) {
        val base = baseUrl?.takeIf { it.isNotBlank() } ?: return
        val query = userId?.let { "?userId=$it" } ?: ""
        try {
            val uri = URI.create("${base.trimEnd('/')}/internal/close/$boardId$query")
            val builder = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(2))
                .POST(HttpRequest.BodyPublishers.noBody())
            if (!internalSecret.isNullOrBlank()) {
                builder.header(INTERNAL_SECRET_HEADER, internalSecret)
            }
            val request = builder.build()
            val response = withContext(Dispatchers.IO) {
                client.send(request, HttpResponse.BodyHandlers.discarding())
            }
            when {
                // A 401 means the shared secret is missing or wrong: revoke/kick
                // did not happen, and this must be loud, not a swallowed warning.
                response.statusCode() == 401 ->
                    log.error(
                        "sync close hook rejected (401) for board {}: check SYNC_INTERNAL_SECRET",
                        boardId,
                    )
                response.statusCode() !in 200..299 ->
                    log.warn(
                        "sync close hook returned {} for board {}",
                        response.statusCode(),
                        boardId,
                    )
            }
        } catch (e: Exception) {
            log.warn("sync close hook failed for board {}: {}", boardId, e.message)
        }
    }

    companion object {
        /** Must match `INTERNAL_SECRET_HEADER` in the n5 sync server. */
        const val INTERNAL_SECRET_HEADER = "X-Moss-Internal"
        private val log = LoggerFactory.getLogger(SyncCloseClient::class.java)
    }
}
