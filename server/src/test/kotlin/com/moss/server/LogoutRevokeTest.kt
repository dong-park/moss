package com.moss.server

import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlin.test.Test
import kotlin.test.assertEquals

class LogoutRevokeTest : ApiTest() {

    @Test
    fun logoutRejectsTheSameRefreshToken() = app {
        google.register("tok-alice", "sub-alice", "Alice")
        val auth = login("tok-alice")
        val client = client()

        val logout = client.post("/auth/logout") {
            contentType(ContentType.Application.Json)
            setBody(LogoutRequest(auth.refreshToken))
        }
        assertEquals(HttpStatusCode.OK, logout.status)

        val refresh = client.post("/auth/refresh") {
            contentType(ContentType.Application.Json)
            setBody(RefreshRequest(auth.refreshToken))
        }
        assertEquals(HttpStatusCode.Unauthorized, refresh.status)
    }

    @Test
    fun anotherSessionsRefreshStillWorksAfterLogout() = app {
        google.register("tok-alice", "sub-alice", "Alice")
        val first = login("tok-alice")
        val second = login("tok-alice")
        val client = client()

        assertEquals(
            HttpStatusCode.OK,
            client.post("/auth/logout") {
                contentType(ContentType.Application.Json)
                setBody(LogoutRequest(first.refreshToken))
            }.status,
        )

        val kept = client.post("/auth/refresh") {
            contentType(ContentType.Application.Json)
            setBody(RefreshRequest(second.refreshToken))
        }
        assertEquals(HttpStatusCode.OK, kept.status)
        assertEquals(second.user.id, kept.body<AuthResponse>().user.id)
    }

    @Test
    fun brokenLogoutTokenStillEndsTheRequest() = app {
        val response = client().post("/auth/logout") {
            contentType(ContentType.Application.Json)
            setBody(LogoutRequest("not-a-token"))
        }
        assertEquals(HttpStatusCode.OK, response.status)
    }
}
