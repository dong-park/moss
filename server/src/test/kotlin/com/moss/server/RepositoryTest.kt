package com.moss.server

import com.moss.server.auth.TokenService
import com.moss.server.boards.BoardRepository
import com.moss.server.boards.JoinResult
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** DB-level regressions that are hard to provoke deterministically over HTTP. */
class RepositoryTest : ApiTest() {

    private fun repo() = BoardRepository(config.maxMembersPerBoard)

    @Test
    fun concurrentShareOfSameBoardDoesNotViolatePrimaryKey() = runBlocking {
        val repository = repo()
        val owner = repository.upsertUser(GoogleUser("sub-owner", "Owner", null))
        val boardId = newBoardId()

        val results = listOf(
            async { repository.shareBoard(boardId, owner.id, "First") },
            async { repository.shareBoard(boardId, owner.id, "Second") },
        ).awaitAll()

        assertEquals(2, results.size)
        assertNotNull(repository.board(boardId))
        assertEquals(1, repository.memberCount(boardId))
    }

    @Test
    fun concurrentUpsertOfSameGoogleSubReturnsTheSameUser() = runBlocking {
        val repository = repo()
        val first = async { repository.upsertUser(GoogleUser("sub-race", "Alice", null)) }
        val second = async { repository.upsertUser(GoogleUser("sub-race", "Alice", "https://img/a.png")) }
        val (a, b) = listOf(first, second).awaitAll()

        assertEquals(a.id, b.id)
    }

    @Test
    fun joinBoardOnMissingBoardReturnsMissing() = runBlocking {
        assertEquals(JoinResult.MISSING, repo().joinBoard(newBoardId(), UUID.randomUUID()))
    }

    @Test
    fun boardsTableHasNoStateColumnAndMembersUserIdIsIndexed() {
        TestDb.dataSource.connection.use { conn ->
            val columns = mutableListOf<String>()
            conn.createStatement().use { st ->
                st.executeQuery(
                    "select column_name from information_schema.columns where table_name = 'boards'",
                ).use { rs -> while (rs.next()) columns += rs.getString(1) }
            }
            assertTrue(columns.contains("id"), "unexpected boards columns: $columns")
            assertFalse(columns.contains("state"), "boards.state should be dropped: $columns")

            val indexes = mutableListOf<String>()
            conn.createStatement().use { st ->
                st.executeQuery("select indexname from pg_indexes where tablename = 'members'")
                    .use { rs -> while (rs.next()) indexes += rs.getString(1) }
            }
            assertTrue(indexes.contains("members_user_id_idx"), "missing members(user_id) index: $indexes")
        }
    }
}
