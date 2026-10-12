package cl.sadm.pantallas;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Pantalla completa con el player web del condominio.
 * - Mantiene la pantalla encendida y reintenta sola si falla la carga.
 * - ATRÁS abre un menú en pantalla (Seguir · Recargar · Configurar); nunca cierra el player.
 * - Si la página no carga (sin internet, error 404…), muestra la pantalla de Bienvenida con el contacto
 *   y reintenta cada 30 s; el motivo se ve en el menú (OK).
 */
public class MainActivity extends Activity {

    static final String PREFS = "cfg";
    static final String K_URL = "url";
    static final String K_TORRE = "torre";
    private static final long RETRY_MS = 30_000;
    private static final long MENU_AUTOHIDE_MS = 20_000;
    static final String CONTACTO = "mavillal@gmail.com";

    private static final int NAVY = Color.parseColor("#E60B2440");
    private static final int SAND = Color.parseColor("#F6F3EC");
    private static final int MUTED = Color.parseColor("#BFD0DA");

    /** Pantalla de Bienvenida (mismo diseño que el player) mientras el player no carga. */
    private static final String WELCOME_HTML = "<!doctype html><html><head><meta charset='utf-8'>"
            + "<meta name='viewport' content='width=device-width,initial-scale=1'><style>"
            + "html,body{margin:0;height:100%;overflow:hidden;background:#F3EFE8;color:#1E2A32;"
            + "font-family:Inter,system-ui,Roboto,sans-serif;display:flex;flex-direction:column;"
            + "align-items:center;justify-content:center;text-align:center}"
            + ".k{font-size:2.6vh;letter-spacing:.42em;text-transform:uppercase;color:#6B7780}"
            + "h1{font-size:15vh;font-weight:300;letter-spacing:-.03em;margin:2.4vh 0 3vh}"
            + ".r{width:6vw;border-top:2px solid #2F7D78}"
            + ".c{position:fixed;bottom:3vh;left:0;right:0;font-size:2vh;color:#9AA3AA;letter-spacing:.04em}"
            + "</style></head><body><div class='k'>San Alfonso del Mar · Algarrobo</div>"
            + "<h1>Bienvenidos</h1><div class='r'></div>"
            + "<div class='c'>Contacto: " + CONTACTO + "</div></body></html>";

    private WebView web;
    private LinearLayout overlay;
    private TextView overlayTitle;
    private TextView overlayMsg;
    private Button btnSeguir;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable reloadTask = this::load;
    private final Runnable hideMenuTask = this::hideOverlay;
    private boolean loadFailed = false;
    private String lastError = "";

