package com.moss.server.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.JWTVerifier
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.exceptions.JWTVerificationException
import com.auth0.jwt.interfaces.DecodedJWT
import com.moss.server.UnauthorizedException
import java.time.Instant
import java.util.Date
import java.util.UUID

/**
 * Signs and verifies the three JWT kinds used by this feature.
 *
 * - ACCESS: short lived, `typ=access`, `sub=userId`.
 * - REFRESH: long lived, `typ=refresh`, `sub=userId`.
 * - BOARD: passed to Hocuspocus (n5), `typ=board`, `sub=userId`, `boardId` claim.
 *
 * n5 must verify board tokens with the same `JWT_SECRET` and issuer (`moss`).
 */
class TokenService(
    private val secret: String,
    private val accessTtlSeconds: Long = 15L * 60,
    private val refreshTtlSeconds: Long = 30L * 24 * 60 * 60,
    private val boardTtlSeconds: Long = 60L * 60,
) {

    /** JWT `typ` claim values. Only these three kinds exist, so TTLs are exhaustive. */
    enum class TokenType(val claim: String) {
        ACCESS("access"),
        REFRESH("refresh"),
        BOARD("board"),
    }

    private val algorithm: Algorithm = Algorithm.HMAC256(secret)
    private val verifier: JWTVerifier = JWT.require(algorithm).withIssuer(ISSUER).build()

    fun accessToken(userId: UUID): String = sign(userId, TokenType.ACCESS)
    fun refreshToken(userId: UUID): String = sign(userId, TokenType.REFRESH)

    fun boardToken(userId: UUID, boardId: String): String =
        sign(userId, TokenType.BOARD, extra = mapOf(CLAIM_BOARD_ID to boardId))

    private fun sign(userId: UUID, type: TokenType, extra: Map<String, String> = emptyMap()): String {
        val now = Instant.now()
        val builder = JWT.create()
            .withIssuer(ISSUER)
            .withSubject(userId.toString())
            .withClaim(CLAIM_TYPE, type.claim)
            .withIssuedAt(Date.from(now))
            .withExpiresAt(Date.from(now.plusSeconds(ttlSeconds(type))))
        extra.forEach { (k, v) -> builder.withClaim(k, v) }
        return builder.sign(algorithm)
    }

    private fun ttlSeconds(type: TokenType): Long = when (type) {
        TokenType.ACCESS -> accessTtlSeconds
        TokenType.REFRESH -> refreshTtlSeconds
        TokenType.BOARD -> boardTtlSeconds
    }

    private fun verifySignature(token: String): DecodedJWT =
        try {
            verifier.verify(token)
        } catch (e: JWTVerificationException) {
            throw UnauthorizedException("토큰이 유효하지 않아요")
        }

    /** Verifies signature, issuer, expiry and requires the given [expectedType]. */
    fun verify(token: String, expectedType: TokenType): DecodedJWT {
        val decoded = verifySignature(token)
        if (decoded.getClaim(CLAIM_TYPE).asString() != expectedType.claim) {
            throw UnauthorizedException("토큰 종류가 올바르지 않아요")
        }
        return decoded
    }

    fun userId(decoded: DecodedJWT): UUID =
        try {
            UUID.fromString(decoded.subject)
        } catch (e: Exception) {
            throw UnauthorizedException("토큰이 유효하지 않아요")
        }

    companion object {
        const val ISSUER = "moss"
        const val CLAIM_TYPE = "typ"
        const val CLAIM_BOARD_ID = "boardId"
    }
}
