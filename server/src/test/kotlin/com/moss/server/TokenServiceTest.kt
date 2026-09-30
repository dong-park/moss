package com.moss.server

import com.moss.server.auth.TokenService
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class TokenServiceTest {

    private val tokens = TokenService("test-secret")

    private fun ttlSeconds(token: String, type: TokenService.TokenType): Long {
        val decoded = tokens.verify(token, type)
        return (decoded.expiresAt.time - decoded.issuedAt.time) / 1000
    }

    @Test
    fun everyTokenTypeHasItsOwnTtl() {
        val userId = UUID.randomUUID()
        assertEquals(15L * 60, ttlSeconds(tokens.accessToken(userId), TokenService.TokenType.ACCESS))
        assertEquals(30L * 24 * 60 * 60, ttlSeconds(tokens.refreshToken(userId), TokenService.TokenType.REFRESH))
        assertEquals(60L * 60, ttlSeconds(tokens.boardToken(userId, newBoardId()), TokenService.TokenType.BOARD))
    }

    @Test
    fun verifyRejectsTokenOfAnotherType() {
        val access = tokens.accessToken(UUID.randomUUID())
        assertFailsWith<UnauthorizedException> { tokens.verify(access, TokenService.TokenType.REFRESH) }
    }
}
