package com.moss.server

import com.moss.server.boards.BoardRepository
import io.ktor.client.call.body
import io.ktor.http.HttpStatusCode
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import kotlin.test.Test
import kotlin.test.assertEquals
import java.util.UUID

class LimitRoleTest : ApiTest() {

    @Test
    fun boardRejectsTwentyFirstMember() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val invite = client.authed("/boards/$boardId/invites", owner.accessToken).body<InviteResponse>()

        for (i in 1..19) {
            google.register("user-$i", "sub-$i", "User $i")
            val member = login("user-$i")
            assertEquals(
                HttpStatusCode.OK,
                client.authed("/invites/accept", member.accessToken, AcceptInviteRequest(invite.inviteToken)).status,
                "member $i should join",
            )
        }

        val repo = BoardRepository(config.maxMembersPerBoard)
        kotlinx.coroutines.runBlocking { assertEquals(20, repo.memberCount(boardId)) }

        google.register("user-20", "sub-20", "User 20")
        val extra = login("user-20")
        val rejected = client.authed("/invites/accept", extra.accessToken, AcceptInviteRequest(invite.inviteToken))
        assertEquals(HttpStatusCode.Conflict, rejected.status)
        assertEquals("이 보드는 자리가 다 찼어요", rejected.body<ErrorResponse>().message)
        kotlinx.coroutines.runBlocking { assertEquals(20, repo.memberCount(boardId)) }
    }

    @Test
    fun editorCannotRevokeShare() = app {
        val owner = login(registerOwner())
        google.register("editor", "sub-editor", "Editor")
        val editor = login("editor")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val invite = client.authed("/boards/$boardId/invites", owner.accessToken).body<InviteResponse>()
        client.authed("/invites/accept", editor.accessToken, AcceptInviteRequest(invite.inviteToken))

        assertEquals(
            HttpStatusCode.Forbidden,
            client.authedDelete("/boards/$boardId/share", editor.accessToken).status,
        )
    }

    @Test
    fun revokeDeletesServerRowsAndCascadesFiles() = app {
        google.register("owner", "sub-owner", "Owner")
        google.register("editor", "sub-editor", "Editor")
        val owner = login("owner")
        val editor = login("editor")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val invite = client.authed("/boards/$boardId/invites", owner.accessToken).body<InviteResponse>()
        client.authed("/invites/accept", editor.accessToken, AcceptInviteRequest(invite.inviteToken))

        transaction {
            Files.insert {
                it[id] = UUID.randomUUID()
                it[Files.boardId] = boardId
                it[Files.name] = "photo.png"
                it[Files.size] = 1024
                it[contentType] = "image/png"
                it[createdAt] = 0
            }
        }
        val repo = BoardRepository(config.maxMembersPerBoard)
        kotlinx.coroutines.runBlocking { assertEquals(1, repo.fileCount(boardId)) }

        val revoked = client.authedDelete("/boards/$boardId/share", owner.accessToken)
        assertEquals(HttpStatusCode.NoContent, revoked.status)

        kotlinx.coroutines.runBlocking {
            assertEquals(0, repo.fileCount(boardId))
            assertEquals(null, repo.board(boardId))
        }
        assertEquals(emptyList(), client.authedGet("/me/boards", owner.accessToken).body<List<BoardDto>>())
        assertEquals(emptyList(), client.authedGet("/me/boards", editor.accessToken).body<List<BoardDto>>())
        // The board is gone, so even a previously valid invite is expired.
        assertEquals(
            HttpStatusCode.Gone,
            client.authed("/invites/accept", editor.accessToken, AcceptInviteRequest(invite.inviteToken)).status,
        )

        // Owner can share again after revoking.
        assertEquals(
            HttpStatusCode.OK,
            client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board again")).status,
        )
    }

    private fun registerOwner(): String {
        google.register("owner", "sub-owner", "Owner")
        return "owner"
    }
}
