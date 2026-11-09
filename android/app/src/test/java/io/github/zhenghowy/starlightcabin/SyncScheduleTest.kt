package io.github.zhenghowy.starlightcabin

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncScheduleTest {
    private val day = 24L * 60 * 60 * 1000

    @Test
    fun staysQuietBeforeSevenDays() {
        val last = 1_000L
        assertFalse(SyncSchedule.shouldAutoSync(last, last + 6 * day, hasNetwork = true, hasUser = true))
    }

    @Test
    fun catchesUpAfterSevenDaysWhenOnline() {
        val last = 1_000L
        assertTrue(SyncSchedule.shouldAutoSync(last, last + SyncSchedule.INTERVAL_MS, hasNetwork = true, hasUser = true))
        assertFalse(SyncSchedule.shouldAutoSync(last, last + SyncSchedule.INTERVAL_MS, hasNetwork = false, hasUser = true))
        assertFalse(SyncSchedule.shouldAutoSync(null, last + SyncSchedule.INTERVAL_MS, hasNetwork = true, hasUser = true))
    }
}
