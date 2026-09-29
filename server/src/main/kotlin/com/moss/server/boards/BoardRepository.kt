package com.moss.server.boards

import com.moss.server.Boards
import com.moss.server.ConflictException
import com.moss.server.Files
import com.moss.server.GoogleUser
import com.moss.server.Invites
import com.moss.server.Members
import com.moss.server.Users
import com.moss.server.dbQuery
import com.moss.server.newId
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.insertIgnore
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.sum
import org.jetbrains.exposed.sql.update
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID

data class UserRow(val id: UUID, val googleSub: String?, val name: String, val avatar: String?)

/** D5: 메일 로그인에 필요한 정보 — 응답에 쓸 [UserRow]와 저장된 bcrypt 해시. */
data class EmailCredential(val user: UserRow, val passwordHash: String)
data class BoardRow(val id: String, val ownerId: UUID, val name: String)
data class FileRow(val id: UUID, val boardId: String, val name: String, val size: Long, val contentType: String?)
data class MemberBoard(val id: String, val name: String, val role: String, val ownerName: String)
data class MemberUser(val id: UUID, val name: String, val avatar: String?, val role: String)
data class InvitePreview(val boardName: String, val ownerName: String)

enum class JoinResult { JOINED, ALREADY_MEMBER, FULL, MISSING }

/** Outcome of [BoardRepository.saveFile]; each carries its own compensation. */
enum class SaveFileResult { ACCEPTED, QUOTA_EXCEEDED, BOARD_MISSING }

object InviteTokens {
    private val random = SecureRandom()

