package com.moss.server.boards

import com.moss.server.AttachmentTypes
import com.moss.server.InvalidRequestException
import com.moss.server.AcceptInviteRequest
import com.moss.server.BoardDto
import com.moss.server.BoardTokenResponse
import com.moss.server.ConflictException
import com.moss.server.FileDto
import com.moss.server.ForbiddenException
import com.moss.server.GoneException
import com.moss.server.InvitePreviewRequest
import com.moss.server.InvitePreviewResponse
import com.moss.server.InviteResponse
import com.moss.server.MemberDto
import com.moss.server.MossServer
import com.moss.server.NotFoundException
import com.moss.server.PayloadTooLargeException
import com.moss.server.ShareRequest
import com.moss.server.newId
import com.moss.server.parseBoardId
import com.moss.server.parseUuid
import com.moss.server.requireUserId
import com.moss.server.toDto
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.server.request.receive
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.respond
import io.ktor.server.response.respondOutputStream
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.utils.io.readRemaining
import kotlinx.io.readByteArray
import java.net.URLEncoder
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption

private const val BOARD_NAME_MAX = 80
const val UNNAMED_BOARD = "이름 없는 보드"

private const val STREAM_CHUNK_BYTES = 64L * 1024

/**
 * Streams a multipart file part to [tmp], counting bytes, and aborts (deleting the
 * temp file) as soon as it passes [maxBytes]. The whole body never lands in heap.
 */
private suspend fun streamToTemp(part: PartData.FileItem, tmp: Path, maxBytes: Long): Long {
    var total = 0L
    try {
        Files.newOutputStream(tmp, StandardOpenOption.TRUNCATE_EXISTING).use { out ->
            val channel = part.provider()
            while (true) {
                val chunk = channel.readRemaining(STREAM_CHUNK_BYTES).readByteArray()
                if (chunk.isEmpty()) break
                total += chunk.size
                if (total > maxBytes) throw PayloadTooLargeException("파일은 20MB까지 올릴 수 있어요")
                out.write(chunk)
            }
        }
    } catch (e: Exception) {
        Files.deleteIfExists(tmp)
        throw e
    }
    return total
}

