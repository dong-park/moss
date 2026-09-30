package com.moss.server

import io.ktor.client.call.body
import io.ktor.http.HttpStatusCode
import kotlin.test.Test
import kotlin.test.assertEquals

/** 공유 보드 안 파일함은 루트의 멤버십을 물려받는다 (spec/share-subboards.md). */
class SubBoardShareTest : ApiTest() {

    @Test
    fun subBoardInheritsRootMembership() = app {
        google.register("owner", "sub-owner", "Owner")
        google.register("editor", "sub-editor", "Editor")
        google.register("stranger", "sub-stranger", "Stranger")
        val owner = login("owner")
        val editor = login("editor")
        val stranger = login("stranger")
        val client = client()
        val root = newBoardId()
        val child = newBoardId()
        val grandchild = newBoardId()

        client.authed("/boards/$root/share", owner.accessToken, ShareRequest("Root"))
        val invite = client.authed("/boards/$root/invites", owner.accessToken).body<InviteResponse>()
        client.authed("/invites/accept", editor.accessToken, AcceptInviteRequest(invite.inviteToken))

        // 편집자도 공유 보드 안에 파일함을 등록한다. 소유자는 루트 소유자다.
        val made = client.authed("/boards/$child/share", editor.accessToken, ShareRequest("Child", root))
        assertEquals(HttpStatusCode.OK, made.status)
        assertEquals("editor", made.body<BoardDto>().role)
        assertEquals("Owner", made.body<BoardDto>().ownerName)
        client.authed("/boards/$grandchild/share", owner.accessToken, ShareRequest("Grand", child))

        // 멤버 아닌 사람은 파일함을 등록하지도, 토큰을 받지도 못한다.
        assertEquals(
            HttpStatusCode.Forbidden,
            client.authed("/boards/${newBoardId()}/share", stranger.accessToken, ShareRequest("X", root)).status,
        )
        assertEquals(HttpStatusCode.Forbidden, client.authed("/boards/$grandchild/token", stranger.accessToken).status)
        assertEquals(HttpStatusCode.OK, client.authed("/boards/$grandchild/token", editor.accessToken).status)

        // /me/boards는 하위 보드를 부모 id와 함께 돌려준다.
        val boards = client.authedGet("/me/boards", editor.accessToken).body<List<BoardDto>>()
        assertEquals(
            mapOf(root to null, child to root, grandchild to child),
            boards.associate { it.id to it.parentId },
        )
        assertEquals(setOf("editor"), boards.map { it.role }.toSet())

        // 파일함에서 본 멤버 목록은 루트의 것이다.
        val members = client.authedGet("/boards/$child/members", editor.accessToken).body<List<MemberDto>>()
        assertEquals(listOf("owner", "editor"), members.map { it.role })

        // 파일함 단독 해제는 막고, 루트 해제는 하위까지 지운다.
        assertEquals(HttpStatusCode.BadRequest, client.authedDelete("/boards/$child/share", owner.accessToken).status)
        assertEquals(HttpStatusCode.NoContent, client.authedDelete("/boards/$root/share", owner.accessToken).status)
        assertEquals(HttpStatusCode.Forbidden, client.authed("/boards/$grandchild/token", editor.accessToken).status)
        assertEquals(emptyList(), client.authedGet("/me/boards", editor.accessToken).body<List<BoardDto>>())
    }
}
