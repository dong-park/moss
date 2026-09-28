package com.moss.server

import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AuthTest : ApiTest() {

    @Test
    fun healthIsOk() = app {
        val response = client().get("/health")
        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals("ok", response.body<HealthResponse>().status)
    }

    @Test
    fun googleLoginCreatesUserAndRefreshRotates() = app {
        google.register("tok-alice", "sub-alice", "Alice", "https://img/alice.png")

        val auth = login("tok-alice")
        assertTrue(auth.accessToken.isNotBlank())
        assertTrue(auth.refreshToken.isNotBlank())
        assertEquals("Alice", auth.user.name)

        val refreshed = client().post("/auth/refresh") {
            contentType(ContentType.Application.Json)
            setBody(RefreshRequest(auth.refreshToken))
        }
        assertEquals(HttpStatusCode.OK, refreshed.status)
        val again = refreshed.body<AuthResponse>()
        assertEquals(auth.user.id, again.user.id)
        assertEquals("Alice", again.user.name)
    }

    @Test
    fun unknownGoogleTokenIsRejected() = app {
        val response = client().post("/auth/google") {
            contentType(ContentType.Application.Json)
            setBody(GoogleLoginRequest("not-a-real-token"))
        }
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun accessTokenCannotBeUsedAsRefresh() = app {
        google.register("tok-alice", "sub-alice", "Alice")
        val auth = login("tok-alice")
        val response = client().post("/auth/refresh") {
            contentType(ContentType.Application.Json)
            setBody(RefreshRequest(auth.accessToken))
        }
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun reLoginWithoutAnAvatarKeepsTheStoredAvatar() = app {
        google.register("tok-alice", "sub-alice", "Alice", "https://img/alice.png")
        val first = login("tok-alice")
        assertEquals("https://img/alice.png", first.user.avatar)

        google.register("tok-alice", "sub-alice", "Alice Renamed", null)
        val second = login("tok-alice")
        assertEquals(first.user.id, second.user.id)
        assertEquals("Alice Renamed", second.user.name)
        assertEquals("https://img/alice.png", second.user.avatar)
    }

    @Test
    fun protectedEndpointRequiresToken() = app {
        assertEquals(HttpStatusCode.Unauthorized, client().get("/me/boards").status)
    }
}
