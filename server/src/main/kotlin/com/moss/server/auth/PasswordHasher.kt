package com.moss.server.auth

import at.favre.lib.crypto.bcrypt.BCrypt

/**
 * D3: bcrypt cost 12. 순수 자바라 추가 네이티브 의존이 없다.
 *
 * [dummyHash]는 D6의 시간 맞춤용으로 클래스가 처음 쓰일 때 한 번 계산된다. 없는 메일의
 * 로그인도 이 해시와 비교해 응답 시간을 실제 계정과 같게 유지한다.
 */
object PasswordHasher {
    private const val COST = 12
    private val hasher = BCrypt.withDefaults()
    private val verifier = BCrypt.verifyer()
    private val dummyHash: String = hasher.hashToString(COST, "moss-dummy-password".toCharArray())

    fun hash(password: String): String = hasher.hashToString(COST, password.toCharArray())

    fun verify(password: String, hash: String): Boolean =
        verifier.verify(password.toCharArray(), hash).verified

    /** D6: 없는 메일에 쓸 가짜 해시와 비교 — 반환값은 항상 false. */
    fun wasteTime(password: String) {
        verify(password, dummyHash)
    }
}
