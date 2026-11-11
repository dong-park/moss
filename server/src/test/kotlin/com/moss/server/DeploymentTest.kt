package com.moss.server

import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test
import java.sql.SQLException
import javax.sql.DataSource
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DeploymentTest {
    private val sha = "a".repeat(40)
    private val secret = "deployment-test-secret"

    @Test
    fun `readiness authenticates and rechecks revision and database`() = testApplication {
        var revision: String? = sha
        var fail = false
        val source = object : DataSource by TestDb.dataSource {
            override fun getConnection() = if (fail) throw SQLException("offline") else TestDb.dataSource.connection
        }
        application {
            install(ContentNegotiation) { json() }
            routing { deploymentRoutes(source, secret, buildSha = { sha }) { revision } }
        }
        assertEquals(HttpStatusCode.Unauthorized, client.get("/internal/deployment").status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/internal/deployment") { header("X-Moss-Internal", "wrong") }.status)
        suspend fun probe() = client.get("/internal/deployment") { header("X-Moss-Internal", secret) }
        val response = probe()
        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.headers["Cache-Control"]!!.contains("no-store"))
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("ready", body["status"]!!.jsonPrimitive.content)
        assertEquals(sha, body["sha"]!!.jsonPrimitive.content)
        for (bad in listOf(null, "", "abc", "g".repeat(40), sha + "\n")) {
            revision = bad
            assertEquals(HttpStatusCode.ServiceUnavailable, probe().status)
        }
        revision = sha
        revision = "b".repeat(40)
        assertEquals(HttpStatusCode.ServiceUnavailable, probe().status)
        revision = sha
        fail = true
        assertEquals(HttpStatusCode.ServiceUnavailable, probe().status)
        fail = false
        assertEquals(HttpStatusCode.OK, probe().status)
    }

    @Test
    fun `missing internal secret cannot authorize readiness`() = testApplication {
        application {
            install(ContentNegotiation) { json() }
            routing { deploymentRoutes(TestDb.dataSource, null, buildSha = { sha }) { sha } }
        }
        assertEquals(HttpStatusCode.Unauthorized, client.get("/internal/deployment").status)
    }

    @Test
    fun `unmigrated database is not ready`() = testApplication {
        application {
            install(ContentNegotiation) { json() }
            // A fresh empty database on the same ephemeral test Postgres.
            val ds = TestDb.postgres.getDatabase("postgres", "template1")
            routing { deploymentRoutes(ds, secret, buildSha = { sha }) { sha } }
        }
        assertEquals(HttpStatusCode.ServiceUnavailable, client.get("/internal/deployment") { header("X-Moss-Internal", secret) }.status)
    }
}

class LegacyHealthTest : ApiTest() {
    @Test
    fun `legacy health wire contract is unchanged without release revision`() = app {
        val response = client.get("/health")
        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals("{\"status\":\"ok\"}", response.bodyAsText())
    }
}
