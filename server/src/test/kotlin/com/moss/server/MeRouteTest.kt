package com.moss.server

import io.ktor.client.call.body
import io.ktor.http.HttpStatusCode
import kotlin.test.Test
import kotlin.test.assertEquals

/** GET /me — AI 가드가 한도 키로 쓰는 검증된 사용자 id. */
class MeRouteTest : ApiTest() {

    @Test
    fun returnsTheUserIdOfTheVerifiedToken() = app {
        google.register("a", "sub-a", "A")
        val a = login("a")
        val res = client().authedGet("/me", a.accessToken)
        assertEquals(HttpStatusCode.OK, res.status)
        assertEquals(a.user.id, res.body<MeDto>().userId)
    }

    @Test
    fun rejectsGarbageAndRefreshTokens() = app {
        google.register("a", "sub-a", "A")
        val a = login("a")
        val c = client()
        assertEquals(HttpStatusCode.Unauthorized, c.authedGet("/me", "garbage").status)
        assertEquals(HttpStatusCode.Unauthorized, c.authedGet("/me", a.refreshToken).status)
    }
}
