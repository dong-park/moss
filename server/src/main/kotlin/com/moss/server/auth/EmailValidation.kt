package com.moss.server.auth

import com.moss.server.InvalidRequestException

private val EMAIL_RE = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

/** RFC 5321 상한. 이보다 긴 메일은 btree 인덱스 한도도 넘겨 500을 낸다. */
const val EMAIL_MAX_LENGTH = 254

/** 로그인 비밀번호 상한. 가입 정책(8자·72바이트)과 달리 옛 계정도 막히지 않게 넉넉히 둔다. */
private const val LOGIN_PASSWORD_MAX_BYTES = 1024

/** D2: 앞뒤 공백을 지우고 소문자로. 저장·비교는 항상 이 값을 쓴다. */
fun normalizeEmail(raw: String): String = raw.trim().lowercase()

/** 레이트 리밋 키용 — 저장 전에 길이를 잘라 키가 무한정 커지거나 btree 한도를 건드리지 않게 한다. */
fun rateLimitEmail(raw: String): String = normalizeEmail(raw).take(EMAIL_MAX_LENGTH)

fun validateEmail(email: String) {
    if (email.codePointCount(0, email.length) > EMAIL_MAX_LENGTH) {
        throw InvalidRequestException("메일이 너무 길어요")
    }
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

/**
 * 로그인 비밀번호는 가입 정책(8자·72바이트)을 적용하지 않는다. 정책이 바뀌면 옛 계정이
 * 못 들어온다. 빈 값과 과도한 길이만 막고, 틀리면 [validateEmail]을 통과한 뒤 401로 답한다.
 */
fun validateLoginPassword(password: String) {
    if (password.isEmpty()) throw InvalidRequestException("비밀번호를 입력해 주세요")
    if (password.toByteArray(Charsets.UTF_8).size > LOGIN_PASSWORD_MAX_BYTES) {
        throw InvalidRequestException("비밀번호가 너무 길어요")
    }
}

/** D12: 이름은 1~40자. 앞뒤 공백은 지워 저장한다. */
fun normalizeName(raw: String): String {
    val name = raw.trim()
    if (name.isEmpty()) throw InvalidRequestException("이름을 입력해 주세요")
    if (name.codePointCount(0, name.length) > 40) throw InvalidRequestException("이름은 40자까지 쓸 수 있어요")
    return name
}