fun Route.boardRoutes(server: MossServer) {

    // Owner adds the board to the server (AC-4). Idempotent for the same owner.
    post("/boards/{id}/share") {
        val boardId = parseBoardId(call.parameters["id"])
        val userId = call.requireUserId(server)
        // 앱에 보드 이름 UI가 없어 빈 이름이 온다 — 기본값으로 받는다.
        val request = call.receive<ShareRequest>()
        val name = request.name.trim().ifEmpty { UNNAMED_BOARD }
        if (name.length > BOARD_NAME_MAX) throw InvalidRequestException("보드 이름은 ${BOARD_NAME_MAX}자까지예요")

        val existing = server.repo.board(boardId)
        val parentId = request.parentId?.let { parseBoardId(it) }
        if (parentId != null) {
            // 공유 보드 안 파일함 — 부모 체인의 멤버면 편집자도 등록한다. 권한은 루트에서 물려받는다.
            if (parentId == boardId) throw InvalidRequestException("보드를 자기 안에 둘 수 없어요")
            if (server.repo.roleOf(parentId, userId) == null) throw ForbiddenException("이 보드의 멤버가 아니에요")
            if (existing != null && existing.parentId != parentId) throw ForbiddenException("이미 다른 곳에 공유된 보드예요")
            if (existing == null) server.repo.shareSubBoard(boardId, parentId, name)
            else if (existing.name != name) server.repo.renameBoard(boardId, name)
            val view = server.repo.boardForUser(boardId, userId) ?: throw NotFoundException("보드를 찾을 수 없어요")
            call.respond(HttpStatusCode.OK, view.toDto())
            return@post
        }

        if (existing != null && existing.ownerId != userId) throw ForbiddenException("이미 다른 사람이 공유한 보드예요")
        // Idempotent insert; a concurrent share keeps the first row.
        server.repo.shareBoard(boardId, userId, name)
        val board = server.repo.board(boardId) ?: throw NotFoundException("보드를 찾을 수 없어요")
        if (board.ownerId != userId) throw ForbiddenException("이미 다른 사람이 공유한 보드예요")
        if (board.name != name) server.repo.renameBoard(boardId, name)
        val view = server.repo.boardForUser(boardId, userId) ?: throw NotFoundException("보드를 찾을 수 없어요")
        call.respond(HttpStatusCode.OK, view.toDto())
    }

    // Owner revokes the share (AC-13). Server rows are deleted; n9 clears the clients.
    delete("/boards/{id}/share") {
        val boardId = parseBoardId(call.parameters["id"])
        val userId = call.requireUserId(server)
        val board = server.repo.board(boardId) ?: throw NotFoundException("보드를 찾을 수 없어요")
        if (board.ownerId != userId) throw ForbiddenException("소유자만 공유를 해제할 수 있어요")
        if (board.parentId != null) throw InvalidRequestException("파일함은 바깥 보드에서 공유를 해제해 주세요")
        // D12: 파일을 먼저 지운다. 실패하면 행이 남아 소유자가 같은 호출로 재시도할 수 있다.
        // 행을 먼저 지우면 재시도에서 소유권을 확인할 수 없어 누구나 남은 디렉터리를 지울 수 있게 된다(리뷰 P0).
        // 파일함 행은 FK cascade로 같이 지워진다 — 파일과 sync 연결은 직접 정리한다.
        val all = listOf(boardId) + server.repo.descendants(boardId)
        all.forEach { server.fileStore.deleteBoard(it) }
        server.repo.deleteBoard(boardId)
        all.forEach { server.syncClose.closeBoard(it) }
        call.respond(HttpStatusCode.NoContent)
    }

    // Members upload an attachment (task 1). Multipart part named "file"; the
    // server owns the fileId and the on-disk path stays {boardId}/{fileId}.
    post("/boards/{id}/files") {
        val boardId = parseBoardId(call.parameters["id"])
        val userId = call.requireUserId(server)
        if (server.repo.roleOf(boardId, userId) == null) throw ForbiddenException("이 보드의 멤버가 아니에요")

        val tmp = server.fileStore.tempFile()
        var stored: Path? = null
        var result: FileDto? = null
        try {
            var name: String? = null
            var rawType: String? = null
            var size = -1L
            var hasFile = false
            call.receiveMultipart().forEachPart { part ->
                try {
                    if (part is PartData.FileItem) {
                        if (hasFile) throw InvalidRequestException("파일은 하나만 올릴 수 있어요")
                        hasFile = true
                        name = part.originalFileName
                        rawType = part.headers[HttpHeaders.ContentType]
                        size = streamToTemp(part, tmp, server.config.maxFileBytes)
                    }
                } finally {
                    part.dispose()
                }
            }
            if (!hasFile) throw InvalidRequestException("파일이 필요해요")
            val fileName = name?.takeIf { it.isNotBlank() } ?: "file"
            // Never echo the attacker's type: only the allowlist survives.
            val contentType = AttachmentTypes.sanitize(rawType)

            val fileId = newId()
            when (server.repo.saveFile(boardId, fileId, fileName, size, contentType)) {
                SaveFileResult.QUOTA_EXCEEDED -> {
                    Files.deleteIfExists(tmp)
                    throw PayloadTooLargeException("보드 용량(500MB)을 넘었어요")
                }
                SaveFileResult.BOARD_MISSING -> {
                    Files.deleteIfExists(tmp)
                    throw NotFoundException("보드를 찾을 수 없어요")
                }
                SaveFileResult.ACCEPTED -> {
                    try {
                        server.fileStore.moveInto(boardId, fileId, tmp)
                    } catch (e: Exception) {
                        // 행은 이미 커밋됐다 — 바이트 없이 쿼터만 먹는 행을 남기지 않는다.
                        server.repo.deleteFile(boardId, fileId)
                        throw e
                    }
                    stored = server.fileStore.uploadPath(boardId, fileId)
                }
            }
            result = FileDto(fileId.toString(), fileName, size, contentType)
        } catch (e: Exception) {
            // A failed upload leaves neither temp nor promoted bytes behind.
            Files.deleteIfExists(tmp)
            stored?.let { Files.deleteIfExists(it) }
            throw e
        }
        // 응답 실패(클라이언트 끊김)로 이미 저장된 파일을 지우지 않게 try 밖에서 보낸다.
        call.respond(HttpStatusCode.Created, result!!)
    }

    // Members download an attachment (task 1). The stored name is a UUID; the
    // original name rides along in Content-Disposition only.
    get("/boards/{id}/files/{fileId}") {
        val boardId = parseBoardId(call.parameters["id"])
        val fileId = parseUuid(call.parameters["fileId"], "파일 id")
        val userId = call.requireUserId(server)
        if (server.repo.roleOf(boardId, userId) == null) throw ForbiddenException("이 보드의 멤버가 아니에요")
        val meta = server.repo.file(boardId, fileId) ?: throw NotFoundException("파일을 찾을 수 없어요")
        // Sanitize again at read time: rows written before the allowlist existed may
        // still carry a dangerous type.
        val type = runCatching { ContentType.parse(AttachmentTypes.sanitize(meta.contentType)) }.getOrNull()
            ?: ContentType.Application.OctetStream
        val path = server.fileStore.uploadPath(boardId, fileId)
        val stream = try {
            Files.newInputStream(path)
        } catch (e: java.io.IOException) {
            throw NotFoundException("파일을 찾을 수 없어요")
        }
        val encoded = URLEncoder.encode(meta.name, Charsets.UTF_8).replace("+", "%20")
        // Never let a browser render an attachment inline.
        call.response.headers.append(HttpHeaders.ContentDisposition, "attachment; filename*=UTF-8''$encoded")
        call.response.headers.append("X-Content-Type-Options", "nosniff")
        call.response.headers.append("Content-Security-Policy", "default-src 'none'; sandbox")
        call.respondOutputStream(type, HttpStatusCode.OK) {
            stream.use { it.copyTo(this) }
        }
    }

    // Owner (re)issues the invite link. Old links stop working (AC-6), members stay.
    post("/boards/{id}/invites") {
        // 파일함에서 불러도 공유 루트의 링크를 준다 — 멤버십은 루트에만 있다.
        val boardId = server.repo.rootOf(parseBoardId(call.parameters["id"]))
        val userId = call.requireUserId(server)
        val board = server.repo.board(boardId) ?: throw NotFoundException("보드를 찾을 수 없어요")
        if (board.ownerId != userId) throw ForbiddenException("소유자만 링크를 만들 수 있어요")
        val raw = server.repo.reissueInvite(boardId)
        call.respond(HttpStatusCode.OK, InviteResponse(raw))
    }

    // Unauthenticated card preview: names only, never the token owner's identity claims (AC-5).
    // Expired link -> 410. The token travels in the body so it never lands in request logs.
    post("/invites/preview") {
        val raw = call.receive<InvitePreviewRequest>().token
        if (raw.isBlank()) throw InvalidRequestException("초대 토큰이 필요해요")
        val preview = server.repo.previewInvite(raw) ?: throw GoneException("만료된 초대예요")
        call.respond(HttpStatusCode.OK, InvitePreviewResponse(preview.boardName, preview.ownerName))
    }

    // Invited user accepts and joins as editor (AC-5). Expired link -> 410.
    // The token travels in the JSON body (not the path) so it never lands in request logs.
    post("/invites/accept") {
        // 인증을 먼저 — 무인증 요청의 본문은 파싱하지 않는다.
        val userId = call.requireUserId(server)
        val raw = call.receive<AcceptInviteRequest>().token
        if (raw.isBlank()) throw InvalidRequestException("초대 토큰이 필요해요")
        val boardId = server.repo.activeInviteBoard(raw) ?: throw GoneException("만료된 초대예요")
        when (server.repo.joinBoard(boardId, userId)) {
            JoinResult.FULL -> throw ConflictException("이 보드는 자리가 다 찼어요")
            JoinResult.MISSING -> throw GoneException("보드를 찾을 수 없어요")
            JoinResult.JOINED, JoinResult.ALREADY_MEMBER -> Unit
        }
        val board = server.repo.boardForUser(boardId, userId) ?: throw NotFoundException("보드를 찾을 수 없어요")
        call.respond(HttpStatusCode.OK, board.toDto())
    }

    // Owner removes a member (AC-14). Removing the owner is impossible.
    delete("/boards/{id}/members/{userId}") {
        val boardId = server.repo.rootOf(parseBoardId(call.parameters["id"]))
        val actor = call.requireUserId(server)
        val target = parseUuid(call.parameters["userId"], "사용자 id")
        val board = server.repo.board(boardId) ?: throw NotFoundException("보드를 찾을 수 없어요")
        if (board.ownerId != actor) throw ForbiddenException("소유자만 내보낼 수 있어요")
        if (target == board.ownerId) throw InvalidRequestException("소유자는 내보낼 수 없어요")
        if (!server.repo.removeMember(boardId, target)) throw NotFoundException("그 사람은 이 보드의 멤버가 아니에요")
        (listOf(boardId) + server.repo.descendants(boardId)).forEach { server.syncClose.closeBoard(it, target) }
        call.respond(HttpStatusCode.NoContent)
    }

    // n9: 팝오버 멤버 목록. 멤버만 볼 수 있다 (AC-5·AC-9).
    get("/boards/{id}/members") {
        val boardId = server.repo.rootOf(parseBoardId(call.parameters["id"]))
        val userId = call.requireUserId(server)
        if (server.repo.roleOf(boardId, userId) == null) throw ForbiddenException("이 보드의 멤버가 아니에요")
        val members: List<MemberDto> = server.repo.membersOf(boardId).map { it.toDto() }
        call.respond(HttpStatusCode.OK, members)
    }

    // Shared boards across the account's devices (AC-17 / D13).
    get("/me/boards") {
        val userId = call.requireUserId(server)
        val boards: List<BoardDto> = server.repo.boardsForUser(userId).map { it.toDto() }
        call.respond(HttpStatusCode.OK, boards)
    }

    // Short-lived board token for Hocuspocus (AC-11). Members only.
    post("/boards/{id}/token") {
        val boardId = parseBoardId(call.parameters["id"])
        val userId = call.requireUserId(server)
        server.repo.roleOf(boardId, userId) ?: throw ForbiddenException("이 보드의 멤버가 아니에요")
        call.respond(
            HttpStatusCode.OK,
            BoardTokenResponse(
                boardToken = server.tokens.boardToken(userId, boardId),
                expiresInSeconds = server.config.boardTokenTtlSeconds,
            ),
        )
    }
}
