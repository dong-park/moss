package com.moss.server

import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.runBlocking
import java.net.InetSocketAddress
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

class SyncCloseClientTest {

    @Test
    fun nullOrBlankUrlIsANoOp() = runBlocking {
        SyncCloseClient(null).closeBoard(newBoardId())
        SyncCloseClient("").closeBoard(newBoardId(), UUID.randomUUID())
        SyncCloseClient("   ").closeBoard(newBoardId())
    }

    @Test
    fun unreachableUrlIsBestEffortAndNeverThrows() = runBlocking {
        // Port 1 is closed: the hook must swallow the failure (warn only), not crash the request.
        SyncCloseClient("http://127.0.0.1:1").closeBoard(newBoardId(), UUID.randomUUID())
    }

    @Test
    fun unauthorizedResponseIsHandledWithoutThrowing() = runBlocking {
        // [P1] A 401 is logged at error (secret mismatch), but the hook stays
        // best-effort: it must not crash the revoke request.
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            exchange.sendResponseHeaders(401, -1)
            exchange.close()
        }
        server.start()
        try {
            val base = "http://127.0.0.1:${server.address.port}"
            SyncCloseClient(base, "wrong-secret").closeBoard(newBoardId())
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun sendsTheInternalSecretHeader() = runBlocking {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        var secret: String? = null
        var method: String? = null
        server.createContext("/") { exchange ->
            secret = exchange.requestHeaders.getFirst("X-Moss-Internal")
            method = exchange.requestMethod
            exchange.sendResponseHeaders(204, -1)
            exchange.close()
        }
        server.start()
        try {
            val base = "http://127.0.0.1:${server.address.port}"
            SyncCloseClient(base, "shared-secret").closeBoard(newBoardId())
            assertEquals("POST", method)
            assertEquals("shared-secret", secret)
        } finally {
            server.stop(0)
        }
    }
}
