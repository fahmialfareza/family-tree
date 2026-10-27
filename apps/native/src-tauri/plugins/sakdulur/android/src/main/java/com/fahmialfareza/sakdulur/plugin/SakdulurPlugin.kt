package com.fahmialfareza.sakdulur.plugin

import android.app.Activity
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.browser.customtabs.CustomTabsIntent
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class UrlArgs {
    var url: String? = null
}

@InvokeArg
class SaveFileArgs {
    var name: String? = null
    var mime: String? = null
    var data: String? = null // base64
}

/**
 * Native pieces of the Sakdulur app on Android (see the plugin's src/lib.rs):
 * - openInAppBrowser: the site's public pages in Chrome's Custom Tab sheet (called by the app's Rust code)
 * - saveFile: downloads, which Android web views ignore; the site hands the file over. Pictures go to the
 *   Gallery (Pictures/Sakdulur), other files to Downloads (MediaStore, no storage permission; a taken name
 *   gets " (1)" etc.)
 */
@TauriPlugin
class SakdulurPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun openInAppBrowser(invoke: Invoke) {
        val url = invoke.parseArgs(UrlArgs::class.java).url
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            invoke.reject("invalid url")
            return
        }
        activity.runOnUiThread {
            try {
                CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(activity, Uri.parse(url))
                invoke.resolve()
            } catch (e: Exception) {
                invoke.reject(e.message ?: "could not open the page")
            }
        }
    }

    @Command
    fun saveFile(invoke: Invoke) {
        val args = invoke.parseArgs(SaveFileArgs::class.java)
        val name = args.name?.replace(Regex("[\\\\/:*?\"<>|]"), "")?.trim()?.take(150)
        val data = args.data
        if (name.isNullOrEmpty() || data == null) {
            invoke.reject("invalid file")
            return
        }
        try {
            val bytes = Base64.decode(data, Base64.DEFAULT)
            val mime = args.mime?.takeIf { it.isNotBlank() } ?: "application/octet-stream"
            val picture = mime.startsWith("image/")
            val savedAs = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = activity.contentResolver
                val collection = if (picture) MediaStore.Images.Media.EXTERNAL_CONTENT_URI else MediaStore.Downloads.EXTERNAL_CONTENT_URI
                val folder = if (picture) "${Environment.DIRECTORY_PICTURES}/Sakdulur" else Environment.DIRECTORY_DOWNLOADS
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, folder)
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val uri = resolver.insert(collection, values)
                    ?: throw IllegalStateException("could not create the file")
                resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw IllegalStateException("could not write the file")
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                resolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) c.getString(0) else name
                } ?: name
            } else {
                // Android 7–9: the app's own folder (no storage permission needed).
                val dir = activity.getExternalFilesDir(if (picture) Environment.DIRECTORY_PICTURES else Environment.DIRECTORY_DOWNLOADS)
                    ?: activity.filesDir
                File(dir, name).apply { writeBytes(bytes) }.name
            }
            val location = when {
                Build.VERSION.SDK_INT < Build.VERSION_CODES.Q -> "device"
                picture -> "gallery"
                else -> "downloads"
            }
            invoke.resolve(JSObject().put("name", savedAs).put("location", location))
        } catch (e: Exception) {
            invoke.reject(e.message ?: "could not save the file")
        }
    }
}
