package com.centralhub.network;

import android.os.Bundle;
import android.view.WindowManager;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import java.util.concurrent.Executor;

public final class ShruthiSecurityActivity extends AppCompatActivity {
    private boolean resultWritten = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        runVerification();
    }

    private void runVerification() {
        final int authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG
                | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        BiometricManager manager = BiometricManager.from(this);
        if (manager.canAuthenticate(authenticators) != BiometricManager.BIOMETRIC_SUCCESS) {
            finishWithResult("unavailable");
            return;
        }

        Executor executor = ContextCompat.getMainExecutor(this);
        BiometricPrompt prompt = new BiometricPrompt(this, executor, new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                super.onAuthenticationSucceeded(result);
                finishWithResult("success");
            }

            @Override
            public void onAuthenticationError(int errorCode, CharSequence errString) {
                super.onAuthenticationError(errorCode, errString);
                boolean cancelled = errorCode == BiometricPrompt.ERROR_CANCELED
                        || errorCode == BiometricPrompt.ERROR_USER_CANCELED
                        || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON;
                finishWithResult(cancelled ? "cancelled" : "failed");
            }

            @Override
            public void onAuthenticationFailed() {
                super.onAuthenticationFailed();
                // Keep the prompt open. Android can accept another fingerprint or
                // fall back to the device credential without restarting the flow.
            }
        });

        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Shruthi Security")
                .setSubtitle("Verify your device identity to unlock CentralHub")
                .setAllowedAuthenticators(authenticators)
                .setConfirmationRequired(false)
                .build();
        prompt.authenticate(promptInfo);
    }

    private void finishWithResult(String result) {
        if (resultWritten) return;
        resultWritten = true;

        // The WebView polls this result immediately when MainActivity resumes.
        // Use a synchronous tiny write so the first successful fingerprint cannot
        // be lost between Activity finish/resume and SharedPreferences flushing.
        ShruthiSecurityResultBridge.write(this, result);
        finish();
    }

    @Override
    protected void onDestroy() {
        if (!resultWritten && isFinishing()) {
            ShruthiSecurityResultBridge.write(this, "cancelled");
        }
        super.onDestroy();
    }
}
