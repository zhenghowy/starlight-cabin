package io.github.zhenghowy.starlightcabin

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class CabinSync(private val context: Context, private val store: CabinStore) {
    private val http = CabinHttp(BuildConfig.CABIN_ORIGIN)

    fun importLegacyCookieIfNeeded() {
        if (store.hasActiveUser()) return
        val raw = try {
            CookieManager.getInstance().getCookie(BuildConfig.CABIN_ORIGIN)
        } catch (_: Exception) {
            null
        } ?: return
        val sid = raw.split(';').map { it.trim() }.firstOrNull { it.startsWith("sid=") }?.removePrefix("sid=")
        if (sid.isNullOrBlank()) return
        try {
            val me = http.get("/api/me", sid)
            val state = http.get("/api/state", sid)
            if (me.status != 200 || state.status != 200) return
            val user = me.body.getJSONObject("user")
            val camp = state.body.getJSONObject("store")
            store.importFresh(user.getString("id"), user.getString("username"), camp.toString(), sid, System.currentTimeMillis())
        } catch (_: Exception) {
            // 旧登录取不回来也不删任何本机记录。
        }
    }

    fun catchUpIfDue() {
        if (!SyncSchedule.shouldAutoSync(store.lastSyncAt(), System.currentTimeMillis(), hasNetwork(context), store.hasActiveUser())) return
        val request = OneTimeWorkRequestBuilder<CabinSyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork("cabin-sync-catchup", ExistingWorkPolicy.KEEP, request)
    }

    fun ensurePeriodic() {
        val request = PeriodicWorkRequestBuilder<CabinSyncWorker>(7, TimeUnit.DAYS)
            .setInitialDelay(7, TimeUnit.DAYS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "cabin-sync",
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    fun login(username: String, password: String, register: Boolean): JSONObject {
        val path = if (register) "/api/register" else "/api/login"
        val result = try {
            http.post(path, JSONObject().put("username", username).put("password", password), null)
        } catch (_: IOException) {
            return error("森林暂时连不上，本机记录还在", 0)
        }
        if (result.status != 200 && result.status != 201) {
            return error(result.body.optString("error", "账号或密码不对"), result.status)
        }
        val sid = result.sid ?: return error("没有拿到登录凭证", 500)
        val user = result.body.optJSONObject("user") ?: return error("没有拿到登录凭证", 500)
        val camp = result.body.optJSONObject("store") ?: return error("没有拿到营地", 500)
        store.importFresh(user.getString("id"), user.getString("username"), camp.toString(), sid, System.currentTimeMillis())
        // 登录这一次把本机待同步记录交出去，并取回排行快照。之后打开页面不再等服务器。
        perform(manual = true)
        return JSONObject().put("ok", true)
    }

    fun perform(manual: Boolean): JSONObject {
        if (!store.hasActiveUser()) return error("请先登录", 401)
        if (!manual && !SyncSchedule.shouldAutoSync(store.lastSyncAt(), System.currentTimeMillis(), true, true)) {
            return JSONObject().put("ok", true).put("skipped", true)
        }
        if (!hasNetwork(context)) {
            if (!manual) return JSONObject().put("ok", true).put("skipped", true)
            return error("现在没有网络，记录还在手机里", 0)
        }
        val sid = store.token() ?: return error("需要重新登录才能同步，本机记录还在", 401).also {
            store.rememberError("需要重新登录才能同步，本机记录还在", true)
        }
        val ops = store.pendingOps()
        val result = try {
            http.post("/api/sync", JSONObject().put("ops", ops), sid)
        } catch (_: IOException) {
            store.rememberError("同步没有完成，记录还在手机里", false)
            return error("同步没有完成，记录还在手机里", 0)
        }
        if (result.status == 401) {
            store.rememberError("登录过期了，本机记录还在", true)
            return error("登录过期了，本机记录还在", 401)
        }
        if (result.status != 200) {
            store.rememberError("同步没有完成，记录还在手机里", false)
            return error(result.body.optString("error", "同步没有完成，记录还在手机里"), result.status)
        }
        store.applySyncResult(
            result.body.getJSONObject("store"),
            result.body.optJSONArray("acked") ?: JSONArray(),
            result.body.optJSONArray("conflicts") ?: JSONArray(),
            result.body.optJSONArray("board") ?: JSONArray(),
            System.currentTimeMillis()
        )
        return JSONObject().put("ok", true)
    }

    private fun error(message: String, status: Int) = JSONObject().put("ok", false).put("error", message).put("status", status)

    companion object {
        fun hasNetwork(context: Context): Boolean {
            val manager = context.getSystemService(ConnectivityManager::class.java) ?: return false
            val network = manager.activeNetwork ?: return false
            val caps = manager.getNetworkCapabilities(network) ?: return false
            return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        }
    }
}

class CabinSyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        CabinSync(applicationContext, CabinStore(applicationContext)).perform(manual = false)
        return Result.success()
    }
}

