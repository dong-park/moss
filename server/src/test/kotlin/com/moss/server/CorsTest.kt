package com.moss.server

import io.ktor.client.request.header
import io.ktor.client.request.options
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CorsTest : ApiTest() {

    private suspend fun io.ktor.server.testing.ApplicationTestBuilder.preflight(origin: String) =
        client().options("/boards/b-x/share") {
            header(HttpHeaders.Origin, origin)
            header(HttpHeaders.AccessControlRequestMethod, "POST")
            header(HttpHeaders.AccessControlRequestHeaders, "authorization,content-type")
        }

    @Test
    fun allowedOriginPreflightGetsCorsHeaders() = app {
        val res = preflight("http://localhost:3000")
        assertEquals(HttpStatusCode.OK, res.status)
        assertEquals("http://localhost:3000", res.headers[HttpHeaders.AccessControlAllowOrigin])
        // Ktor lists only non-simple methods; GET/POST are implied.
        assertTrue(res.headers[HttpHeaders.AccessControlAllowMethods].orEmpty().contains("DELETE"))
        assertTrue(res.headers[HttpHeaders.AccessControlAllowHeaders].orEmpty().contains("Authorization", ignoreCase = true))
        assertNull(res.headers[HttpHeaders.AccessControlAllowCredentials])
    }

    @Test
    fun otherOriginGetsNoCorsHeaders() = app {
        val res = preflight("http://evil.example")
        assertNull(res.headers[HttpHeaders.AccessControlAllowOrigin])
    }

    @Test
    fun allowedOriginsComeFromEnvWithoutWildcards() {
        assertEquals(listOf("http://localhost:3000"), AppConfig.parseAllowedOrigins(null))
        assertEquals(
            listOf("https://a.example", "http://localhost:3001"),
            AppConfig.parseAllowedOrigins(" https://a.example ,http://localhost:3001"),
        )
        assertFailsWith<IllegalArgumentException> { AppConfig.parseAllowedOrigins("*") }
        assertFailsWith<IllegalArgumentException> { AppConfig.parseAllowedOrigins("https://*.example") }
    }
}