    /** URL guardada; si está vacía o es la de ejemplo, usa la que trae la app. */
    static String playerUrl(SharedPreferences p) {
        String u = p.getString(K_URL, "");
        if (u == null || u.trim().isEmpty() || u.contains("USUARIO")) return BuildConfig.PLAYER_URL;
        return u.trim();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (torre().isEmpty()) {
            openSetup();
            finish();
            return;
        }
        buildUi();
        load();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String torre() {
        return prefs().getString(K_TORRE, "");
    }

    // ---------------------------------------------------------------- UI

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

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
        web.setWebViewClient(new PlayerClient());
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        root.addView(buildOverlay(), new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        setContentView(root);
        hideSystemUi();
    }

    private View buildOverlay() {
        overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setGravity(Gravity.CENTER_HORIZONTAL);
        overlay.setPadding(dp(40), dp(28), dp(40), dp(28));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(NAVY);
        bg.setCornerRadius(dp(18));
        overlay.setBackground(bg);
        overlay.setVisibility(View.GONE);

        overlayTitle = new TextView(this);
        overlayTitle.setTextColor(SAND);
        overlayTitle.setTextSize(26);
        overlayTitle.setTypeface(Typeface.DEFAULT_BOLD);
        overlayTitle.setGravity(Gravity.CENTER);
        overlay.addView(overlayTitle);

        overlayMsg = new TextView(this);
        overlayMsg.setTextColor(MUTED);
        overlayMsg.setTextSize(17);
        overlayMsg.setGravity(Gravity.CENTER);
        overlayMsg.setPadding(0, dp(8), 0, dp(20));
        overlayMsg.setMaxWidth(dp(560));
        overlay.addView(overlayMsg);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        btnSeguir = button("Seguir", v -> hideOverlay());
        row.addView(btnSeguir);
        row.addView(button("Recargar", v -> { hideOverlay(); load(); }));
        row.addView(button("Configurar", v -> { hideOverlay(); openSetup(); }));
        overlay.addView(row);
        return overlay;
    }

    private Button button(String label, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextSize(20);
        b.setAllCaps(false);
        b.setMinWidth(dp(150));
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.leftMargin = dp(8);
        lp.rightMargin = dp(8);
        b.setLayoutParams(lp);
        return b;
    }

    private void showMenu() {
        overlayTitle.setText("Torre " + torre());
        overlayMsg.setText("Versión " + BuildConfig.VERSION_NAME + "\nContacto: " + CONTACTO
                + (loadFailed ? "\n\nNo se pudo cargar el player: " + lastError
                        + "\nReintento automático cada 30 segundos." : ""));
        showOverlay();
        handler.removeCallbacks(hideMenuTask);
        handler.postDelayed(hideMenuTask, MENU_AUTOHIDE_MS);
    }

    private void showOverlay() {
        overlay.setVisibility(View.VISIBLE);
        overlay.bringToFront();
        btnSeguir.requestFocus();
    }

    private void hideOverlay() {
        handler.removeCallbacks(hideMenuTask);
        if (overlay != null) overlay.setVisibility(View.GONE);
        hideSystemUi();
    }

    private boolean overlayVisible() {
        return overlay != null && overlay.getVisibility() == View.VISIBLE;
    }

    // ---------------------------------------------------------------- carga

    private void load() {
        if (web == null) return;
        handler.removeCallbacks(reloadTask);
        loadFailed = false;
        String base = playerUrl(prefs());
        String sep = base.contains("?") ? "&" : "?";
        web.loadUrl(base + sep + "torre=" + Uri.encode(torre()));
    }

    private void failed(String why) {
        loadFailed = true;
        lastError = why;
        if (web != null) web.loadDataWithBaseURL(null, WELCOME_HTML, "text/html", "utf-8", null);
        handler.removeCallbacks(reloadTask);
        handler.postDelayed(reloadTask, RETRY_MS);
    }

    private class PlayerClient extends WebViewClient {
        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                failed("Sin conexión o dirección inválida (" + error.getDescription() + ").");
            }
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame()) {
                int code = response.getStatusCode();
                failed(code == 404
                        ? "Error 404: la página del player no responde."
                        : "El servidor respondió con error " + code + ".");
            }
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
    }

    // ---------------------------------------------------------------- control remoto

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        boolean up = event.getAction() == KeyEvent.ACTION_UP;

        if (code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_SETTINGS) {
            if (up) openSetup();
            return true;
        }
        if (code == KeyEvent.KEYCODE_BACK) {
            if (up) {
                if (overlayVisible()) hideOverlay();
                else showMenu();
            }
            return true; // ATRÁS nunca cierra el player
        }
        if (!overlayVisible() && (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER)) {
            if (up) showMenu(); // OK también abre el menú
            return true;
        }
        if (overlayVisible()) {
            handler.removeCallbacks(hideMenuTask);
            handler.postDelayed(hideMenuTask, MENU_AUTOHIDE_MS);
        }
        return super.dispatchKeyEvent(event);
    }

    private void openSetup() {
        startActivity(new Intent(this, SetupActivity.class));
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

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    // ---------------------------------------------------------------- ciclo de vida

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
        if (intent != null && intent.getBooleanExtra("reload", false)) {
            hideOverlay();
            load();
        }
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
