package com.centralhub.network;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        bridge.getWebView().addJavascriptInterface(
                new CentralHubNativeBridge(this),
                "CentralHubNative"
        );

        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                CentralHubNativeBridge.saveFcmToken(this, task.getResult());
            }
        });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    4101
            );
        }

        bridge.getWebView().setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("http://localhost") || url.startsWith("https://localhost")) {
                    try {
                        String path = request.getUrl().getPath();
                        if (path != null && !path.startsWith("/_next") && !path.equals("/") && !path.equals("/index.html")) {
                            String assetPath = "public" + path;
                            if (path.endsWith("/")) {
                                assetPath = assetPath + "index.html";
                            } else {
                                assetPath = assetPath + "/index.html";
                            }
                            try {
                                return new WebResourceResponse(
                                    "text/html",
                                    "utf-8",
                                    getAssets().open(assetPath)
                                );
                            } catch (Exception e) {
                                return new WebResourceResponse(
                                    "text/html",
                                    "utf-8",
                                    getAssets().open("public/index.html")
                                );
                            }
                        }
                    } catch (Exception e) {
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                String url = request.getUrl().toString();
                if (url.startsWith("http://localhost") || url.startsWith("https://localhost")) {
                    view.post(() -> view.loadUrl("file:///android_asset/public/index.html"));
                } else {
                    super.onReceivedError(view, request, error);
                }
            }
        });
    }
}
