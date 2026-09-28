package com.moss.server

import io.ktor.client.call.body
import io.ktor.client.statement.readBytes
import io.ktor.http.HttpHeaders
import org.jetbrains.exposed.sql.selectAll
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FileUploadTest : ApiTest() {

    @Test
    fun memberUploadsAndDownloads() = app {
        google.register("owner", "sub-owner", "Owner")
        google.register("editor", "sub-editor", "Editor")
        val owner = login("owner")
        val editor = login("editor")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val invite = client.authed("/boards/$boardId/invites", owner.accessToken).body<InviteResponse>()
        client.authed("/invites/accept", editor.accessToken, AcceptInviteRequest(invite.inviteToken))

        val bytes = "hello attachment".toByteArray()
        val uploaded = client.uploadFile("/boards/$boardId/files", editor.accessToken, "photo.png", bytes, "image/png")
        assertEquals(HttpStatusCode.Created, uploaded.status)
        val dto = uploaded.body<FileDto>()
        assertEquals("photo.png", dto.name)
        assertEquals(bytes.size.toLong(), dto.size)
        assertEquals("image/png", dto.contentType)

        val downloaded = client.authedGet("/boards/$boardId/files/${dto.id}", editor.accessToken)
        assertEquals(HttpStatusCode.OK, downloaded.status)
        assertEquals("image/png", downloaded.headers[HttpHeaders.ContentType])
        assertContentEquals(bytes, downloaded.readBytes())

        // The stored file confirms the bytes are on the configured FILES_DIR.
        assertTrue(java.nio.file.Files.exists(filesDir.resolve(boardId.toString()).resolve(dto.id)))
    }

    @Test
    fun nonMemberIsForbidden() = app {
        google.register("owner", "sub-owner", "Owner")
        google.register("stranger", "sub-stranger", "Stranger")
        val owner = login("owner")
        val stranger = login("stranger")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))

        val uploaded = client.uploadFile("/boards/$boardId/files", stranger.accessToken, "secret.png", byteArrayOf(1), "image/png")
        assertEquals(HttpStatusCode.Forbidden, uploaded.status)

        // An owner upload for reference, then a stranger cannot read it either.
        val own = client.uploadFile("/boards/$boardId/files", owner.accessToken, "ok.png", byteArrayOf(2), "image/png").body<FileDto>()
        assertEquals(
            HttpStatusCode.Forbidden,
            client.authedGet("/boards/$boardId/files/${own.id}", stranger.accessToken).status,
        )
    }

    @Test
    fun fileOverTwentyMegabytesIsRejected() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))

        val tooBig = ByteArray(20 * 1024 * 1024 + 1)
        val response = client.uploadFile("/boards/$boardId/files", owner.accessToken, "big.bin", tooBig)
        assertEquals(HttpStatusCode.PayloadTooLarge, response.status)
        assertEquals("too_large", response.body<ErrorResponse>().error)
    }

    @Test
    fun boardOverFiveHundredMegabytesIsRejected() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))

        // Existing usage fills the board; no need to move real bytes.
        transaction {
            Files.insert {
                it[id] = UUID.randomUUID()
                it[Files.boardId] = boardId
                it[Files.name] = "already.bin"
                it[Files.size] = 500L * 1024 * 1024
                it[contentType] = "application/octet-stream"
                it[createdAt] = 0
            }
        }

        val response = client.uploadFile("/boards/$boardId/files", owner.accessToken, "one.bin", byteArrayOf(1))
        assertEquals(HttpStatusCode.PayloadTooLarge, response.status)

        // The rejected upload left no row and no bytes behind.
        val repo = com.moss.server.boards.BoardRepository(config.maxMembersPerBoard)
        kotlinx.coroutines.runBlocking { assertEquals(1, repo.fileCount(boardId)) }
        assertTrue(java.nio.file.Files.list(filesDir).use { it.toList() }.isEmpty(), "no temp file should remain")
    }

    @Test
    fun revokeDeletesTheBoardDirectory() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val dto = client.uploadFile("/boards/$boardId/files", owner.accessToken, "photo.png", byteArrayOf(1, 2, 3), "image/png").body<FileDto>()

        val boardDir = filesDir.resolve(boardId.toString())
        assertTrue(java.nio.file.Files.exists(boardDir))

        assertEquals(HttpStatusCode.NoContent, client.authedDelete("/boards/$boardId/share", owner.accessToken).status)
        assertFalse(java.nio.file.Files.exists(boardDir), "the board's file directory should be gone after revoke")
    }

    @Test
    fun dangerousUploadsAreServedAsOctetStreamAttachments() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))

        for ((fileName, declared) in listOf("evil.html" to "text/html", "evil.svg" to "image/svg+xml")) {
            val uploaded = client.uploadFile(
                "/boards/$boardId/files",
                owner.accessToken,
                fileName,
                "<script>alert(1)</script>".toByteArray(),
                declared,
            )
            assertEquals(HttpStatusCode.Created, uploaded.status)
            val dto = uploaded.body<FileDto>()
            assertEquals("application/octet-stream", dto.contentType, "$declared must not be stored as-is")

            val downloaded = client.authedGet("/boards/$boardId/files/${dto.id}", owner.accessToken)
            assertEquals(HttpStatusCode.OK, downloaded.status)
            assertEquals("application/octet-stream", downloaded.headers[HttpHeaders.ContentType])
            assertEquals("nosniff", downloaded.headers["X-Content-Type-Options"])
            assertEquals("default-src 'none'; sandbox", downloaded.headers["Content-Security-Policy"])
            assertEquals("attachment", downloaded.headers[HttpHeaders.ContentDisposition]?.substringBefore(';'))
        }
    }

    @Test
    fun secondFilePartIsRejected() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))

        val response = client.uploadTwoFiles(
            "/boards/$boardId/files",
            owner.accessToken,
            "one.bin",
            "two.bin",
            byteArrayOf(1, 2, 3),
        )
        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertEquals("bad_request", response.body<ErrorResponse>().error)

        val repo = com.moss.server.boards.BoardRepository(config.maxMembersPerBoard)
        kotlinx.coroutines.runBlocking { assertEquals(0, repo.fileCount(boardId)) }
        assertTrue(java.nio.file.Files.list(filesDir).use { it.toList() }.isEmpty(), "no temp file should remain")
    }

    @Test
    fun concurrentUploadsCannotExceedTheBoardQuota() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))

        // Leave room for exactly one 1 MiB upload.
        transaction {
            Files.insert {
                it[id] = UUID.randomUUID()
                it[Files.boardId] = boardId
                it[Files.name] = "nearly-full.bin"
                it[Files.size] = 500L * 1024 * 1024 - 1024 * 1024
                it[contentType] = "application/octet-stream"
                it[createdAt] = 0
            }
        }

        val oneMiB = ByteArray(1024 * 1024)
        val statuses = coroutineScope {
            val a = async { client.uploadFile("/boards/$boardId/files", owner.accessToken, "a.bin", oneMiB) }
            val b = async { client.uploadFile("/boards/$boardId/files", owner.accessToken, "b.bin", oneMiB) }
            listOf(a.await().status, b.await().status)
        }
        assertEquals(1, statuses.count { it == HttpStatusCode.Created }, "exactly one upload should fit")
        assertEquals(1, statuses.count { it == HttpStatusCode.PayloadTooLarge }, "the other must be rejected")

        val repo = com.moss.server.boards.BoardRepository(config.maxMembersPerBoard)
        kotlinx.coroutines.runBlocking { assertEquals(2, repo.fileCount(boardId)) }
    }

    @Test
    fun downloadOfMissingBytesIsNotFound() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val fileId = UUID.randomUUID()
        transaction {
            Files.insert {
                it[id] = fileId
                it[Files.boardId] = boardId
                it[Files.name] = "ghost.png"
                it[Files.size] = 10
                it[contentType] = "image/png"
                it[createdAt] = 0
            }
        }

        val response = client.authedGet("/boards/$boardId/files/$fileId", owner.accessToken)
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun revokeOfAMissingBoardIsNotFoundAndTouchesNoFiles() = app {
        google.register("owner", "sub-owner", "Owner")
        google.register("other", "sub-other", "Other")
        val owner = login("owner")
        val other = login("other")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        client.uploadFile("/boards/$boardId/files", owner.accessToken, "photo.png", byteArrayOf(1), "image/png")
        val boardDir = filesDir.resolve(boardId.toString())

        // 행만 사라지고 디렉터리가 남은 상태에서 아무 사용자나 지울 수 없어야 한다.
        transaction {
            Files.deleteAll()
            Members.deleteAll()
            Boards.deleteAll()
        }

        assertEquals(HttpStatusCode.NotFound, client.authedDelete("/boards/$boardId/share", other.accessToken).status)
        assertTrue(java.nio.file.Files.exists(boardDir), "a non-owner must not be able to delete leftover files")
    }

    @Test
    fun bareAudioTypeDownloadsAsOctetStreamInsteadOf500() = app {
        google.register("owner", "sub-owner", "Owner")
        val owner = login("owner")
        val client = client()
        val boardId = newBoardId()
        client.authed("/boards/$boardId/share", owner.accessToken, ShareRequest("Board"))
        val up = client.uploadFile("/boards/$boardId/files", owner.accessToken, "a.bin", byteArrayOf(1, 2), "audio/")
        assertEquals(HttpStatusCode.Created, up.status)
        val fileId = transaction { Files.selectAll().single()[Files.id] }
        val down = client.authedGet("/boards/$boardId/files/$fileId", owner.accessToken)
        assertEquals(HttpStatusCode.OK, down.status)
        assertEquals("application/octet-stream", down.headers[HttpHeaders.ContentType]?.substringBefore(';'))
    }
}
