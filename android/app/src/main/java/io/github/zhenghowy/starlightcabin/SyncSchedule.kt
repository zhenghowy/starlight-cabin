package io.github.zhenghowy.starlightcabin

object SyncSchedule {
    const val INTERVAL_MS = 7L * 24 * 60 * 60 * 1000

    fun shouldAutoSync(lastSuccessAt: Long?, now: Long, hasNetwork: Boolean, hasUser: Boolean): Boolean {
        if (!hasUser || !hasNetwork || lastSuccessAt == null || lastSuccessAt <= 0L) return false
        return now - lastSuccessAt >= INTERVAL_MS
    }
}