class CabinHttp(private val origin: String) {
    fun get(path: String, sid: String?): HttpResult = exchange("GET", path, null, sid)

    fun post(path: String, body: JSONObject, sid: String?): HttpResult = exchange("POST", path, body.toString(), sid)

    private fun exchange(method: String, path: String, body: String?, sid: String?): HttpResult {
        val conn = (URL(origin + path).openConnection() as HttpURLConnection)
        conn.requestMethod = method
        conn.connectTimeout = 15_000
        conn.readTimeout = 20_000
        conn.instanceFollowRedirects = false
        conn.setRequestProperty("Accept", "application/json")
        if (sid != null) conn.setRequestProperty("Cookie", "sid=$sid")
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val status = conn.responseCode
        val text = (if (status in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: "{}"
        val json = try {
            JSONObject(text)
        } catch (_: Exception) {
            JSONObject()
        }
        return HttpResult(status, json, cookie(conn))
    }

    private fun cookie(conn: HttpURLConnection): String? {
        val headers = conn.headerFields["Set-Cookie"] ?: conn.headerFields["set-cookie"]
        if (headers != null) {
            for (header in headers) {
                val part = header.split(';').map { it.trim() }.firstOrNull { it.startsWith("sid=") } ?: continue
                return part.removePrefix("sid=")
            }
        }
        return try {
            val raw = CookieManager.getInstance().getCookie(origin) ?: return null
            raw.split(';').map { it.trim() }.firstOrNull { it.startsWith("sid=") }?.removePrefix("sid=")
        } catch (_: Exception) {
            null
        }
    }
}

data class HttpResult(val status: Int, val body: JSONObject, val sid: String?)

class CabinBridge(private val context: Context, private val sync: CabinSync, private val store: CabinStore) {
    @JavascriptInterface
    fun bootstrap(): String = store.bootstrap().toString()

    @JavascriptInterface
    fun meta(): String = store.meta().toString()

    @JavascriptInterface
    fun login(username: String, password: String): String = sync.login(username, password, register = false).toString()

    @JavascriptInterface
    fun register(username: String, password: String): String = sync.login(username, password, register = true).toString()

    @JavascriptInterface
    fun logout(): String = store.logout().toString()

    @JavascriptInterface
    fun commit(payload: String): String = try {
        val json = JSONObject(payload)
        store.commit(json.getJSONObject("op"), json.getJSONObject("store")).toString()
    } catch (_: Exception) {
        JSONObject().put("ok", false).put("error", "没有记下这条").put("status", 400).toString()
    }

    @JavascriptInterface
    fun replaceSnapshot(storeJson: String): String {
        store.replaceSnapshot(storeJson)
        return JSONObject().put("ok", true).toString()
    }

    @JavascriptInterface
    fun markConflict(id: String, message: String): String {
        store.markConflict(id, message)
        return JSONObject().put("ok", true).toString()
    }

    @JavascriptInterface
    fun syncNow(): String = sync.perform(manual = true).toString()

    @JavascriptInterface
    fun exportBackup(): String = BackupExporter(context, store).share()

    @JavascriptInterface
    fun debugSetLastSync(daysAgo: Int): String {
        if (!BuildConfig.DEBUG) return JSONObject().put("ok", false).toString()
        store.debugSetLastSync(daysAgo)
        return JSONObject().put("ok", true).toString()
    }
}
