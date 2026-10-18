package com.moss.server

import com.moss.server.boards.BoardRepository
import com.moss.server.boards.SaveFileResult
import io.ktor.client.call.body
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** n1 (T2·D2) — 사용자당 보드 100개, 첨부 합계 1GB. */
class UserQuotaTest : ApiTest() {

    @Test
    fun hundredAndFirstBoardIsRejectedAndExistingBoardsStayOpen() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val ids = (1..100).map { "b-quota-$it" }
        for (id in ids) {
            assertEquals(HttpStatusCode.OK, client.authed("/boards/$id/share", owner.accessToken, ShareRequest("B")).status)
        }

        val rejected = client.authed("/boards/${newBoardId()}/share", owner.accessToken, ShareRequest("one more"))
        assertEquals(HttpStatusCode.PayloadTooLarge, rejected.status)
        val error = rejected.body<ErrorResponse>()
        assertEquals("quota_exceeded", error.error)
        assertEquals("보드는 100개까지 저장할 수 있어요", error.message)

        // 기존 보드는 그대로 열린다: 재등록(멱등)과 토큰 발급이 통과한다.
        assertEquals(HttpStatusCode.OK, client.authed("/boards/${ids[0]}/share", owner.accessToken, ShareRequest("B")).status)
        assertEquals(HttpStatusCode.OK, client.authed("/boards/${ids[99]}/token", owner.accessToken).status)
        assertEquals(100, client.authedGet("/me/boards", owner.accessToken).body<List<BoardDto>>().size)

        val usage = client.authedGet("/me/usage", owner.accessToken).body<UsageDto>()
        assertEquals(UsageDto(100, 100, 0, 1024L * 1024 * 1024), usage)
    }

    @Test
    fun otherUsersAreNotAffectedByTheLimit() = app {
        google.register("full", "sub-full", "Full")
        google.register("other", "sub-other", "Other")
        val full = login("full")
        val other = login("other")
        val client = client()
        val repo = BoardRepository(config.maxMembersPerBoard, maxBoardsPerUser = 1)
        runBlocking {
            repo.shareBoard(newBoardId(), UUID.fromString(full.user.id), "one")
            assertFailsWith<QuotaExceededException> {
                repo.shareBoard(newBoardId(), UUID.fromString(full.user.id), "two")
            }
            repo.shareBoard(newBoardId(), UUID.fromString(other.user.id), "other one")
        }
        assertEquals(1, client.authedGet("/me/usage", other.accessToken).body<UsageDto>().boards)
    }

    @Test
    fun fileTotalBlocksNewBoards() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val a = newBoardId()
        val b = newBoardId()
        client.authed("/boards/$a/share", owner.accessToken, ShareRequest("A"))
        client.authed("/boards/$b/share", owner.accessToken, ShareRequest("B"))
        // 보드당 한도(500MB)를 지키면서 합계가 1GB가 되게 채운다.
        transaction {
            for (board in listOf(a, b)) {
                Files.insert {
                    it[id] = UUID.randomUUID()
                    it[boardId] = board
                    it[name] = "big.bin"
                    it[size] = 512L * 1024 * 1024
                    it[contentType] = "application/octet-stream"
                    it[createdAt] = 0
                }
            }
        }

        val rejected = client.authed("/boards/${newBoardId()}/share", owner.accessToken, ShareRequest("C"))
        assertEquals(HttpStatusCode.PayloadTooLarge, rejected.status)
        assertEquals("저장 용량(1GB)을 다 썼어요", rejected.body<ErrorResponse>().message)
        assertEquals(1024L * 1024 * 1024, client.authedGet("/me/usage", owner.accessToken).body<UsageDto>().fileBytes)
        // 기존 보드는 그대로 열린다.
        assertEquals(HttpStatusCode.OK, client.authed("/boards/$a/token", owner.accessToken).status)
    }

    @Test
    fun userTotalCapsAnUploadEvenWhenTheBoardHasRoom() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val a = newBoardId()
        val b = newBoardId()
        client.authed("/boards/$a/share", owner.accessToken, ShareRequest("A"))
        client.authed("/boards/$b/share", owner.accessToken, ShareRequest("B"))
        val repo = BoardRepository(config.maxMembersPerBoard, maxUserFileBytes = 10)
        runBlocking {
            assertEquals(SaveFileResult.ACCEPTED, repo.saveFile(a, UUID.randomUUID(), "x", 6, null))
            // b 보드는 비어 있어도 같은 사용자의 합계가 10바이트를 넘는다.
            assertEquals(SaveFileResult.USER_QUOTA_EXCEEDED, repo.saveFile(b, UUID.randomUUID(), "y", 5, null))
            assertEquals(SaveFileResult.ACCEPTED, repo.saveFile(b, UUID.randomUUID(), "z", 4, null))
        }
    }
}

