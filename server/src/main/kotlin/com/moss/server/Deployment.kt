package com.moss.server

import io.ktor.http.HttpStatusCode
import io.ktor.server.request.header
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import org.flywaydb.core.Flyway
import java.security.MessageDigest
import javax.sql.DataSource

@Serializable
private data class DeploymentResponse(val status: String, val sha: String? = null)

/** A separate readiness contract; /health remains the legacy liveness response. */
fun Route.deploymentRoutes(
    dataSource: DataSource,
    internalSecret: String?,
    buildSha: () -> String? = {
        DeploymentResponse::class.java.getResourceAsStream("/build-sha")?.bufferedReader()?.use { it.readText() }
    },
    releaseSha: () -> String? = { System.getenv("RELEASE_SHA") },
) {
    get("/internal/deployment") {
        call.response.headers.append("Cache-Control", "no-store")
        val provided = call.request.header(SyncCloseClient.INTERNAL_SECRET_HEADER)
        if (internalSecret.isNullOrBlank() || provided == null || !MessageDigest.isEqual(
                internalSecret.toByteArray(Charsets.UTF_8), provided.toByteArray(Charsets.UTF_8),
            )) {
            call.respond(HttpStatusCode.Unauthorized)
            return@get
        }
        val sha = releaseSha()?.takeIf { it.isNotEmpty() }
        val built = buildSha()?.takeIf { it.isNotEmpty() }
        // Manual/local builds without any revision are explicitly unversioned, never a release identity.
        val unversioned = sha == null && built == null
        val validSha = unversioned || (sha != null && sha.length == 40 && sha.matches(Regex("[0-9a-fA-F]{40}")) && sha == built)
        val ready = validSha && withContext(Dispatchers.IO) {
            try {
                val flyway = Flyway.configure().dataSource(dataSource).load()
                if (!flyway.validateWithResult().validationSuccessful || flyway.info().pending().isNotEmpty()) {
                    false
                } else {
                    dataSource.connection.use { connection ->
                        connection.createStatement().use { statement ->
                            statement.queryTimeout = 2
                            // Also require the migration-owned table, not just a reachable database.
                            statement.executeQuery("SELECT 1 FROM documents LIMIT 1").use { }
                        }
                    }
                    true
                }
            } catch (_: Exception) {
                false
            }
        }
        if (ready) call.respond(HttpStatusCode.OK, if (unversioned) DeploymentResponse("unversioned") else DeploymentResponse("ready", sha))
        else call.respond(HttpStatusCode.ServiceUnavailable, DeploymentResponse("unavailable"))
    }
}
