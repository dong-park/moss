package com.moss.server

import io.ktor.client.call.body
import io.ktor.http.HttpStatusCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * 파일함을 다른 공유 보드로 옮기면 서버 parent_id도 따라간다 (spec/share-subboards.md "미룬 것").
 *
 * 요청자가 옛 부모·새 부모 양쪽 체인의 멤버여야 하고, 새 부모가 자기 자손이면 안 된다.
 */
class ReparentSubBoardTest : ApiTest() {

    @Test
    fun reparentMovesPermissionsAndRejectsCycles() = app {
        google.register("owner", "re-owner", "Owner")
        google.register("ed", "re-ed", "Ed")
        google.register("f", "re-f", "F")
        google.register("g", "re-g", "G")
        val owner = login("owner")
        val ed = login("ed")
        val f = login("f")
        val g = login("g")
        val client = client()

        val root1 = newBoardId()
        val root2 = newBoardId()
        val child = newBoardId()
        val grand = newBoardId()

        client.authed("/boards/$root1/share", owner.accessToken, ShareRequest("R1"))
        client.authed("/boards/$root2/share", owner.accessToken, ShareRequest("R2"))
        // ed는 두 루트 모두, f는 root1만, g는 root2만 멤버다.
        for ((root, token) in listOf(root1 to ed.accessToken, root1 to f.accessToken, root2 to ed.accessToken, root2 to g.accessToken)) {
            val invite = client.authed("/boards/$root/invites", owner.accessToken).body<InviteResponse>()
            client.authed("/invites/accept", token, AcceptInviteRequest(invite.inviteToken))
        }

        client.authed("/boards/$child/share", owner.accessToken, ShareRequest("Child", root1))
        client.authed("/boards/$grand/share", owner.accessToken, ShareRequest("Grand", child))

        // 옛 부모 체인 멤버가 아니면(g) 옮기지 못한다.
        assertEquals(
            HttpStatusCode.Forbidden,
            client.authed("/boards/$child/share", g.accessToken, ShareRequest("Child", root2)).status,
        )
        // 옮기기 전: root1 멤버 f는 child·grand 토큰을 받고, root2 멤버 g는 못 받는다.
        assertEquals(HttpStatusCode.OK, client.authed("/boards/$child/token", f.accessToken).status)
        assertEquals(HttpStatusCode.Forbidden, client.authed("/boards/$child/token", g.accessToken).status)

        // ed(양쪽 멤버)가 child를 root2 아래로 옮긴다.
        val moved = client.authed("/boards/$child/share", ed.accessToken, ShareRequest("Child", root2))
        assertEquals(HttpStatusCode.OK, moved.status)
        assertEquals(root2, moved.body<BoardDto>().parentId)

        // 권한이 새 부모를 따라간다: f는 잃고, g는 child·자손 grand까지 얻는다.
        assertEquals(HttpStatusCode.Forbidden, client.authed("/boards/$child/token", f.accessToken).status)
        assertEquals(HttpStatusCode.Forbidden, client.authed("/boards/$grand/token", f.accessToken).status)
        assertEquals(HttpStatusCode.OK, client.authed("/boards/$child/token", g.accessToken).status)
        assertEquals(HttpStatusCode.OK, client.authed("/boards/$grand/token", g.accessToken).status)

        // /me/boards의 부모 id도 갱신된다.
        val forG = client.authedGet("/me/boards", g.accessToken).body<List<BoardDto>>()
        assertEquals(
            mapOf(root2 to null, child to root2, grand to child),
            forG.associate { it.id to it.parentId },
        )
        val forF = client.authedGet("/me/boards", f.accessToken).body<List<BoardDto>>()
        assertTrue(forF.none { it.id == child }, "옛 부모에만 있던 멤버는 파일함을 잃는다")

        // 새 부모가 자기 자손이면 사이클 — 막는다.
        assertEquals(
            HttpStatusCode.BadRequest,
            client.authed("/boards/$child/share", ed.accessToken, ShareRequest("Child", grand)).status,
        )
    }
}
