package com.moss.server

import com.moss.server.auth.TokenService
import io.ktor.client.call.body
import io.ktor.http.HttpStatusCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import java.util.UUID

class MembershipTest : ApiTest() {

    private suspend fun io.ktor.server.testing.ApplicationTestBuilder.setupSharedBoard(): SharedBoardFixture {
        google.register("owner", "sub-owner", "Owner")
        google.register("editor", "sub-editor", "Editor")
        val owner = login("owner")
        val editor = login("editor")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val invite = client.authed("/boards/$boardId/invites", owner.accessToken).body<InviteResponse>()
        client.authed("/invites/accept", editor.accessToken, AcceptInviteRequest(invite.inviteToken))
        return SharedBoardFixture(boardId, owner, editor, client)
    }

    private data class SharedBoardFixture(
        val boardId: String,
        val owner: AuthResponse,
        val editor: AuthResponse,
        val client: io.ktor.client.HttpClient,
    )

    @Test
    fun ownerCanKickMemberAndKickedLosesAccess() = app {
        val f = setupSharedBoard()

        val kicked = f.client.authedDelete("/boards/${f.boardId}/members/${f.editor.user.id}", f.owner.accessToken)
        assertEquals(HttpStatusCode.NoContent, kicked.status)

        assertEquals(emptyList(), f.client.authedGet("/me/boards", f.editor.accessToken).body<List<BoardDto>>())
        assertEquals(
            HttpStatusCode.Forbidden,
            f.client.authed("/boards/${f.boardId}/token", f.editor.accessToken).status,
        )
        // Kicking again reports the member is gone.
        assertEquals(
            HttpStatusCode.NotFound,
            f.client.authedDelete("/boards/${f.boardId}/members/${f.editor.user.id}", f.owner.accessToken).status,
        )
    }

    @Test
    fun onlyOwnerCanKickAndOwnerCannotKickSelf() = app {
        val f = setupSharedBoard()

        assertEquals(
            HttpStatusCode.Forbidden,
            f.client.authedDelete("/boards/${f.boardId}/members/${f.owner.user.id}", f.editor.accessToken).status,
        )
        assertEquals(
            HttpStatusCode.BadRequest,
            f.client.authedDelete("/boards/${f.boardId}/members/${f.owner.user.id}", f.owner.accessToken).status,
        )
    }

    @Test
    fun memberGetsBoardTokenForTheBoard() = app {
        val f = setupSharedBoard()

        val response = f.client.authed("/boards/${f.boardId}/token", f.editor.accessToken)
        assertEquals(HttpStatusCode.OK, response.status)
        val token = response.body<BoardTokenResponse>()
        assertEquals(3600, token.expiresInSeconds)

        val decoded = TokenService("test-secret").verify(token.boardToken, TokenService.TokenType.BOARD)
        assertEquals(f.editor.user.id, decoded.subject)
        assertEquals(f.boardId.toString(), decoded.getClaim(TokenService.CLAIM_BOARD_ID).asString())
    }

    @Test
    fun nonMemberCannotGetBoardToken() = app {
        val f = setupSharedBoard()
        google.register("other", "sub-other", "Other")
        val other = login("other")

        val response = f.client.authed("/boards/${f.boardId}/token", other.accessToken)
        assertEquals(HttpStatusCode.Forbidden, response.status)
        assertNotNull(response.body<ErrorResponse>().message)
    }

    @Test
    fun membersListShowsOwnerAndEditorNamesWithRoles() = app {
        val f = setupSharedBoard()

        val members = f.client.authedGet("/boards/${f.boardId}/members", f.owner.accessToken).body<List<MemberDto>>()
        assertEquals(
            listOf(f.owner.user.id to "owner", f.editor.user.id to "editor"),
            members.map { it.id to it.role },
        )
        assertEquals(listOf("Owner", "Editor"), members.map { it.name })

        // 편집자도 목록을 볼 수 있다 — 팝오버가 역할을 확인한다.
        assertEquals(HttpStatusCode.OK, f.client.authedGet("/boards/${f.boardId}/members", f.editor.accessToken).status)
    }

    @Test
    fun nonMemberCannotSeeMembers() = app {
        val f = setupSharedBoard()
        google.register("other", "sub-other", "Other")
        val other = login("other")

        assertEquals(
            HttpStatusCode.Forbidden,
            f.client.authedGet("/boards/${f.boardId}/members", other.accessToken).status,
        )
    }
}
