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

/** Raised by a [GoogleVerifier] when an ID token cannot be trusted. */
class GoogleVerificationException(message: String) : RuntimeException(message)
