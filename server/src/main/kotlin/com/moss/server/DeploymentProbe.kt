package com.moss.server

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import kotlin.system.exitProcess

/** Container health probe using the JRE already present in the runtime image. */
object DeploymentProbe {
    @JvmStatic
    fun main(args: Array<String>) {
        val healthy = runCatching {
            // Without RELEASE_SHA only an explicitly unversioned (manual) build may be healthy.
            val sha = System.getenv("RELEASE_SHA")?.takeIf { it.isNotEmpty() }
            val secret = System.getenv("SYNC_INTERNAL_SECRET") ?: return@runCatching false
            if (secret.isBlank() || (sha != null && (sha.length != 40 || !sha.matches(Regex("[0-9a-fA-F]{40}"))))) return@runCatching false
            val port = System.getenv("PORT") ?: "8080"
            val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()
            val request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/deployment"))
                .timeout(Duration.ofSeconds(3))
                .header(SyncCloseClient.INTERNAL_SECRET_HEADER, secret).GET().build()
            val response = client.send(request, HttpResponse.BodyHandlers.ofString())
            val body = Json.parseToJsonElement(response.body()).jsonObject
            val status = body["status"]?.jsonPrimitive?.content
            response.statusCode() == 200 && if (sha == null) status == "unversioned" else
                status == "ready" && body["sha"]?.jsonPrimitive?.content == sha
        }.getOrDefault(false)
        exitProcess(if (healthy) 0 else 1)
    }
}