    fun generate(): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    fun hash(raw: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}

class BoardRepository(
    private val maxMembersPerBoard: Int,
    private val maxBoardFileBytes: Long = DEFAULT_MAX_BOARD_FILE_BYTES,
) {

    suspend fun upsertUser(google: GoogleUser): UserRow = dbQuery {
        val existing = Users.selectAll().where { Users.googleSub eq google.sub }.singleOrNull()
        if (existing != null) {
            val id = existing[Users.id]
            val avatar = google.avatar
            Users.update({ Users.id eq id }) {
                it[name] = google.name
                if (avatar != null) it[Users.avatar] = avatar
            }
            UserRow(id, google.sub, google.name, avatar ?: existing[Users.avatar])
        } else {
            val id = newId()
            // Concurrent logins for a brand-new google_sub may race on the unique index;
            // ignore the loser's insert and read back the winner's row.
            Users.insertIgnore {
                it[Users.id] = id
                it[googleSub] = google.sub
                it[name] = google.name
                it[avatar] = google.avatar
                it[createdAt] = System.currentTimeMillis()
            }
            val row = Users.selectAll().where { Users.googleSub eq google.sub }.single()
            UserRow(row[Users.id], row[Users.googleSub], row[Users.name], row[Users.avatar])
        }
    }

    suspend fun userById(userId: UUID): UserRow? = dbQuery {
        Users.selectAll().where { Users.id eq userId }.singleOrNull()
            ?.let { UserRow(it[Users.id], it[Users.googleSub], it[Users.name], it[Users.avatar]) }
    }

    /**
     * D4~D7: 메일 가입 계정 생성. 저장 전에 이메일은 정규화되어 있어야 한다(D2).
     * 고유 인덱스 충돌은 insertIgnore로 잡아 409로 알린다 — 동시 가입 경쟁에도 계정은 하나만 생긴다.
     */
    suspend fun createEmailUser(email: String, passwordHash: String, name: String): UserRow = dbQuery {
        val id = newId()
        val inserted = Users.insertIgnore {
            it[Users.id] = id
            it[Users.email] = email
            it[Users.passwordHash] = passwordHash
            it[Users.name] = name
            it[createdAt] = System.currentTimeMillis()
        }.insertedCount
        if (inserted == 0) throw ConflictException("이미 가입된 메일이에요")
        UserRow(id, null, name, null)
    }

    /** 로그인용: 정규화된 이메일로 계정을 찾되 password_hash가 없는 행은 계정 없음으로 본다. */
    suspend fun findByEmail(email: String): EmailCredential? = dbQuery {
        val row = Users.selectAll().where { Users.email eq email }.singleOrNull()
            ?: return@dbQuery null
        val hash = row[Users.passwordHash] ?: return@dbQuery null
        EmailCredential(
            UserRow(row[Users.id], row[Users.googleSub], row[Users.name], row[Users.avatar]),
            hash,
        )
    }

    suspend fun board(boardId: String): BoardRow? = dbQuery {
        Boards.selectAll().where { Boards.id eq boardId }.singleOrNull()
            ?.let { BoardRow(it[Boards.id], it[Boards.ownerId], it[Boards.name]) }
    }

    /**
     * Creates the board row and its single owner membership in one transaction.
     * Idempotent: a concurrent share of the same board does not blow up the primary key,
     * it silently keeps the first row (callers re-read ownership afterwards).
     */
    suspend fun shareBoard(boardId: String, ownerId: UUID, name: String): BoardRow = dbQuery {
        val now = System.currentTimeMillis()
        Boards.insertIgnore {
            it[id] = boardId
            it[Boards.ownerId] = ownerId
            it[Boards.name] = name
            it[createdAt] = now
        }
        Members.insertIgnore {
            it[Members.boardId] = boardId
            it[Members.userId] = ownerId
            it[role] = "owner"
            it[createdAt] = now
        }
        BoardRow(boardId, ownerId, name)
    }

    suspend fun renameBoard(boardId: String, name: String) {
        dbQuery { Boards.update({ Boards.id eq boardId }) { it[Boards.name] = name } }
    }

    suspend fun roleOf(boardId: String, userId: UUID): String? = dbQuery {
        Members.selectAll().where { (Members.boardId eq boardId) and (Members.userId eq userId) }
            .singleOrNull()?.get(Members.role)
    }

    suspend fun memberCount(boardId: String): Int = dbQuery {
        Members.selectAll().where { Members.boardId eq boardId }.count().toInt()
    }

    /** n9: 팝오버 멤버 목록 — 참여 순(createdAt asc)으로 계정 이름·아바타·역할을 준다. */
    suspend fun membersOf(boardId: String): List<MemberUser> = dbQuery {
        Members.join(Users, JoinType.INNER, Members.userId, Users.id)
            .selectAll().where { Members.boardId eq boardId }
            .orderBy(Members.createdAt to SortOrder.ASC)
            .map { MemberUser(it[Users.id], it[Users.name], it[Users.avatar], it[Members.role]) }
    }

    suspend fun boardsForUser(userId: UUID): List<MemberBoard> = dbQuery {
        Boards.join(Members, JoinType.INNER, Boards.id, Members.boardId)
            .join(Users, JoinType.INNER, Boards.ownerId, Users.id)
            .selectAll().where { Members.userId eq userId }
            .map { MemberBoard(it[Boards.id], it[Boards.name], it[Members.role], it[Users.name]) }
    }

    suspend fun boardForUser(boardId: String, userId: UUID): MemberBoard? = dbQuery {
        Boards.join(Members, JoinType.INNER, Boards.id, Members.boardId)
            .join(Users, JoinType.INNER, Boards.ownerId, Users.id)
            .selectAll().where { (Boards.id eq boardId) and (Members.userId eq userId) }
            .singleOrNull()
            ?.let { MemberBoard(it[Boards.id], it[Boards.name], it[Members.role], it[Users.name]) }
    }

    /** Revokes any active invite for the board and returns a fresh raw token. */
    suspend fun reissueInvite(boardId: String): String = dbQuery {
        val now = System.currentTimeMillis()
        Invites.update({ (Invites.boardId eq boardId) and Invites.revokedAt.isNull() }) {
            it[revokedAt] = now
        }
        val raw = InviteTokens.generate()
        Invites.insert {
            it[token] = InviteTokens.hash(raw)
            it[Invites.boardId] = boardId
            it[createdAt] = now
        }
        raw
    }

    /** Board name and owner name for a non-revoked token, or null when missing/revoked. No auth. */
    suspend fun previewInvite(rawToken: String): InvitePreview? = dbQuery {
        Invites.join(Boards, JoinType.INNER, Invites.boardId, Boards.id)
            .join(Users, JoinType.INNER, Boards.ownerId, Users.id)
            .selectAll()
            .where { (Invites.token eq InviteTokens.hash(rawToken)) and Invites.revokedAt.isNull() }
            .singleOrNull()
            ?.let { InvitePreview(it[Boards.name], it[Users.name]) }
    }

    /** Returns the board id for a non-revoked token, or null when missing/revoked. */
    suspend fun activeInviteBoard(rawToken: String): String? = dbQuery {
        Invites.selectAll()
            .where { (Invites.token eq InviteTokens.hash(rawToken)) and Invites.revokedAt.isNull() }
            .singleOrNull()?.get(Invites.boardId)
    }

    suspend fun inviteCount(boardId: String): Int = dbQuery {
        Invites.selectAll().where { (Invites.boardId eq boardId) and Invites.revokedAt.isNull() }.count().toInt()
    }

    /**
     * Joins [userId] to [boardId] as an editor, respecting the member limit.
     * The board row is locked so concurrent accepts cannot both pass the limit check.
     */
    suspend fun joinBoard(boardId: String, userId: UUID): JoinResult = dbQuery {
        Boards.selectAll().where { Boards.id eq boardId }.forUpdate().singleOrNull()
            ?: return@dbQuery JoinResult.MISSING
        val existing = Members.selectAll()
            .where { (Members.boardId eq boardId) and (Members.userId eq userId) }
            .singleOrNull()
        if (existing != null) return@dbQuery JoinResult.ALREADY_MEMBER
        val count = Members.selectAll().where { Members.boardId eq boardId }.count()
        if (count >= maxMembersPerBoard.toLong()) return@dbQuery JoinResult.FULL
        Members.insert {
            it[Members.boardId] = boardId
            it[Members.userId] = userId
            it[role] = "editor"
            it[createdAt] = System.currentTimeMillis()
        }
        JoinResult.JOINED
    }

    suspend fun removeMember(boardId: String, userId: UUID): Boolean = dbQuery {
        Members.deleteWhere { (Members.boardId eq boardId) and (Members.userId eq userId) } > 0
    }

    /** Removes the board row; members, invites and file metadata cascade. */
    suspend fun deleteBoard(boardId: String): Boolean = dbQuery {
        Boards.deleteWhere { Boards.id eq boardId } > 0
    }

    /** Used by tests and n10 to confirm cascade behavior. */
    suspend fun fileCount(boardId: String): Int = dbQuery {
        Files.selectAll().where { Files.boardId eq boardId }.count().toInt()
    }

    suspend fun deleteFile(boardId: String, fileId: UUID) = dbQuery {
        Files.deleteWhere { (Files.boardId eq boardId) and (Files.id eq fileId) }
    }

    suspend fun file(boardId: String, fileId: UUID): FileRow? = dbQuery {
        Files.selectAll().where { (Files.boardId eq boardId) and (Files.id eq fileId) }
            .singleOrNull()
            ?.let { FileRow(it[Files.id], it[Files.boardId], it[Files.name], it[Files.size], it[Files.contentType]) }
    }

    /**
     * Inserts the file row after checking the board quota. The board row is locked
     * (like [joinBoard]) and the used bytes are aggregated in SQL, so two concurrent
     * uploads cannot both pass the limit and overshoot [maxBoardFileBytes]. Returns a
     * named [SaveFileResult] the caller can compensate for.
     */
    suspend fun saveFile(
        boardId: String,
        fileId: UUID,
        name: String,
        size: Long,
        contentType: String?,
    ): SaveFileResult = dbQuery {
        Boards.selectAll().where { Boards.id eq boardId }.forUpdate().singleOrNull()
            ?: return@dbQuery SaveFileResult.BOARD_MISSING
        val total = Files.size.sum()
        val used = Files.select(total).where { Files.boardId eq boardId }.single()[total] ?: 0L
        if (used + size > maxBoardFileBytes) return@dbQuery SaveFileResult.QUOTA_EXCEEDED
        Files.insert {
            it[id] = fileId
            it[Files.boardId] = boardId
            it[Files.name] = name
            it[Files.size] = size
            it[Files.contentType] = contentType
            it[createdAt] = System.currentTimeMillis()
        }
        SaveFileResult.ACCEPTED
    }

    companion object {
        /** D12: 500 MB per board. */
        const val DEFAULT_MAX_BOARD_FILE_BYTES: Long = 500L * 1024 * 1024
    }
}
