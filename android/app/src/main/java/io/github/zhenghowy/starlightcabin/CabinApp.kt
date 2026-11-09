package io.github.zhenghowy.starlightcabin

import android.app.Application

class CabinApp : Application() {
    lateinit var store: CabinStore
        private set
    lateinit var sync: CabinSync
        private set

    override fun onCreate() {
        super.onCreate()
        store = CabinStore(this)
        sync = CabinSync(this, store)
        sync.ensurePeriodic()
    }
}
