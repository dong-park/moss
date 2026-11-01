package com.moss.server

import io.ktor.http.HttpStatusCode

/**
 * Base for expected API failures. StatusPages turns these into a JSON [ErrorResponse]
 * with the HTTP [status] and a stable [code].
 */
sealed class ApiFailure(
    val status: HttpStatusCode,
    val code: String,
    message: String,
) : RuntimeException(message)

class UnauthorizedException(message: String = "인증이 필요해요") :
    ApiFailure(HttpStatusCode.Unauthorized, "unauthorized", message)

class ForbiddenException(message: String = "권한이 없어요") :
    ApiFailure(HttpStatusCode.Forbidden, "forbidden", message)

class NotFoundException(message: String = "찾을 수 없어요") :
    ApiFailure(HttpStatusCode.NotFound, "not_found", message)

class GoneException(message: String = "만료됐어요") :
    ApiFailure(HttpStatusCode.Gone, "gone", message)

class ConflictException(message: String) :
    ApiFailure(HttpStatusCode.Conflict, "conflict", message)

class InvalidRequestException(message: String) :
    ApiFailure(HttpStatusCode.BadRequest, "bad_request", message)

class PayloadTooLargeException(message: String) :
    ApiFailure(HttpStatusCode.PayloadTooLarge, "too_large", message)

/**
 * 사용자당 저장 상한(보드 수·첨부 합계)을 넘었다. 403은 웹이 "로그인이 풀렸다"로 읽으므로
 * 413을 쓰고, 코드로 파일 크기 초과(too_large)와 구분한다.
 */
class QuotaExceededException(message: String) :
    ApiFailure(HttpStatusCode.PayloadTooLarge, "quota_exceeded", message)

/** 신규가입이 닫혀 있다(정책 버전 미설정, 상한 도달). 기존 로그인은 영향 없다. 503. */
class SignupClosedException(message: String, code: String = "signup_closed") :
    ApiFailure(HttpStatusCode.ServiceUnavailable, code, message)

/** 신규가입에 약관 동의가 없거나 버전이 맞지 않다. 웹은 동의를 받아 다시 요청한다. 400. */
class ConsentRequiredException(message: String) :
    ApiFailure(HttpStatusCode.BadRequest, "consent_required", message)

/** Raised by a [GoogleVerifier] when an ID token cannot be trusted. */
class GoogleVerificationException(message: String) : RuntimeException(message)
