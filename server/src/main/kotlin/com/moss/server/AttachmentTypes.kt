package com.moss.server

/**
 * Uploads are attacker-controlled bytes with an attacker-controlled Content-Type.
 * Only a small allowlist is served back with its declared type; everything else
 * (notably text/html and image/svg+xml) is stored and served as
 * application/octet-stream so the browser never renders it inline.
 */
object AttachmentTypes {

    const val OCTET_STREAM = "application/octet-stream"

    private val allowed = setOf(
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "application/pdf",
    )

    // 서브타입이 비면 Ktor ContentType.parse 가 던진다 — "audio/" 같은 값은 거른다.
    private val AUDIO = Regex("^audio/[a-z0-9][a-z0-9.+-]*$")

    fun sanitize(raw: String?): String {
        val type = raw?.substringBefore(';')?.trim()?.lowercase()
        if (type.isNullOrEmpty()) return OCTET_STREAM
        return if (type in allowed || AUDIO.matches(type)) type else OCTET_STREAM
    }
}
