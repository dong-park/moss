package com.moss.server

import org.slf4j.LoggerFactory
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.UUID

/**
 * Board attachments live on a local disk volume (D12). Layout:
 *   {root}/{boardId}/{fileId}
 * The fileId is a server-generated UUID and the boardId has passed [parseBoardId],
 * so neither segment can escape the root. Original names are metadata only (see the files table).
 *
 * Uploads stream into a temp file under [root] first; [moveInto] atomically
 * promotes it once the board quota accepts the row.
 */
class FileStore(private val root: Path) {

    private val log = LoggerFactory.getLogger(FileStore::class.java)

    init {
        // Fail fast: a missing or read-only volume must stop the app at boot,
        // not swallow every upload at runtime.
        try {
            Files.createDirectories(root)
            Files.deleteIfExists(Files.createTempFile(root, ".write-probe", ".tmp"))
        } catch (e: IOException) {
            throw IllegalStateException("FILES_DIR is not writable: $root", e)
        }
    }

    fun uploadPath(boardId: String, fileId: UUID): Path =
        root.resolve(boardId).resolve(fileId.toString())

    /** A temp file for an in-flight upload; the caller moves or deletes it. */
    fun tempFile(): Path = Files.createTempFile(root, "upload-", ".tmp")

    /** Promotes a fully-read temp file to its final path. */
    fun moveInto(boardId: String, fileId: UUID, tmp: Path) {
        val path = uploadPath(boardId, fileId)
        Files.createDirectories(path.parent)
        Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING)
    }

    fun delete(boardId: String, fileId: UUID) {
        Files.deleteIfExists(uploadPath(boardId, fileId))
    }

    /**
     * Removes the whole board directory. A missing directory is a no-op. A failed
     * delete is logged (not thrown) so a later revoke can retry the cleanup.
     */
    fun deleteBoard(boardId: String) {
        val dir = root.resolve(boardId).toFile()
        if (!dir.exists()) return
        if (!dir.deleteRecursively()) {
            log.error("failed to delete board directory {}", dir)
        }
    }
}
