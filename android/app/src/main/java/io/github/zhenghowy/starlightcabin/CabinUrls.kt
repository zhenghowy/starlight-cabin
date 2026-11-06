package io.github.zhenghowy.starlightcabin

import java.net.URI
import java.util.Locale

/**
 * 手机壳只打开线上那一间小屋。账号和存档仍在原来的 HTTPS 服务里。
 */
object CabinUrls {
    const val HOST = "starlight-cabin-howy.fly.dev"
    const val ORIGIN = "https://$HOST"
    const val START_URL = "$ORIGIN/"

    enum class BackAction {
        GO_BACK_IN_PAGE,
        LEAVE_APP
    }

    fun decideBack(canGoBack: Boolean): BackAction {
        return if (canGoBack) BackAction.GO_BACK_IN_PAGE else BackAction.LEAVE_APP
    }

    fun isInAppUrl(raw: String?): Boolean {
        val uri = parseWebUri(raw) ?: return false
        if (uri.scheme != "https") return false
        if (uri.userInfo != null) return false
        val host = uri.host?.lowercase(Locale.US) ?: return false
        if (host != HOST) return false
        return uri.port == -1 || uri.port == 443
    }

    fun isExternalWebUrl(raw: String?): Boolean {
        if (isInAppUrl(raw)) return false
        val uri = parseWebUri(raw) ?: return false
        if (uri.scheme != "https" && uri.scheme != "http") return false
        if (uri.userInfo != null) return false
        return !uri.host.isNullOrEmpty()
    }

    private fun parseWebUri(raw: String?): URI? {
        if (raw.isNullOrBlank()) return null
        val value = raw.trim()
        if (value.length > 2048) return null
        if (value.any { it <= ' ' || it == '\\' || it.code == 0x7f }) return null
        return try {
            val uri = URI(value)
            if (!uri.isAbsolute || uri.isOpaque) null else uri
        } catch (_: Exception) {
            null
        }
    }
}
