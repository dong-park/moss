package com.moss.server

import com.moss.server.boards.MCP_GRANT_GONE_MESSAGE
import com.moss.server.oauth.OAuthGrants
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.readBytes
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** RM-6: sync가 MCP 첨부를 올리고 되돌리는 내부 경로. 웹 업로드와 같은 검사에 연결(grant) 확인이 더해진다. */
class McpFileRoutesTest : ApiTest() {

    private val secret = "internal-secret"
    private val cfg = config.copy(syncInternalSecret = secret)

    private fun mcpApp(appConfig: AppConfig = cfg, block: suspend ApplicationTestBuilder.() -> Unit) = testApplication {
        application { mossModule(appConfig, google, TestDb.dataSource) }
        block()
    }

    private fun grant(userId: String, revoked: Boolean = false): String {
        val id = UUID.randomUUID()
        val now = System.currentTimeMillis()
        transaction {
            OAuthGrants.insert {
                it[OAuthGrants.id] = id
                it[OAuthGrants.userId] = UUID.fromString(userId)
                it[clientId] = "claude-test"
                it[clientName] = "Claude"
                it[resource] = "https://moss.test/mcp"
                it[createdAt] = now
                if (revoked) it[revokedAt] = now
            }
        }
        return id.toString()
    }

    private suspend fun HttpClient.mcpUpload(
        boardId: String,
        user: String?,
        grant: String?,
        internal: String? = secret,
        bytes: ByteArray = "mcp attachment".toByteArray(),
    ): HttpResponse = submitFormWithBinaryData(
        "/internal/mcp/boards/$boardId/files",
        formData {
            append(
                "file",
                bytes,
                Headers.build {
                    append(HttpHeaders.ContentType, "image/png")
                    append(HttpHeaders.ContentDisposition, "filename=\"cat.png\"")
                },
            )
        },
    ) {
        internal?.let { header("X-Moss-Internal", it) }
        user?.let { header("X-Moss-User", it) }
        grant?.let { header("X-Moss-Grant", it) }
    }

    private suspend fun HttpClient.mcpDelete(boardId: String, fileId: String, user: String, grant: String): HttpResponse =
        delete("/internal/mcp/boards/$boardId/files/$fileId") {
            header("X-Moss-Internal", secret)
            header("X-Moss-User", user)
            header("X-Moss-Grant", grant)
        }

    private fun fileRows(): Long = transaction { Files.selectAll().count() }

    @Test
    fun memberUploadsThroughTheInternalRouteAndSyncCanTakeTheFileBack() = mcpApp {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val grantId = grant(owner.user.id)

        val uploaded = client.mcpUpload(boardId, owner.user.id, grantId)
        assertEquals(HttpStatusCode.Created, uploaded.status)
        val dto = uploaded.body<FileDto>()
        assertEquals("cat.png", dto.name)
        assertEquals("image/png", dto.contentType)
        val onDisk = filesDir.resolve(boardId).resolve(dto.id)
        assertTrue(java.nio.file.Files.exists(onDisk))

        // The web reads the MCP upload like any other attachment.
        val downloaded = client.authedGet("/boards/$boardId/files/${dto.id}", owner.accessToken)
        assertEquals(HttpStatusCode.OK, downloaded.status)
        assertContentEquals("mcp attachment".toByteArray(), downloaded.readBytes())

        assertEquals(HttpStatusCode.NoContent, client.mcpDelete(boardId, dto.id, owner.user.id, grantId).status)
        assertFalse(java.nio.file.Files.exists(onDisk))
        assertEquals(0, fileRows())
        assertEquals(HttpStatusCode.NotFound, client.authedGet("/boards/$boardId/files/${dto.id}", owner.accessToken).status)
        assertEquals(HttpStatusCode.NotFound, client.mcpDelete(boardId, dto.id, owner.user.id, grantId).status)
    }

    @Test
    fun onlySyncWithALiveGrantOfThatMemberGetsIn() = mcpApp {
        google.register("owner", "sub-owner", "Owner")
        google.register("stranger", "sub-stranger", "Stranger")
        val owner = login("owner")
        val stranger = login("stranger")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val live = grant(owner.user.id)

        // Without the internal secret: a web token or a wrong secret gets nowhere.
        assertEquals(HttpStatusCode.Unauthorized, client.mcpUpload(boardId, owner.user.id, live, internal = null).status)
        assertEquals(HttpStatusCode.Unauthorized, client.mcpUpload(boardId, owner.user.id, live, internal = "wrong").status)

        // A revoked grant, someone else's grant, or no grant: 401 with the reconnect wording.
        for ((user, grantId) in listOf(
            owner.user.id to grant(owner.user.id, revoked = true),
            stranger.user.id to live,
            owner.user.id to null,
        )) {
            val refused = client.mcpUpload(boardId, user, grantId)
            assertEquals(HttpStatusCode.Unauthorized, refused.status)
            assertEquals(MCP_GRANT_GONE_MESSAGE, refused.body<ErrorResponse>().message)
        }

        // A live grant of someone who is not a member: 403, as on the web route.
        assertEquals(HttpStatusCode.Forbidden, client.mcpUpload(boardId, stranger.user.id, grant(stranger.user.id)).status)
        assertEquals(0, fileRows())
    }

    @Test
    fun theRouteIsClosedWhenNoInternalSecretIsSet() = mcpApp(config) {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val response = client.mcpUpload(boardId, owner.user.id, grant(owner.user.id), internal = "")
        assertEquals(HttpStatusCode.Unauthorized, response.status)
        assertEquals(0, fileRows())
    }
}
