package com.moss.server

import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import java.util.UUID

class ShareInviteTest : ApiTest() {

    @Test
    fun ownerSharesBoardAndEditorAcceptsInvite() = app {
        google.register("owner", "sub-owner", "Owner")
        google.register("editor", "sub-editor", "Editor")
        val owner = login("owner")
        val editor = login("editor")
        val client = client()
        val boardId = newBoardId()

        val share = client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Shared Board"))
        assertEquals(HttpStatusCode.OK, share.status)
        val shared = share.body<BoardDto>()
        assertEquals(boardId.toString(), shared.id)
        assertEquals("owner", shared.role)
        assertEquals("Owner", shared.ownerName)

        val invite = client.authed("/boards/$boardId/invites", owner.accessToken).body<InviteResponse>()
        assertTrue(invite.inviteToken.isNotBlank())

        val accepted = client.authed("/invites/accept", editor.accessToken, AcceptInviteRequest(invite.inviteToken))
        assertEquals(HttpStatusCode.OK, accepted.status)
        assertEquals("editor", accepted.body<BoardDto>().role)

        val ownerBoards = client.authedGet("/me/boards", owner.accessToken).body<List<BoardDto>>()
        val editorBoards = client.authedGet("/me/boards", editor.accessToken).body<List<BoardDto>>()
        assertEquals(listOf(boardId.toString()), ownerBoards.map { it.id })
        assertEquals(listOf(boardId.toString()), editorBoards.map { it.id })
        assertEquals("owner", ownerBoards.single().role)
        assertEquals("editor", editorBoards.single().role)
        assertEquals("Owner", editorBoards.single().ownerName)
    }

    @Test
    fun unauthenticatedPreviewShowsNamesAndRevokedTokenIsGone() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val boardId = newBoardId()
        client().authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Shared Board"))
        val invite = client().authed("/boards/$boardId/invites", owner.accessToken).body<InviteResponse>()

        // No Authorization header: the card preview must not need a session.
        val preview = client().post("/invites/preview") {
            contentType(ContentType.Application.Json)
            setBody(InvitePreviewRequest(invite.inviteToken))
        }
        assertEquals(HttpStatusCode.OK, preview.status)
        val body = preview.body<InvitePreviewResponse>()
        assertEquals("Shared Board", body.boardName)
        assertEquals("Owner", body.ownerName)

        // Reissuing revokes the first token; its preview is gone.
        client().authed("/boards/$boardId/invites", owner.accessToken)
        val revoked = client().post("/invites/preview") {
            contentType(ContentType.Application.Json)
            setBody(InvitePreviewRequest(invite.inviteToken))
        }
        assertEquals(HttpStatusCode.Gone, revoked.status)
    }

    @Test
    fun shareIsIdempotentForOwnerAndRejectedForOthers() = app {
        google.register("owner", "sub-owner", "Owner")
        google.register("stranger", "sub-stranger", "Stranger")
        val owner = login("owner")
        val stranger = login("stranger")
        val client = client()
        val boardId = newBoardId()

        assertEquals(
            HttpStatusCode.OK,
            client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board")).status,
        )
        assertEquals(
            HttpStatusCode.OK,
            client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board")).status,
        )
        assertEquals(
            HttpStatusCode.Forbidden,
            client.authed("/boards/$boardId/share", stranger.accessToken, ShareRequest("Board")).status,
        )
    }

    @Test
    fun reissueInvalidatesOldLinkButKeepsExistingMember() = app {
        google.register("owner", "sub-owner", "Owner")
        google.register("editor", "sub-editor", "Editor")
        google.register("later", "sub-later", "Later")
        val owner = login("owner")
        val editor = login("editor")
        val later = login("later")
        val client = client()
        val boardId = newBoardId()

        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val first = client.authed("/boards/$boardId/invites", owner.accessToken).body<InviteResponse>()
        assertEquals(
            HttpStatusCode.OK,
            client.authed("/invites/accept", editor.accessToken, AcceptInviteRequest(first.inviteToken)).status,
        )

        val second = client.authed("/boards/$boardId/invites", owner.accessToken).body<InviteResponse>()
        assertTrue(second.inviteToken != first.inviteToken)

        // AC-6: old link is expired, the member who already joined still has access.
        assertEquals(
            HttpStatusCode.Gone,
            client.authed("/invites/accept", later.accessToken, AcceptInviteRequest(first.inviteToken)).status,
        )
        assertEquals(
            HttpStatusCode.OK,
            client.authed("/boards/$boardId/token", editor.accessToken).status,
        )
        assertEquals(
            HttpStatusCode.OK,
            client.authed("/invites/accept", later.accessToken, AcceptInviteRequest(second.inviteToken)).status,
        )
    }

    @Test
    fun tokenIsRejectedFromPathAndOldRouteIsGone() = app {
        google.register("editor", "sub-editor", "Editor")
        val editor = login("editor")
        // The invite token must travel in the JSON body so it never reaches request logs.
        val response = client().authed("/invites/definitely-not-a-token/accept", editor.accessToken)
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun unknownInviteTokenInBodyIsGone() = app {
        google.register("editor", "sub-editor", "Editor")
        val editor = login("editor")
        val response = client().authed("/invites/accept", editor.accessToken, AcceptInviteRequest("nope"))
        assertEquals(HttpStatusCode.Gone, response.status)
        assertEquals("gone", response.body<ErrorResponse>().error)
    }

    @Test
    fun onlyOwnerCanIssueInvite() = app {
        google.register("owner", "sub-owner", "Owner")
        google.register("editor", "sub-editor", "Editor")
        val owner = login("owner")
        val editor = login("editor")
        val client = client()
        val boardId = newBoardId()

        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val invite = client.authed("/boards/$boardId/invites", owner.accessToken).body<InviteResponse>()
        client.authed("/invites/accept", editor.accessToken, AcceptInviteRequest(invite.inviteToken))

        assertEquals(
            HttpStatusCode.Forbidden,
            client.authed("/boards/$boardId/invites", editor.accessToken).status,
        )
    }

    @Test
    fun blankNameIsSharedAsUnnamedBoard() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val boardId = newBoardId()
        val share = client().authed("/boards/$boardId/share", owner.accessToken, ShareRequest("   "))
        assertEquals(HttpStatusCode.OK, share.status)
        assertEquals("이름 없는 보드", share.body<BoardDto>().name)
    }
}
