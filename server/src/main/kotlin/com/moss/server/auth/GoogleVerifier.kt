package com.moss.server.auth

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import com.moss.server.GoogleUser
import com.moss.server.GoogleVerificationException
import java.util.Collections

interface GoogleVerifier {
    /** Verifies a Google ID token and returns the identity, or throws [GoogleVerificationException]. */
    fun verify(idToken: String): GoogleUser

    companion object {
        /** Production verifier backed by Google's public keys. Requires a client id. */
        fun google(clientId: String): GoogleVerifier {
            require(clientId.isNotBlank()) { "GOOGLE_CLIENT_ID is required for the production verifier" }
            return GoogleApiVerifier(clientId)
        }

        const val PRODUCTION_PATH_NOTE =
            "Real Google token path is NOT covered by tests: tests inject FakeGoogleVerifier."
    }
}

private class GoogleApiVerifier(clientId: String) : GoogleVerifier {

    private val verifier = GoogleIdTokenVerifier.Builder(NetHttpTransport(), GsonFactory.getDefaultInstance())
        .setAudience(Collections.singletonList(clientId))
        .build()

    override fun verify(idToken: String): GoogleUser {
        val token: GoogleIdToken = try {
            verifier.verify(idToken) ?: throw GoogleVerificationException("구글 토큰을 확인할 수 없어요")
        } catch (e: GoogleVerificationException) {
            throw e
        } catch (e: Exception) {
            throw GoogleVerificationException("구글 토큰이 유효하지 않아요")
        }
        val payload = token.payload
        val sub = payload.subject ?: throw GoogleVerificationException("구글 토큰에 sub가 없어요")
        val name = (payload["name"] as? String)?.takeIf { it.isNotBlank() } ?: "이름 없음"
        val avatar = payload["picture"] as? String
        return GoogleUser(sub, name, avatar)
    }
}
