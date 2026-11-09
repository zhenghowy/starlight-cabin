package io.github.zhenghowy.starlightcabin

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import org.json.JSONArray
import org.json.JSONObject

class CabinStore(context: Context) : SQLiteOpenHelper(context.applicationContext, "cabin.db", null, 1) {
    private val secrets = CabinSecrets(context.applicationContext)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE account (
              user_id TEXT PRIMARY KEY,
              username TEXT NOT NULL,
              store_json TEXT NOT NULL,
              active INTEGER NOT NULL,
              needs_replay INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE outbox (
              op_id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              body TEXT NOT NULL,
              status TEXT NOT NULL,
              error TEXT NOT NULL DEFAULT '',
              created_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE meta (
              user_id TEXT PRIMARY KEY,
              last_sync_at INTEGER NOT NULL DEFAULT 0,
              last_error TEXT NOT NULL DEFAULT '',
              auth_expired INTEGER NOT NULL DEFAULT 0,
              board_json TEXT NOT NULL DEFAULT ''
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun bootstrap(): JSONObject = synchronized(LOCK) {
        val user = activeUser() ?: return@synchronized JSONObject().put("ok", true).put("user", JSONObject.NULL)
        val pending = ops(user.id, "pending")
        val conflicts = ops(user.id, "conflict")
        JSONObject()
            .put("ok", true)
            .put("user", JSONObject().put("id", user.id).put("username", user.username))
            .put("store", JSONObject(user.store))
            .put("pending", pending)
            .put("conflicts", conflicts)
            .put("needsReplay", user.needsReplay)
            .put("lastSyncAt", metaLong(user.id, "last_sync_at"))
            .put("lastError", metaString(user.id, "last_error"))
            .put("authExpired", metaLong(user.id, "auth_expired") == 1L)
            .put("board", board(user.id))
            .put("boardAt", metaLong(user.id, "last_sync_at"))
    }

    fun meta(): JSONObject = synchronized(LOCK) {
        val user = activeUser()
        if (user == null) return@synchronized JSONObject().put("ok", true).put("pending", 0).put("conflicts", JSONArray())
        val conflicts = ops(user.id, "conflict")
        JSONObject()
            .put("ok", true)
            .put("pending", count(user.id, "pending"))
            .put("conflicts", conflicts)
            .put("lastSyncAt", metaLong(user.id, "last_sync_at"))
            .put("lastError", metaString(user.id, "last_error"))
            .put("authExpired", metaLong(user.id, "auth_expired") == 1L)
            .put("boardAt", metaLong(user.id, "last_sync_at"))
            .put("board", board(user.id))
    }

    fun hasActiveUser(): Boolean = synchronized(LOCK) { activeUser() != null }

    fun importFresh(userId: String, username: String, storeJson: String, token: String, now: Long) = synchronized(LOCK) {
        val existingPending = count(userId, "pending")
        writableDatabase.execSQL("UPDATE account SET active=0")
        if (existingPending == 0) {
            writableDatabase.execSQL("DELETE FROM account WHERE user_id=?", arrayOf(userId))
            writableDatabase.execSQL(
                "INSERT INTO account(user_id, username, store_json, active, needs_replay) VALUES(?, ?, ?, 1, 0)",
                arrayOf(userId, username, storeJson)
            )
            writeMeta(userId, now, "", 0, metaString(userId, "board_json"))
        } else {
            writableDatabase.execSQL(
                "UPDATE account SET username=?, active=1 WHERE user_id=?",
                arrayOf(username, userId)
            )
            writableDatabase.execSQL(
                "UPDATE meta SET auth_expired=0, last_error='' WHERE user_id=?",
                arrayOf(userId)
            )
        }
        secrets.put(userId, token)
    }

    fun logout() = synchronized(LOCK) {
        val user = activeUser() ?: return@synchronized JSONObject().put("ok", true).put("pending", 0)
        secrets.clear(user.id)
        writableDatabase.execSQL("UPDATE account SET active=0 WHERE user_id=?", arrayOf(user.id))
        JSONObject().put("ok", true).put("pending", count(user.id, "pending"))
    }

    fun commit(op: JSONObject, store: JSONObject): JSONObject = synchronized(LOCK) {
        val user = activeUser() ?: return@synchronized error("请先登录", 401)
        val id = op.optString("id")
        if (id.isBlank()) return@synchronized error("这条记录没有编号", 400)
        writableDatabase.execSQL(
            "INSERT OR IGNORE INTO outbox(op_id, user_id, body, status, error, created_at) VALUES(?, ?, ?, 'pending', '', ?)",
            arrayOf(id, user.id, op.toString(), System.currentTimeMillis())
        )
        writableDatabase.execSQL(
            "UPDATE account SET store_json=?, needs_replay=0 WHERE user_id=?",
            arrayOf(store.toString(), user.id)
        )
        JSONObject().put("ok", true)
    }

    fun replaceSnapshot(storeJson: String) = synchronized(LOCK) {
        val user = activeUser() ?: return@synchronized
        writableDatabase.execSQL(
            "UPDATE account SET store_json=?, needs_replay=0 WHERE user_id=?",
            arrayOf(storeJson, user.id)
        )
    }

    fun markConflict(id: String, message: String) = synchronized(LOCK) {
        writableDatabase.execSQL(
            "UPDATE outbox SET status='conflict', error=? WHERE op_id=?",
            arrayOf(message, id)
        )
    }

    fun token(): String? = synchronized(LOCK) {
        val user = activeUser() ?: return@synchronized null
        secrets.get(user.id)
    }

    fun pendingOps(): JSONArray = synchronized(LOCK) {
        val user = activeUser() ?: return@synchronized JSONArray()
        ops(user.id, "pending")
    }

    fun applySyncResult(store: JSONObject, acked: JSONArray, conflicts: JSONArray, board: JSONArray, now: Long) = synchronized(LOCK) {
        val user = activeUser() ?: return@synchronized
        for (i in 0 until acked.length()) {
            writableDatabase.execSQL("DELETE FROM outbox WHERE op_id=? AND user_id=?", arrayOf(acked.getString(i), user.id))
        }
        for (i in 0 until conflicts.length()) {
            val item = conflicts.getJSONObject(i)
            markConflict(item.optString("id"), item.optString("message"))
        }
        val pendingLeft = count(user.id, "pending")
        writableDatabase.execSQL(
            "UPDATE account SET store_json=?, needs_replay=? WHERE user_id=?",
            arrayOf(store.toString(), if (pendingLeft > 0) 1 else 0, user.id)
        )
        writeMeta(user.id, now, "", 0, board.toString())
    }

    fun rememberError(message: String, authExpired: Boolean) = synchronized(LOCK) {
        val user = activeUser() ?: return@synchronized
        val previous = metaLong(user.id, "last_sync_at")
        writeMeta(user.id, previous, message, if (authExpired) 1 else 0, metaString(user.id, "board_json"))
    }

    fun exportJson(): JSONObject = synchronized(LOCK) {
        val user = activeUser() ?: return@synchronized JSONObject().put("ok", false).put("error", "还没有营地")
        JSONObject()
            .put("ok", true)
            .put("user", JSONObject().put("id", user.id).put("username", user.username))
            .put("store", JSONObject(user.store))
            .put("pending", ops(user.id, "pending"))
            .put("conflicts", ops(user.id, "conflict"))
            .put("exportedAt", System.currentTimeMillis())
    }

    fun activeUserId(): String? = synchronized(LOCK) { activeUser()?.id }

    fun lastSyncAt(): Long? = synchronized(LOCK) {
        val user = activeUser() ?: return@synchronized null
        val value = metaLong(user.id, "last_sync_at")
        if (value <= 0L) null else value
    }

    fun debugSetLastSync(daysAgo: Int) = synchronized(LOCK) {
        val user = activeUser() ?: return@synchronized
        val whenAt = System.currentTimeMillis() - daysAgo.toLong() * 24 * 60 * 60 * 1000
        writableDatabase.execSQL("UPDATE meta SET last_sync_at=? WHERE user_id=?", arrayOf(whenAt, user.id))
    }

    private fun activeUser(): LocalUser? {
        val cursor = readableDatabase.rawQuery(
            "SELECT user_id, username, store_json, needs_replay FROM account WHERE active=1 LIMIT 1",
            null
        )
        cursor.use {
            if (!it.moveToFirst()) return null
            return LocalUser(it.getString(0), it.getString(1), it.getString(2), it.getInt(3) == 1)
        }
    }

    private fun ops(userId: String, status: String): JSONArray {
        val cursor = readableDatabase.rawQuery(
            "SELECT body, error FROM outbox WHERE user_id=? AND status=? ORDER BY created_at ASC",
            arrayOf(userId, status)
        )
        val array = JSONArray()
        cursor.use {
            while (it.moveToNext()) {
                val body = JSONObject(it.getString(0))
                if (status == "conflict") body.put("error", it.getString(1))
                array.put(body)
            }
        }
        return array
    }

    private fun count(userId: String, status: String): Int {
        val cursor = readableDatabase.rawQuery(
            "SELECT COUNT(*) FROM outbox WHERE user_id=? AND status=?",
            arrayOf(userId, status)
        )
        cursor.use {
            it.moveToFirst()
            return it.getInt(0)
        }
    }

    private fun metaLong(userId: String, column: String): Long {
        val cursor = readableDatabase.rawQuery("SELECT $column FROM meta WHERE user_id=?", arrayOf(userId))
        cursor.use {
            if (!it.moveToFirst() || it.isNull(0)) return 0L
            return it.getLong(0)
        }
    }

    private fun metaString(userId: String, column: String): String {
        val cursor = readableDatabase.rawQuery("SELECT $column FROM meta WHERE user_id=?", arrayOf(userId))
        cursor.use {
            if (!it.moveToFirst() || it.isNull(0)) return ""
            return it.getString(0)
        }
    }

    private fun board(userId: String): JSONArray {
        val raw = metaString(userId, "board_json")
        if (raw.isBlank()) return JSONArray()
        return JSONArray(raw)
    }

    private fun writeMeta(userId: String, lastSyncAt: Long, lastError: String, authExpired: Int, boardJson: String) {
        writableDatabase.execSQL("DELETE FROM meta WHERE user_id=?", arrayOf(userId))
        writableDatabase.execSQL(
            "INSERT INTO meta(user_id, last_sync_at, last_error, auth_expired, board_json) VALUES(?, ?, ?, ?, ?)",
            arrayOf(userId, lastSyncAt, lastError, authExpired, boardJson)
        )
    }

    private fun error(message: String, status: Int) = JSONObject().put("ok", false).put("error", message).put("status", status)

    private data class LocalUser(val id: String, val username: String, val store: String, val needsReplay: Boolean)

    companion object {
        val LOCK = Any()
    }
}

class CabinSecrets(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        "cabin-sync",
        MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun put(userId: String, token: String) {
        prefs.edit().putString(userId, token).apply()
    }

    fun get(userId: String): String? = prefs.getString(userId, null)

    fun clear(userId: String) {
        prefs.edit().remove(userId).apply()
    }
}
