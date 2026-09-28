package com.moss.server

import org.flywaydb.core.Flyway
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * n5 review: the sync server must not create the `documents` table at runtime;
 * n4's Flyway `V3__documents.sql` owns it (V1·V2 stay frozen).
 */
class DocumentsMigrationTest {

    @Test
    fun flywayCreatesTheDocumentsTable() {
        val columns = mutableListOf<String>()
        TestDb.dataSource.connection.use { connection ->
            connection.prepareStatement(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'documents' ORDER BY column_name",
            ).executeQuery().use { rows ->
                while (rows.next()) columns += rows.getString(1)
            }
        }
        assertEquals(listOf("data", "name", "updated_at"), columns)
    }

    /**
     * [P0] Upgrade path: every environment that ran the prior n5 build already has
     * a `documents` table (created by the removed runtime `create table`). V3 must
     * be idempotent, or Flyway aborts startup with "relation already exists".
     */
    @Test
    fun flywayPassesWhenDocumentsTableAlreadyExists() {
        val dataSource = TestDb.postgres.postgresDatabase
        val schema = "upgrade_${System.nanoTime()}"
        dataSource.connection.use { connection ->
            connection.createStatement().execute("create schema \"$schema\"")
        }
        try {
            // Simulate the prior n5 build: V1·V2 applied, then sync created `documents`.
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                .target("2").load().migrate()
            dataSource.connection.use { connection ->
                connection.createStatement().execute("set search_path to \"$schema\"")
                connection.createStatement().execute(
                    "create table documents (name text primary key, data bytea not null, updated_at bigint not null)",
                )
            }
            // Must not throw: V3 uses `create table if not exists`.
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load().migrate()
            dataSource.connection.use { connection ->
                connection.createStatement().execute("set search_path to \"$schema\"")
                connection.createStatement().executeQuery("select count(*) from documents").use { rows ->
                    rows.next()
                    assertEquals(0, rows.getInt(1))
                }
            }
        } finally {
            dataSource.connection.use { connection ->
                connection.createStatement().execute("drop schema if exists \"$schema\" cascade")
            }
        }
    }
}
