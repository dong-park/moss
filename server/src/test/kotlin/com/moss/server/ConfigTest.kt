package com.moss.server

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ConfigTest {

    private val strongSecret = "s".repeat(AppConfig.MIN_JWT_SECRET_BYTES)

    @Test
    fun jwtSecretIsRequired() {
        assertFailsWith<IllegalArgumentException> { AppConfig.fromEnv(emptyMap()) }
        assertFailsWith<IllegalArgumentException> { AppConfig.fromEnv(mapOf("JWT_SECRET" to "   ")) }
    }

    @Test
    fun jwtSecretMustBeAtLeast32Bytes() {
        assertFailsWith<IllegalArgumentException> { AppConfig.fromEnv(mapOf("JWT_SECRET" to "short")) }
        val config = AppConfig.fromEnv(mapOf("JWT_SECRET" to strongSecret))
        assertEquals(strongSecret, config.jwtSecret)
    }

    @Test
    fun maxMembersDefaultsToTwentyAndReadsTheEnv() {
        assertEquals(20, AppConfig.fromEnv(mapOf("JWT_SECRET" to strongSecret)).maxMembersPerBoard)
        assertEquals(
            5,
            AppConfig.fromEnv(mapOf("JWT_SECRET" to strongSecret, "MAX_MEMBERS_PER_BOARD" to "5")).maxMembersPerBoard,
        )
    }

    @Test
    fun fileLimitsDefaultAndReadTheEnv() {
        val defaults = AppConfig.fromEnv(mapOf("JWT_SECRET" to strongSecret))
        assertEquals(20L * 1024 * 1024, defaults.maxFileBytes)
        assertEquals(500L * 1024 * 1024, defaults.maxBoardFileBytes)

        val overridden = AppConfig.fromEnv(
            mapOf(
                "JWT_SECRET" to strongSecret,
                "MAX_FILE_BYTES" to "1024",
                "MAX_BOARD_FILE_BYTES" to "2048",
            ),
        )
        assertEquals(1024L, overridden.maxFileBytes)
        assertEquals(2048L, overridden.maxBoardFileBytes)
    }

    @Test
    fun syncUrlIsUnsetByDefault() {
        val config = AppConfig.fromEnv(mapOf("JWT_SECRET" to strongSecret))
        assertTrue(config.syncInternalUrl.isNullOrBlank())
    }

    @Test
    fun syncInternalSecretIsReadFromEnv() {
        val config = AppConfig.fromEnv(
            mapOf("JWT_SECRET" to strongSecret, "SYNC_INTERNAL_SECRET" to "internal-secret"),
        )
        assertEquals("internal-secret", config.syncInternalSecret)
    }

    /**
     * [P1] A control URL without the shared secret means every revoke/kick is
     * rejected 401. Refuse to boot rather than fail open.
     */
    @Test
    fun syncSecretIsRequiredWhenUrlIsSet() {
        assertFailsWith<IllegalArgumentException> {
            AppConfig.fromEnv(mapOf("JWT_SECRET" to strongSecret, "SYNC_INTERNAL_URL" to "http://sync:1235"))
        }
        val config = AppConfig.fromEnv(
            mapOf(
                "JWT_SECRET" to strongSecret,
                "SYNC_INTERNAL_URL" to "http://sync:1235",
                "SYNC_INTERNAL_SECRET" to "internal-secret",
            ),
        )
        assertEquals("http://sync:1235", config.syncInternalUrl)
        assertEquals("internal-secret", config.syncInternalSecret)
    }
}
