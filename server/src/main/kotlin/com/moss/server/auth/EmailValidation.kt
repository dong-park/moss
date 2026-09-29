package com.moss.server.auth

import com.moss.server.InvalidRequestException

private val EMAIL_RE = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

/** D2: 앞뒤 공백을 지우고 소문자로. 저장·비교는 항상 이 값을 쓴다. */
fun normalizeEmail(raw: String): String = raw.trim().lowercase()

fun validateEmail(email: String) {
    if (!EMAIL_RE.matches(email)) throw InvalidRequestException("메일 형식이 올바르지 않아요")
}

/** D4: 8자 이상, UTF-8로 72바이트 이하(bcrypt가 72바이트 뒤를 버린다). */
fun validatePassword(password: String) {
    if (password.codePointCount(0, password.length) < 8) {
        throw InvalidRequestException("비밀번호는 8자 이상이어야 해요")
    }
    if (password.toByteArray(Charsets.UTF_8).size > 72) {
        throw InvalidRequestException("비밀번호는 72바이트를 넘을 수 없어요")
    }
}

/** D12: 이름은 1~40자. 앞뒤 공백은 지워 저장한다. */
fun normalizeName(raw: String): String {
    val name = raw.trim()
    if (name.isEmpty()) throw InvalidRequestException("이름을 입력해 주세요")
    if (name.codePointCount(0, name.length) > 40) throw InvalidRequestException("이름은 40자까지 쓸 수 있어요")
    return name
}
