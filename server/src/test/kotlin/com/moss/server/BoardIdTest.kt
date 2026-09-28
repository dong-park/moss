package com.moss.server

import io.ktor.client.call.body
import io.ktor.http.HttpStatusCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.assertFalse

/** Web local board ids (`b-…`) are shared as-is; anything outside the allowlist is 400. */
class BoardIdTest : ApiTest() {

    @Test
    fun webStyleBoardIdGoesThroughTheWholeShareLifecycle() = app {
        google.register("owner", "sub-owner", "Owner")
        google.register("editor", "sub-editor", "Editor")
        val owner = login("owner")
        val editor = login("editor")
        val client = client()
        val boardId = "b-abc123"

        val shared = client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        assertEquals(HttpStatusCode.OK, shared.status)
        assertEquals(boardId, shared.body<BoardDto>().id)
        val invite = client.authed("/boards/$boardId/invites", owner.accessToken).body<InviteResponse>()
        val accepted = client.authed("/invites/accept", editor.accessToken, AcceptInviteRequest(invite.inviteToken))
        assertEquals(boardId, accepted.body<BoardDto>().id)
        val members = client.authedGet("/boards/$boardId/members", editor.accessToken).body<List<MemberDto>>()
        assertEquals(2, members.size)

        val uploaded = client.uploadFile("/boards/$boardId/files", editor.accessToken, "a.png", byteArrayOf(1, 2), "image/png")
        assertEquals(HttpStatusCode.Created, uploaded.status)
        val stored = filesDir.resolve(boardId).resolve(uploaded.body<FileDto>().id)
        assertTrue(java.nio.file.Files.exists(stored))

        assertEquals(HttpStatusCode.OK, client.authed("/boards/$boardId/token", editor.accessToken).status)
        assertEquals(HttpStatusCode.NoContent, client.authedDelete("/boards/$boardId/share", owner.accessToken).status)
        assertFalse(java.nio.file.Files.exists(stored))
        assertEquals(HttpStatusCode.Forbidden, client.authed("/boards/$boardId/token", editor.accessToken).status)
    }

    @Test
    fun malformedBoardIdsAreRejected() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        for (bad in listOf("..%2Fx", "a%20b", "x".repeat(65))) {
            val response = client.authed("/boards/$bad/share", owner.accessToken, ShareRequest("Board"))
            assertEquals(HttpStatusCode.BadRequest, response.status, bad)
            assertEquals(HttpStatusCode.BadRequest, client.authed("/boards/$bad/files", owner.accessToken).status, bad)
        }
        assertEquals(HttpStatusCode.OK, client.authed("/boards/${"x".repeat(64)}/share", owner.accessToken, ShareRequest("B")).status)
    }
}
