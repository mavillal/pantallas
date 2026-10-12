package cl.sadm.pantallas;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Configuración de un stick (una sola vez):
 *  1. Permiso de inicio automático ("Mostrar sobre otras apps"), necesario en Android 10+.
 *  2. Torre de este TV.
 * La URL del player viene fija en el APK (PLAYER_URL) y no se muestra en pantalla.
 */
public class SetupActivity extends Activity {

    private static final int BG = Color.parseColor("#12304A");
    private static final int FG = Color.parseColor("#F6F3EC");
    private static final int MUTED = Color.parseColor("#BFD0DA");
    private static final int OK = Color.parseColor("#7FD6A0");
    private static final int WARN = Color.parseColor("#F2B48F");

    private TextView permStatus;
    private Button permButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SharedPreferences p = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
        String torreActual = p.getString(MainActivity.K_TORRE, "");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(48), dp(32), dp(48), dp(32));
        root.setBackgroundColor(BG);

        root.addView(text("Configurar pantalla", 30, FG, true));
        root.addView(text("Versión " + BuildConfig.VERSION_NAME
                + (torreActual.isEmpty() ? "" : "  ·  Torre actual: " + torreActual)
                + "  ·  Contacto: " + MainActivity.CONTACTO, 16, MUTED, false));

        root.addView(text("1. Inicio automático al encender", 20, FG, true), spaced());
        permStatus = text("", 16, MUTED, false);
        root.addView(permStatus);
        permButton = new Button(this);
        permButton.setText("Permitir inicio automático");
        permButton.setOnClickListener(v -> requestOverlayPermission());
        root.addView(permButton);

        root.addView(text("2. ¿Qué torre es este TV?  (elige para terminar)", 20, FG, true), spaced());
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(6);
        for (int i = 1; i <= BuildConfig.NUM_TORRES; i++) {
            final String t = "T" + i;
            Button b = new Button(this);
            b.setText(t);
            b.setTextSize(20);
            b.setMinWidth(dp(110));
            b.setOnClickListener(v -> save(t));
            grid.addView(b);
            if (t.equals(torreActual)) b.post(b::requestFocus);
        }
        root.addView(grid);

        root.addView(text("Para volver aquí: en el player presiona ATRÁS u OK y elige \"Configurar\".",
                14, MUTED, false), spaced());

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        scroll.addView(root);
        setContentView(scroll);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshPermission();
    }

    private void refreshPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            permStatus.setText("No es necesario en este equipo.");
            permStatus.setTextColor(OK);
            permButton.setVisibility(View.GONE);
        } else if (Settings.canDrawOverlays(this)) {
            permStatus.setText("Listo: la app arrancará sola al encender.");
            permStatus.setTextColor(OK);
            permButton.setVisibility(View.GONE);
        } else {
            permStatus.setText("Falta el permiso: sin él, tras un corte de luz habrá que abrir la app a mano.");
            permStatus.setTextColor(WARN);
            permButton.setVisibility(View.VISIBLE);
        }
    }

    private void requestOverlayPermission() {
        Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getPackageName()));
        try {
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            permStatus.setText("Este TV no muestra el ajuste. Desde un computador en la misma red:\n"
                    + "adb connect <IP-del-stick>\n"
                    + "adb shell appops set " + getPackageName() + " SYSTEM_ALERT_WINDOW allow");
            permStatus.setTextColor(WARN);
        }
    }

    private void save(String torre) {
        getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE).edit()
                .putString(MainActivity.K_TORRE, torre)
                .apply();
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("reload", true);
        startActivity(i);
        finish();
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.START);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private LinearLayout.LayoutParams spaced() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(24);
        return lp;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
