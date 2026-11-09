package io.github.zhenghowy.starlightcabin

import android.content.Intent
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File

class BackupExporter(private val context: android.content.Context, private val store: CabinStore) {
    fun share(): String {
        val payload = store.exportJson()
        if (!payload.optBoolean("ok")) return payload.toString()
        val dir = File(context.cacheDir, "backup")
        dir.mkdirs()
        val file = File(dir, "starlight-cabin-backup.json")
        file.writeText(payload.toString())
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val share = Intent(Intent.ACTION_SEND).apply {
            type = "application/json"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(share, "导出本机备份").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return JSONObject().put("ok", true).toString()
    }
}
