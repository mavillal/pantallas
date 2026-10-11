package cl.sadm.pantallas;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Pantalla completa con el player web del condominio.
 * - Mantiene la pantalla encendida (sin protector de pantalla).
 * - Reintenta cada 30 s si no hay internet al cargar.
 * - Se recupera sola si el motor web se cae.
 * - Configuración: botón MENÚ del control, o ATRÁS 5 veces seguidas.
 */
public class MainActivity extends Activity {

    static final String PREFS = "cfg";
    static final String K_URL = "url";
    static final String K_TORRE = "torre";
    private static final long RETRY_MS = 30_000;

    private WebView web;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable reloadTask = this::load;
    private int backCount = 0;
    private long lastBack = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (torre().isEmpty()) {
            openSetup();
            finish();
            return;
        }
        buildWebView();
        load();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String torre() {
        return prefs().getString(K_TORRE, "");
    }

    private void buildWebView() {
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) scheduleRetry();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                ViewGroup parent = (ViewGroup) view.getParent();
                if (parent != null) parent.removeView(view);
                view.destroy();
                web = null;
                handler.post(() -> MainActivity.this.recreate());
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });

        setContentView(web);
        hideSystemUi();
    }

    private void load() {
        if (web == null) return;
        handler.removeCallbacks(reloadTask);
        String base = prefs().getString(K_URL, BuildConfig.PLAYER_URL);
        String sep = base.contains("?") ? "&" : "?";
        web.loadUrl(base + sep + "torre=" + Uri.encode(torre()));
    }

    private void scheduleRetry() {
        handler.removeCallbacks(reloadTask);
        handler.postDelayed(reloadTask, RETRY_MS);
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        if (web == null) return;
        web.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    private void openSetup() {
        startActivity(new Intent(this, SetupActivity.class));
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_SETTINGS) {
            if (event.getAction() == KeyEvent.ACTION_UP) openSetup();
            return true;
        }
        if (code == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP) {
                long now = System.currentTimeMillis();
                backCount = (now - lastBack < 1500) ? backCount + 1 : 1;
                lastBack = now;
                if (backCount >= 5) {
                    backCount = 0;
                    openSetup();
                }
            }
            return true; // ATRÁS no cierra el player
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            hideSystemUi();
        }
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getBooleanExtra("reload", false)) load();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
