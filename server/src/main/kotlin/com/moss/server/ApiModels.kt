package com.moss.server

import com.moss.server.boards.FileRow
import com.moss.server.boards.MemberBoard
import com.moss.server.boards.MemberUser
import com.moss.server.boards.UserRow
import kotlinx.serialization.Serializable

@Serializable
data class UserDto(val id: String, val name: String, val avatar: String? = null)

/** n9: 팝오버 멤버 목록 — 계정 이름·아바타와 보드 역할. */
@Serializable
data class MemberDto(val id: String, val name: String, val avatar: String? = null, val role: String)

@Serializable
data class AuthResponse(val accessToken: String, val refreshToken: String, val user: UserDto)

@Serializable
data class BoardDto(val id: String, val name: String, val role: String, val ownerName: String)

@Serializable
data class FileDto(val id: String, val name: String, val size: Long, val contentType: String? = null)

@Serializable
data class InviteResponse(val inviteToken: String)

@Serializable
data class BoardTokenResponse(val boardToken: String, val expiresInSeconds: Long)

@Serializable
data class HealthResponse(val status: String)

@Serializable
data class ErrorResponse(val error: String, val message: String)

@Serializable
data class GoogleLoginRequest(val idToken: String)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class EmailSignupRequest(val email: String, val password: String, val name: String)

@Serializable
data class EmailLoginRequest(val email: String, val password: String)

@Serializable
data class ShareRequest(val name: String)

@Serializable
data class AcceptInviteRequest(val token: String)

@Serializable
data class InvitePreviewRequest(val token: String)

@Serializable
data class InvitePreviewResponse(val boardName: String, val ownerName: String)

fun UserRow.toDto() = UserDto(id.toString(), name, avatar)

fun MemberBoard.toDto() = BoardDto(id.toString(), name, role, ownerName)

fun MemberUser.toDto() = MemberDto(id.toString(), name, avatar, role)

fun FileRow.toDto() = FileDto(id.toString(), name, size, contentType)
