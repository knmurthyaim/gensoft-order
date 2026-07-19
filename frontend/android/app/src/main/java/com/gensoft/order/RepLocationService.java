package com.gensoft.order;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class RepLocationService extends Service {
    public static final String ACTION_START = "com.gensoft.order.START_REP_TRACKING";
    public static final String ACTION_STOP = "com.gensoft.order.STOP_REP_TRACKING";
    public static final String PREFS = "rep_tracking";
    private static final String CHANNEL_ID = "gensoft_rep_location";
    private static final int NOTIFICATION_ID = 4107;
    private static final int MAX_QUEUE = 500;

    private SharedPreferences prefs;
    private FusedLocationProviderClient fusedClient;
    private LocationCallback callback;
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();

    @Override
    public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            prefs.edit().clear().apply();
            stopLocationUpdates();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (
            intent != null
            && ACTION_START.equals(intent.getAction())
            && intent.hasExtra("token")
        ) {
            prefs.edit()
                .putBoolean("enabled", true)
                .putString("token", intent.getStringExtra("token"))
                .putString("apiBase", intent.getStringExtra("apiBase"))
                .putInt("intervalSec", intent.getIntExtra("intervalSec", 30))
                .putInt("minMoveMeters", intent.getIntExtra("minMoveMeters", 50))
                .apply();
        }

        if (!prefs.getBoolean("enabled", false)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildNotification());
        startLocationUpdates();
        networkExecutor.execute(this::flushQueue);
        return START_STICKY;
    }

    private void startLocationUpdates() {
        if (
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED
            && ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED
        ) {
            return;
        }
        stopLocationUpdates();
        long intervalMs = Math.max(15, prefs.getInt("intervalSec", 30)) * 1000L;
        float minDistance = Math.max(10, prefs.getInt("minMoveMeters", 50));
        LocationRequest request = new LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            intervalMs
        )
            .setMinUpdateIntervalMillis(Math.max(10000L, intervalMs / 2))
            .setMinUpdateDistanceMeters(minDistance)
            .build();
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                for (Location location : result.getLocations()) {
                    enqueue(location);
                }
                networkExecutor.execute(RepLocationService.this::flushQueue);
            }
        };
        try {
            fusedClient.requestLocationUpdates(request, callback, getMainLooper());
        } catch (SecurityException ignored) {
            // Permission can be revoked while the service is running.
        }
    }

    private synchronized void enqueue(Location location) {
        try {
            JSONArray queue = new JSONArray(prefs.getString("queue", "[]"));
            while (queue.length() >= MAX_QUEUE) {
                JSONArray trimmed = new JSONArray();
                for (int i = 1; i < queue.length(); i++) trimmed.put(queue.get(i));
                queue = trimmed;
            }
            JSONObject point = new JSONObject();
            point.put("latitude", location.getLatitude());
            point.put("longitude", location.getLongitude());
            point.put("accuracy_m", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
            point.put("recorded_at", isoTime(location.getTime()));
            queue.put(point);
            prefs.edit().putString("queue", queue.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    private synchronized void flushQueue() {
        String token = prefs.getString("token", "");
        String apiBase = prefs.getString("apiBase", "");
        if (token.isEmpty() || apiBase.isEmpty()) return;
        try {
            JSONArray queue = new JSONArray(prefs.getString("queue", "[]"));
            while (queue.length() > 0) {
                JSONObject point = queue.getJSONObject(0);
                int status = postPoint(apiBase, token, point);
                if (status == -2) {
                    prefs.edit()
                        .putBoolean("enabled", false)
                        .putString("queue", "[]")
                        .apply();
                    stopSelf();
                    return;
                }
                if (status < 200 || status >= 300) return;
                JSONArray remaining = new JSONArray();
                for (int i = 1; i < queue.length(); i++) remaining.put(queue.get(i));
                queue = remaining;
                prefs.edit().putString("queue", queue.toString()).commit();
            }
        } catch (Exception ignored) {
            // Keep queued points and retry on the next location/service restart.
        }
    }

    private int postPoint(String apiBase, String token, JSONObject point) throws Exception {
        String base = apiBase.endsWith("/") ? apiBase.substring(0, apiBase.length() - 1) : apiBase;
        HttpURLConnection connection = (HttpURLConnection) new URL(
            base + "/rep/location"
        ).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(20000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("Content-Type", "application/json");
        byte[] body = point.toString().getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(body.length);
        try (OutputStream out = connection.getOutputStream()) {
            out.write(body);
        }
        int status = connection.getResponseCode();
        if (status >= 200 && status < 300) {
            StringBuilder response = new StringBuilder();
            try (
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)
                )
            ) {
                String line;
                while ((line = reader.readLine()) != null) response.append(line);
            }
            if (response.toString().contains("\"accepted\":false")) {
                connection.disconnect();
                return -2;
            }
        }
        connection.disconnect();
        return status;
    }

    private String isoTime(long millis) {
        SimpleDateFormat fmt = new SimpleDateFormat(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            Locale.US
        );
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(new Date(millis));
    }

    private Notification buildNotification() {
        Intent openApp = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("GenSoft location tracking")
            .setContentText("Your work location is being shared with your distributor.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Sales rep location",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Required while sales rep background tracking is active.");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private void stopLocationUpdates() {
        if (callback != null) {
            fusedClient.removeLocationUpdates(callback);
            callback = null;
        }
    }

    @Override
    public void onDestroy() {
        stopLocationUpdates();
        networkExecutor.shutdown();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
