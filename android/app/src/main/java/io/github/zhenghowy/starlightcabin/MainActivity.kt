package io.github.zhenghowy.starlightcabin

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlin.math.max

class MainActivity : AppCompatActivity() {
    private enum class Failure {
        OFFLINE,
        SSL
    }

    private lateinit var content: FrameLayout
    private lateinit var progress: View
    private lateinit var errorPanel: View
    private lateinit var errorTitle: TextView
    private lateinit var errorBody: TextView
    private lateinit var statusScrim: View
    private lateinit var navScrim: View
    private lateinit var webView: WebView

    private val handler = Handler(Looper.getMainLooper())
    private val loadTimeout = Runnable {
        if (failure == null) showFailure(Failure.OFFLINE)
    }

    private var failure: Failure? = null
    private var webViewDead = false
    private var lastUrl = CabinUrls.START_URL

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        @Suppress("DEPRECATION")
        window.statusBarColor = Color.TRANSPARENT
        @Suppress("DEPRECATION")
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            @Suppress("DEPRECATION")
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
        WebView.setWebContentsDebuggingEnabled(false)

        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)

        setContentView(R.layout.activity_main)
        content = findViewById(R.id.content)
        progress = findViewById(R.id.progress)
        errorPanel = findViewById(R.id.error_panel)
        errorTitle = findViewById(R.id.error_title)
        errorBody = findViewById(R.id.error_body)
        statusScrim = findViewById(R.id.status_scrim)
        navScrim = findViewById(R.id.nav_scrim)
        findViewById<View>(R.id.retry).setOnClickListener { loadCabin(lastUrl) }

        WindowInsetsControllerCompat(window, content).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = true
        }
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root)) { _, insets ->
            applyInsets(insets)
            WindowInsetsCompat.CONSUMED
        }

        webView = createWebView()
        content.addView(webView, 0, matchParent())
        cookies.setAcceptThirdPartyCookies(webView, false)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    when (CabinUrls.decideBack(!webViewDead && webView.canGoBack())) {
                        CabinUrls.BackAction.GO_BACK_IN_PAGE -> webView.goBack()
                        CabinUrls.BackAction.LEAVE_APP -> finish()
                    }
                }
            }
        )

        val webPackage = WebView.getCurrentWebViewPackage()
        Log.i(TAG, "webview=${webPackage?.packageName}/${webPackage?.versionName}")

        if (savedInstanceState != null) {
            lastUrl = savedInstanceState.getString(STATE_URL) ?: CabinUrls.START_URL
            val restored = webView.restoreState(savedInstanceState)
            if (restored == null) loadCabin(lastUrl)
        } else {
            loadCabin(CabinUrls.START_URL)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (!webViewDead) webView.saveState(outState)
        outState.putString(STATE_URL, lastUrl)
        super.onSaveInstanceState(outState)
    }

    override fun onPause() {
        if (!webViewDead) webView.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (!webViewDead) webView.onResume()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        if (!webViewDead) destroyWebView(webView)
        super.onDestroy()
    }

    private fun applyInsets(insets: WindowInsetsCompat) {
        val bars = insets.getInsets(
            WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
        )
        val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
        val bottom = max(bars.bottom, ime.bottom)
        content.setPadding(bars.left, bars.top, bars.right, bottom)
        setHeight(statusScrim, bars.top)
        setHeight(navScrim, if (ime.bottom > 0) 0 else bars.bottom)
    }

    private fun setHeight(view: View, height: Int) {
        val params = view.layoutParams
        if (params.height == height) return
        params.height = height
        view.layoutParams = params
    }

    private fun loadCabin(url: String) {
        if (!CabinUrls.isInAppUrl(url)) return
        if (webViewDead) {
            webView = createWebView()
            content.addView(webView, 0, matchParent())
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
            webViewDead = false
        }
        lastUrl = url
        failure = null
        errorPanel.visibility = View.GONE
        progress.visibility = View.VISIBLE
        armTimeout()
        Log.i(TAG, "state=loading")
        webView.loadUrl(url)
    }

    private fun armTimeout() {
        handler.removeCallbacks(loadTimeout)
        handler.postDelayed(loadTimeout, LOAD_TIMEOUT_MS)
    }

    private fun showFailure(kind: Failure) {
        if (isDestroyed) return
        failure = kind
        handler.removeCallbacks(loadTimeout)
        progress.visibility = View.GONE
        errorPanel.visibility = View.VISIBLE
        if (kind == Failure.SSL) {
            errorTitle.setText(R.string.error_ssl_title)
            errorBody.setText(R.string.error_ssl_body)
            Log.i(TAG, "state=ssl")
        } else {
            errorTitle.setText(R.string.error_offline_title)
            errorBody.setText(R.string.error_offline_body)
            Log.i(TAG, "state=offline")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(): WebView {
        return WebView(this).apply {
            setBackgroundColor(getColor(R.color.dusk))
            isFocusable = true
            isFocusableInTouchMode = true
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_YES
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                loadsImagesAutomatically = true
                useWideViewPort = true
                loadWithOverviewMode = true
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                mediaPlaybackRequiresUserGesture = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                allowFileAccess = false
                allowContentAccess = false
                @Suppress("DEPRECATION")
                allowFileAccessFromFileURLs = false
                @Suppress("DEPRECATION")
                allowUniversalAccessFromFileURLs = false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    safeBrowsingEnabled = true
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    isAlgorithmicDarkeningAllowed = false
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    @Suppress("DEPRECATION")
                    forceDark = WebSettings.FORCE_DARK_OFF
                }
                userAgentString = userAgentString + " StarlightCabinAndroid/1"
            }
            webViewClient = cabinClient()
            webChromeClient = cabinChrome()
            setDownloadListener { _, _, _, _, _ ->
                Log.i(TAG, "state=download-ignored")
            }
        }
    }

    private fun cabinClient(): WebViewClient {
        return object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val url = request.url?.toString() ?: return true
                if (CabinUrls.isInAppUrl(url)) return false
                if (CabinUrls.isExternalWebUrl(url)) openExternal(url)
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                if (!CabinUrls.isInAppUrl(url)) return
                failure = null
                errorPanel.visibility = View.GONE
                progress.visibility = View.VISIBLE
                armTimeout()
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (failure != null || !CabinUrls.isInAppUrl(url)) return
                progress.visibility = View.GONE
                handler.removeCallbacks(loadTimeout)
                CookieManager.getInstance().flush()
                Log.i(TAG, "state=loaded")
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                showFailure(Failure.OFFLINE)
            }

            @Deprecated("旧版 WebView 仍会回调这个方法")
            @Suppress("DEPRECATION")
            override fun onReceivedError(
                view: WebView,
                errorCode: Int,
                description: String?,
                failingUrl: String?
            ) {
                if (CabinUrls.isInAppUrl(failingUrl)) showFailure(Failure.OFFLINE)
            }

            override fun onReceivedHttpError(
                view: WebView,
                request: WebResourceRequest,
                errorResponse: WebResourceResponse
            ) {
                if (request.isForMainFrame && errorResponse.statusCode >= 400) {
                    showFailure(Failure.OFFLINE)
                }
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
                handler.cancel()
                showFailure(Failure.SSL)
            }

            override fun onSafeBrowsingHit(
                view: WebView,
                request: WebResourceRequest,
                threatType: Int,
                callback: android.webkit.SafeBrowsingResponse
            ) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    callback.backToSafety(true)
                }
                if (request.isForMainFrame) showFailure(Failure.OFFLINE)
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                webViewDead = true
                destroyWebView(view)
                showFailure(Failure.OFFLINE)
                return true
            }
        }
    }

    private fun cabinChrome(): WebChromeClient {
        return object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, false, false)
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                request.deny()
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                filePathCallback.onReceiveValue(null)
                return true
            }

            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message
            ): Boolean = false
        }
    }

    private fun openExternal(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            Log.i(TAG, "state=no-browser")
        }
    }

    private fun destroyWebView(view: WebView) {
        (view.parent as? ViewGroup)?.removeView(view)
        view.stopLoading()
        view.webChromeClient = null
        view.webViewClient = WebViewClient()
        view.destroy()
    }

    private fun matchParent(): FrameLayout.LayoutParams {
        return FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
    }

    companion object {
        private const val TAG = "StarlightCabin"
        private const val STATE_URL = "cabin_url"
        private const val LOAD_TIMEOUT_MS = 25_000L
    }
}
