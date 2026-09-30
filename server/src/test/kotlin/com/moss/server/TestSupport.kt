package com.moss.server

import com.moss.server.auth.GoogleVerifier
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.delete
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import kotlinx.serialization.json.Json
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import java.nio.file.Path
import javax.sql.DataSource

/** One embedded Postgres for the whole test JVM, migrated once with Flyway. */
object TestDb {
    val postgres: EmbeddedPostgres by lazy {
        EmbeddedPostgres.builder().start().also {
            Runtime.getRuntime().addShutdownHook(Thread { runCatching { it.close() } })
        }
    }
    val dataSource: DataSource by lazy {
        postgres.postgresDatabase.also { ds ->
            Flyway.configure().dataSource(ds).load().migrate()
            org.jetbrains.exposed.sql.Database.connect(ds)
        }
    }
}

class FakeGoogleVerifier : GoogleVerifier {
    private val users = mutableMapOf<String, GoogleUser>()

    fun register(idToken: String, sub: String, name: String, avatar: String? = null): FakeGoogleVerifier {
        users[idToken] = GoogleUser(sub, name, avatar)
        return this
    }

    override fun verify(idToken: String): GoogleUser =
        users[idToken] ?: throw GoogleVerificationException("unknown test token")
}

abstract class ApiTest {

    protected val google = FakeGoogleVerifier()
    protected val filesDir: Path = java.nio.file.Files.createTempDirectory("moss-files-test")
    protected val config = AppConfig(jwtSecret = "test-secret", filesDir = filesDir.toString())

    init {
        // Make sure the shared database is up before any test runs.
        TestDb.dataSource
    }

    @AfterEach
    fun cleanFiles() {
        filesDir.toFile().deleteRecursively()
        java.nio.file.Files.createDirectories(filesDir)
    }

    @BeforeEach
    fun resetDatabase() {
        transaction {
            Members.deleteAll()
            Invites.deleteAll()
            Files.deleteAll()
            Boards.deleteAll()
            Users.deleteAll()
        }
    }

    protected fun app(block: suspend ApplicationTestBuilder.() -> Unit) = testApplication {
        application { mossModule(config, google, TestDb.dataSource) }
        block()
    }

    protected suspend fun ApplicationTestBuilder.client(): HttpClient = createClient {
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    }

    protected suspend fun ApplicationTestBuilder.login(idToken: String): AuthResponse {
        val client = client()
        val response = client.post("/auth/google") {
            contentType(ContentType.Application.Json)
            setBody(GoogleLoginRequest(idToken))
        }
        check(response.status == HttpStatusCode.OK) { "login failed: ${response.status}" }
        return response.body()
    }

    protected suspend fun HttpClient.authed(
        path: String,
        accessToken: String,
        body: Any? = null,
    ): HttpResponse = post(path) {
        header(HttpHeaders.Authorization, "Bearer $accessToken")
        if (body != null) {
            contentType(ContentType.Application.Json)
            setBody(body)
        }
    }

    protected suspend fun HttpClient.authedGet(path: String, accessToken: String): HttpResponse =
        get(path) { header(HttpHeaders.Authorization, "Bearer $accessToken") }

    protected suspend fun HttpClient.authedDelete(path: String, accessToken: String): HttpResponse =
        delete(path) { header(HttpHeaders.Authorization, "Bearer $accessToken") }

    protected suspend fun HttpClient.uploadFile(
        path: String,
        accessToken: String,
        fileName: String,
        bytes: ByteArray,
        contentType: String = "application/octet-stream",
    ): HttpResponse = submitFormWithBinaryData(
        path,
        formData {
            append(
                "file",
                bytes,
                Headers.build {
                    append(HttpHeaders.ContentType, contentType)
                    append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
                },
            )
        },
    ) {
        header(HttpHeaders.Authorization, "Bearer $accessToken")
    }

    /** Two "file" parts in one multipart body; the server must reject the second. */
    protected suspend fun HttpClient.uploadTwoFiles(
        path: String,
        accessToken: String,
        firstName: String,
        secondName: String,
        bytes: ByteArray,
        contentType: String = "application/octet-stream",
    ): HttpResponse = submitFormWithBinaryData(
        path,
        formData {
            for (fileName in listOf(firstName, secondName)) {
                append(
                    "file",
                    bytes,
                    Headers.build {
                        append(HttpHeaders.ContentType, contentType)
                        append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
                    },
                )
            }
        },
    ) {
        header(HttpHeaders.Authorization, "Bearer $accessToken")
    }
}

/** A web-style local board id (`b-…`), the shape the client actually shares. */
fun newBoardId(): String = "b-" + java.util.UUID.randomUUID().toString().take(8)
