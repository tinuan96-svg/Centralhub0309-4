package com.centralhub.network;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.os.ParcelFileDescriptor;
import java.io.OutputStream;

/**
 * Feeds caller-owned microphone PCM into Android SpeechRecognizer.
 *
 * On Android 13+ RecognizerIntent.EXTRA_AUDIO_SOURCE lets the app keep one
 * segmented recognition session alive until this stream is closed. Samsung's
 * recognizer then no longer has to repeatedly open/close the microphone between
 * passive wake windows, which avoids the loud start/stop tones heard on the Fold.
 */
final class ShruthiAudioPipe implements AutoCloseable {
    interface LevelListener { void onLevel(float level); }

    static final int SAMPLE_RATE_HZ = 16000;
    static final int CHANNEL_COUNT = 1;
    static final int ENCODING = AudioFormat.ENCODING_PCM_16BIT;

    private final ParcelFileDescriptor readDescriptor;
    private final ParcelFileDescriptor writeDescriptor;
    private final OutputStream output;
    private final AudioRecord recorder;
    private final NoiseSuppressor noiseSuppressor;
    private final AcousticEchoCanceler echoCanceler;
    private final Thread pumpThread;
    private volatile boolean running = true;

    private ShruthiAudioPipe(
            ParcelFileDescriptor readDescriptor,
            ParcelFileDescriptor writeDescriptor,
            OutputStream output,
            AudioRecord recorder,
            NoiseSuppressor noiseSuppressor,
            AcousticEchoCanceler echoCanceler,
            Thread pumpThread
    ) {
        this.readDescriptor = readDescriptor;
        this.writeDescriptor = writeDescriptor;
        this.output = output;
        this.recorder = recorder;
        this.noiseSuppressor = noiseSuppressor;
        this.echoCanceler = echoCanceler;
        this.pumpThread = pumpThread;
    }

    static ShruthiAudioPipe start() { return start(null); }

    static ShruthiAudioPipe start(LevelListener levelListener) {
        ParcelFileDescriptor[] pipe = null;
        AudioRecord recorder = null;
        NoiseSuppressor noiseSuppressor = null;
        AcousticEchoCanceler echoCanceler = null;
        OutputStream output = null;
        try {
            pipe = ParcelFileDescriptor.createPipe();
            int minimum = AudioRecord.getMinBufferSize(
                    SAMPLE_RATE_HZ,
                    AudioFormat.CHANNEL_IN_MONO,
                    ENCODING
            );
            int bufferSize = Math.max(8192, minimum > 0 ? minimum * 2 : 8192);
            recorder = new AudioRecord(
                    MediaRecorder.AudioSource.VOICE_RECOGNITION,
                    SAMPLE_RATE_HZ,
                    AudioFormat.CHANNEL_IN_MONO,
                    ENCODING,
                    bufferSize
            );
            if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
                throw new IllegalStateException("audio_record_not_initialized");
            }

            try {
                if (NoiseSuppressor.isAvailable()) {
                    noiseSuppressor = NoiseSuppressor.create(recorder.getAudioSessionId());
                    if (noiseSuppressor != null) noiseSuppressor.setEnabled(true);
                }
            } catch (Exception ignored) { noiseSuppressor = null; }

            try {
                if (AcousticEchoCanceler.isAvailable()) {
                    echoCanceler = AcousticEchoCanceler.create(recorder.getAudioSessionId());
                    if (echoCanceler != null) echoCanceler.setEnabled(true);
                }
            } catch (Exception ignored) { echoCanceler = null; }

            output = new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1]);
            recorder.startRecording();

            final ParcelFileDescriptor readSide = pipe[0];
            final ParcelFileDescriptor writeSide = pipe[1];
            final OutputStream stream = output;
            final AudioRecord activeRecorder = recorder;
            final NoiseSuppressor activeNoiseSuppressor = noiseSuppressor;
            final AcousticEchoCanceler activeEchoCanceler = echoCanceler;
            final ShruthiAudioPipe[] holder = new ShruthiAudioPipe[1];

            Thread pump = new Thread(() -> {
                byte[] buffer = new byte[4096];
                try {
                    while (holder[0] == null) {
                        try { Thread.sleep(2L); } catch (InterruptedException ignored) { return; }
                    }
                    long lastLevelAt = 0L;
                    while (holder[0].running) {
                        int read = activeRecorder.read(buffer, 0, buffer.length);
                        if (read > 0) {
                            if (levelListener != null) {
                                long now = android.os.SystemClock.elapsedRealtime();
                                if (now - lastLevelAt >= 50L) {
                                    long sumSquares = 0L;
                                    int sampleCount = read / 2;
                                    for (int i = 0; i + 1 < read; i += 2) {
                                        int sample = (short) (((buffer[i + 1] & 0xff) << 8) | (buffer[i] & 0xff));
                                        sumSquares += (long) sample * (long) sample;
                                    }
                                    if (sampleCount > 0) {
                                        double rms = Math.sqrt((double) sumSquares / (double) sampleCount) / 32768d;
                                        float level = (float) Math.max(0d, Math.min(1d, rms * 8d));
                                        try { levelListener.onLevel(level); } catch (Exception ignored) { }
                                    }
                                    lastLevelAt = now;
                                }
                            }
                            stream.write(buffer, 0, read);
                            stream.flush();
                        } else if (read == AudioRecord.ERROR_DEAD_OBJECT || read == AudioRecord.ERROR_INVALID_OPERATION) {
                            break;
                        }
                    }
                } catch (Exception ignored) {
                    // Closing the pipe/recorder intentionally breaks a blocking read/write.
                }
            }, "shruthi-audio-pipe");
            pump.setDaemon(true);

            ShruthiAudioPipe instance = new ShruthiAudioPipe(
                    readSide,
                    writeSide,
                    stream,
                    activeRecorder,
                    activeNoiseSuppressor,
                    activeEchoCanceler,
                    pump
            );
            holder[0] = instance;
            pump.start();
            return instance;
        } catch (Exception failure) {
            try { if (recorder != null) recorder.stop(); } catch (Exception ignored) { }
            try { if (noiseSuppressor != null) noiseSuppressor.release(); } catch (Exception ignored) { }
            try { if (echoCanceler != null) echoCanceler.release(); } catch (Exception ignored) { }
            try { if (recorder != null) recorder.release(); } catch (Exception ignored) { }
            try { if (output != null) output.close(); } catch (Exception ignored) { }
            if (pipe != null) {
                try { pipe[0].close(); } catch (Exception ignored) { }
                try { pipe[1].close(); } catch (Exception ignored) { }
            }
            return null;
        }
    }

    ParcelFileDescriptor getReadDescriptor() {
        return readDescriptor;
    }

    @Override
    public void close() {
        running = false;
        try { recorder.stop(); } catch (Exception ignored) { }
        try { output.close(); } catch (Exception ignored) { }
        try { writeDescriptor.close(); } catch (Exception ignored) { }
        try { readDescriptor.close(); } catch (Exception ignored) { }
        try { if (noiseSuppressor != null) noiseSuppressor.release(); } catch (Exception ignored) { }
        try { if (echoCanceler != null) echoCanceler.release(); } catch (Exception ignored) { }
        try { recorder.release(); } catch (Exception ignored) { }
        try { pumpThread.interrupt(); } catch (Exception ignored) { }
    }
}
