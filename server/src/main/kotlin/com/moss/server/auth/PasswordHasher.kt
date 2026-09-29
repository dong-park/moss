package com.moss.server.auth

import at.favre.lib.crypto.bcrypt.BCrypt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * D3: bcrypt cost 12. 순수 자바라 추가 네이티브 의존이 없다.
 *
 * bcrypt는 수백 ms CPU를 잡으므로 라우트 코루틴(Netty 워커)에서 그대로 돌리지 않고
 * [Dispatchers.Default]로 옮긴다. 그래야 워커가 다른 요청을 받는 동안 해시가 진행된다.
 *
 * [dummyHash]는 D6의 시간 맞춤용으로 서버 시작 때 [warmUp]으로 미리 계산된다. 이게 없으면
 * 첫 없는-메일 로그인이 더미 해시 계산과 비교로 bcrypt를 두 번 돌린다.
 */
object PasswordHasher {
    private const val COST = 12
    private val hasher = BCrypt.withDefaults()
    private val verifier = BCrypt.verifyer()
    private val dummyHash: String = hasher.hashToString(COST, "moss-dummy-password".toCharArray())

    suspend fun hash(password: String): String =
        withContext(Dispatchers.Default) { hasher.hashToString(COST, password.toCharArray()) }

    suspend fun verify(password: String, hash: String): Boolean =
        withContext(Dispatchers.Default) { verifier.verify(password.toCharArray(), hash).verified }

    /** D6: 없는 메일에 쓸 가짜 해시와 비교 — 반환값은 항상 false. */
    suspend fun wasteTime(password: String) {
        verify(password, dummyHash)
    }

    /** 서버 시작 때 호출해 [dummyHash] 초기화(첫 요청 bcrypt 2회)를 앞당긴다. */
    fun warmUp() {
        check(dummyHash.isNotEmpty())
    }
}
