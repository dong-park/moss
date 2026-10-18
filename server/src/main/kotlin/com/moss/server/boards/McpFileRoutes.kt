package com.moss.server.boards

import com.moss.server.ForbiddenException
import com.moss.server.MossServer
import com.moss.server.NotFoundException
import com.moss.server.UnauthorizedException
import com.moss.server.oauth.OAuthStore
import com.moss.server.parseBoardId
import com.moss.server.parseUuid
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.header
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.post
import org.slf4j.LoggerFactory
import java.security.MessageDigest
import java.util.UUID

private val log = LoggerFactory.getLogger("com.moss.server.boards.McpFileRoutes")

/** 커넥터 연결이 끊겼을 때의 401 문구. sync는 401을 "다시 연결하라"는 안내로 바꿔 에이전트에게 보낸다. */
const val MCP_GRANT_GONE_MESSAGE = "커넥터 연결이 끊겼어요"

/** 내부 MCP 파일 경로를 부른 연결. sync가 introspect로 확인한 값을 헤더로 보내고, 여기서 한 번 더 확인한다. */
private data class McpCaller(val userId: UUID, val grantId: UUID, val clientId: String)

/**
 * sync만 부를 수 있게 내부 비밀(X-Moss-Internal)을 보고, 헤더의 연결(grant)이 아직 살아 있고 그 사용자의 것인지 확인한다.
 * 연결을 끊은 뒤 같은 요청 안에서 업로드가 오더라도 여기서 막힌다.
 */
private suspend fun ApplicationCall.requireMcpCaller(server: MossServer, grants: OAuthStore): McpCaller {
    val secret = server.config.syncInternalSecret
    val sent = request.header("X-Moss-Internal").orEmpty()
    if (secret.isNullOrBlank() || !MessageDigest.isEqual(sent.toByteArray(), secret.toByteArray())) {
        throw UnauthorizedException("인증이 필요해요")
    }
    val userId = runCatching { UUID.fromString(request.header("X-Moss-User")) }.getOrNull()
    val grantId = runCatching { UUID.fromString(request.header("X-Moss-Grant")) }.getOrNull()
    if (userId == null || grantId == null) throw UnauthorizedException(MCP_GRANT_GONE_MESSAGE)
    val grant = grants.activeGrant(grantId, userId) ?: throw UnauthorizedException(MCP_GRANT_GONE_MESSAGE)
    return McpCaller(userId, grantId, grant.clientId)
}

/**
 * 원격 MCP 쓰기 도구(RM-6)의 첨부 경로. sync가 도구 호출을 받아 대신 부른다.
 * 에이전트의 MCP 토큰은 sync 밖으로 나가지 않고(MCP 인가 규격의 토큰 전달 금지), 웹 세션 토큰도 만들지 않는다.
 * 업로드는 웹 경로와 같은 멤버십·용량 검사를 거치고, 기록(로그)에 연결 id·클라이언트가 남아 웹 업로드와 구분된다.
 */
fun Route.mcpFileRoutes(server: MossServer, grants: OAuthStore = OAuthStore(server.config)) {
    post("/internal/mcp/boards/{id}/files") {
        val boardId = parseBoardId(call.parameters["id"])
        val caller = call.requireMcpCaller(server, grants)
        if (server.repo.roleOf(boardId, caller.userId) == null) throw ForbiddenException("이 보드의 멤버가 아니에요")
        val result = call.receiveBoardFile(server, boardId)
        log.info(
            "mcp upload board={} file={} size={} user={} grant={} client={}",
            boardId, result.id, result.size, caller.userId, caller.grantId, caller.clientId,
        )
        call.respond(HttpStatusCode.Created, result)
    }

    // 업로드한 파일을 메모에 붙이지 못했을 때 sync가 되돌린다. 없는 파일이면 404.
    delete("/internal/mcp/boards/{id}/files/{fileId}") {
        val boardId = parseBoardId(call.parameters["id"])
        val fileId = parseUuid(call.parameters["fileId"], "파일 id")
        val caller = call.requireMcpCaller(server, grants)
        if (server.repo.roleOf(boardId, caller.userId) == null) throw ForbiddenException("이 보드의 멤버가 아니에요")
        server.repo.file(boardId, fileId) ?: throw NotFoundException("파일을 찾을 수 없어요")
        // 바이트를 먼저 지운다. 행이 남으면 같은 호출로 다시 지울 수 있다.
        server.fileStore.delete(boardId, fileId)
        server.repo.deleteFile(boardId, fileId)
        log.info(
            "mcp file removed board={} file={} user={} grant={} client={}",
            boardId, fileId, caller.userId, caller.grantId, caller.clientId,
        )
        call.respond(HttpStatusCode.NoContent)
    }
}
