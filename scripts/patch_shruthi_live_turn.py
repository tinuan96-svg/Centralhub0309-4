from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# Native Android SpeechRecognizer: faster endpointing, real microphone levels,
# no early segmented replies, and immediate processing interruption signal.
main_path = Path("android/app/src/main/java/com/centralhub/network/MainActivity.java")
main = main_path.read_text()

main = replace_once(
    main,
    "    private final Runnable taraPartialWakeDispatchRunnable = this::dispatchPendingPartialWake;\n",
    "    private final Runnable taraPartialWakeDispatchRunnable = this::dispatchPendingPartialWake;\n"
    "    private final Runnable taraSegmentCommitRunnable = this::commitPendingSegmentTurn;\n",
    "segment commit runnable",
)
main = replace_once(
    main,
    "    private long taraSpeechEndedAt = 0L;\n    private String taraLastTranscriptText = \"\";",
    "    private long taraSpeechEndedAt = 0L;\n"
    "    private long taraLastRmsDispatchAt = 0L;\n"
    "    private final StringBuilder taraSegmentText = new StringBuilder();\n"
    "    private String taraLastTranscriptText = \"\";",
    "native live-turn fields",
)

main = main.replace(
    "RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 450L",
    "RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 280L",
)
main = main.replace(
    "RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 650L",
    "RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 480L",
)
main = main.replace(
    "RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1050L",
    "RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 720L",
)

main = replace_once(
    main,
    "                taraReadyForSpeech = true;\n"
    "                taraListening = true;\n"
    "                taraConsecutiveErrors = 0;\n"
    "            }\n"
    "            @Override public void onBeginningOfSpeech() { }\n"
    "            @Override public void onRmsChanged(float rmsdB) { }\n"
    "            @Override public void onBufferReceived(byte[] buffer) { }\n"
    "            @Override public void onEndOfSpeech() { }",
    "                taraReadyForSpeech = true;\n"
    "                taraListening = true;\n"
    "                taraHandler.removeCallbacks(taraSegmentCommitRunnable);\n"
    "                taraSegmentText.setLength(0);\n"
    "                taraConsecutiveErrors = 0;\n"
    "            }\n"
    "            @Override\n"
    "            public void onBeginningOfSpeech() {\n"
    "                if (noraConversationActive && !taraSpeaking) dispatchTaraUserSpeechStart();\n"
    "            }\n"
    "            @Override\n"
    "            public void onRmsChanged(float rmsdB) {\n"
    "                if (noraConversationActive && !taraSpeaking) dispatchTaraRmsDb(rmsdB);\n"
    "            }\n"
    "            @Override public void onBufferReceived(byte[] buffer) { }\n"
    "            @Override public void onEndOfSpeech() { }",
    "recognizer callbacks",
)

main = replace_once(
    main,
    "                clearPendingPartialWake();\n                taraListening = false;\n                taraReadyForSpeech = false;",
    "                clearPendingPartialWake();\n"
    "                taraHandler.removeCallbacks(taraSegmentCommitRunnable);\n"
    "                taraSegmentText.setLength(0);\n"
    "                taraListening = false;\n"
    "                taraReadyForSpeech = false;",
    "error segment cleanup",
)

main = replace_once(
    main,
    "                clearPendingPartialWake();\n"
    "                processNoraRecognitionBundle(results);\n"
    "                closeTaraAudioPipe();",
    "                clearPendingPartialWake();\n"
    "                taraHandler.removeCallbacks(taraSegmentCommitRunnable);\n"
    "                taraSegmentText.setLength(0);\n"
    "                processNoraRecognitionBundle(results);\n"
    "                closeTaraAudioPipe();",
    "result segment cleanup",
)
main = main.replace(
    "scheduleTaraRestart(noraConversationActive ? 450L : (taraSegmentedSession ? 900L : 800L));",
    "scheduleTaraRestart(noraConversationActive ? 180L : (taraSegmentedSession ? 700L : 650L));",
    1,
)

main = replace_once(
    main,
    "            @Override\n"
    "            public void onSegmentResults(Bundle segmentResults) {\n"
    "                clearPendingPartialWake();\n"
    "                processNoraRecognitionBundle(segmentResults);\n"
    "                taraConsecutiveErrors = 0;\n"
    "                taraListening = true;\n"
    "            }\n\n"
    "            @Override\n"
    "            public void onEndOfSegmentedSession() {\n"
    "                taraHandler.removeCallbacks(taraStartWatchdogRunnable);\n"
    "                clearPendingPartialWake();\n"
    "                closeTaraAudioPipe();\n"
    "                taraListening = false;\n"
    "                taraReadyForSpeech = false;\n"
    "                taraConsecutiveErrors = 0;\n"
    "                scheduleTaraRestart(noraConversationActive ? 450L : 900L);\n"
    "            }",
    "            @Override\n"
    "            public void onSegmentResults(Bundle segmentResults) {\n"
    "                clearPendingPartialWake();\n"
    "                ArrayList<String> matches = segmentResults == null ? null : segmentResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);\n"
    "                if (matches != null && !matches.isEmpty()) {\n"
    "                    String segment = matches.get(0) == null ? \"\" : matches.get(0).trim();\n"
    "                    if (!segment.isEmpty()) {\n"
    "                        if (taraSegmentText.length() > 0) taraSegmentText.append(' ');\n"
    "                        taraSegmentText.append(segment);\n"
    "                        taraHandler.removeCallbacks(taraSegmentCommitRunnable);\n"
    "                        taraHandler.postDelayed(taraSegmentCommitRunnable, 520L);\n"
    "                    }\n"
    "                }\n"
    "                taraConsecutiveErrors = 0;\n"
    "                taraListening = true;\n"
    "            }\n\n"
    "            @Override\n"
    "            public void onEndOfSegmentedSession() {\n"
    "                taraHandler.removeCallbacks(taraStartWatchdogRunnable);\n"
    "                clearPendingPartialWake();\n"
    "                commitPendingSegmentTurn();\n"
    "                closeTaraAudioPipe();\n"
    "                taraListening = false;\n"
    "                taraReadyForSpeech = false;\n"
    "                taraConsecutiveErrors = 0;\n"
    "                scheduleTaraRestart(noraConversationActive ? 180L : 700L);\n"
    "            }",
    "segmented result debounce",
)

old_processor = """    private void processNoraRecognitionBundle(Bundle results) {
        ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return;

        if (taraSpeaking) {
            handleTaraBargeInMatches(matches);
            return;
        }

        for (String match : matches) {
            if (match == null || match.trim().isEmpty()) continue;
            String canonical = canonicalizeNoraTranscript(match);
            String lower = canonical.trim().toLowerCase(Locale.ROOT);
            boolean explicitWake = lower.equals("shruthi") || lower.startsWith("shruthi ");

            if (System.currentTimeMillis() - taraSpeechEndedAt < 1400L && isLikelyTaraEcho(canonical)) {
                continue;
            }

            if (explicitWake) {
                if (!noraConversationActive && System.currentTimeMillis() < taraIgnoreWakeUntil) continue;
                activateNoraConversation();
            } else if (!noraConversationActive) {
                continue;
            } else {
                canonical = "SHRUTHI " + canonical;
            }

            dispatchTaraTranscriptDebounced(canonical);
            return;
        }
    }
"""
new_processor = """    private void processNoraRecognitionBundle(Bundle results) {
        ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return;

        if (taraSpeaking) {
            handleTaraBargeInMatches(matches);
            return;
        }

        for (String match : matches) {
            if (match == null || match.trim().isEmpty()) continue;
            processNoraRecognitionText(match);
            return;
        }
    }

    private void processNoraRecognitionText(String rawText) {
        if (rawText == null || rawText.trim().isEmpty()) return;
        String canonical = canonicalizeNoraTranscript(rawText);
        String lower = canonical.trim().toLowerCase(Locale.ROOT);
        boolean explicitWake = lower.equals("shruthi") || lower.startsWith("shruthi ");

        if (System.currentTimeMillis() - taraSpeechEndedAt < 1400L && isLikelyTaraEcho(canonical)) return;

        if (explicitWake) {
            if (!noraConversationActive && System.currentTimeMillis() < taraIgnoreWakeUntil) return;
            activateNoraConversation();
        } else if (!noraConversationActive) {
            return;
        } else {
            canonical = "SHRUTHI " + canonical;
        }

        dispatchTaraTranscriptDebounced(canonical);
    }

    private void commitPendingSegmentTurn() {
        taraHandler.removeCallbacks(taraSegmentCommitRunnable);
        String completedTurn = taraSegmentText.toString().trim();
        taraSegmentText.setLength(0);
        if (!completedTurn.isEmpty()) processNoraRecognitionText(completedTurn);
    }
"""
main = replace_once(main, old_processor, new_processor, "recognition processor")

main = main.replace("if (now - taraLastBargeInAt < 700L) return;", "if (now - taraLastBargeInAt < 260L) return;")
main = main.replace("taraHandler.postDelayed(taraPartialWakeDispatchRunnable, 260L);", "taraHandler.postDelayed(taraPartialWakeDispatchRunnable, 180L);")
main = main.replace("if (elapsed < 650L && (sameTranscript || !expandsPartialWake)) return;", "if (elapsed < 260L && (sameTranscript || !expandsPartialWake)) return;")
main = main.replace("delay = taraSegmentedSession ? 1200L : 1000L;", "delay = taraSegmentedSession ? 650L : 600L;")
main = main.replace("scheduleTaraRestart(active ? 350L : 800L);", "scheduleTaraRestart(active ? 160L : 700L);")
main = main.replace("scheduleTaraRestart(noraConversationActive ? 350L : 800L);", "scheduleTaraRestart(noraConversationActive ? 160L : 700L)")
main = main.replace("long minimumDelay = noraConversationActive ? 300L : 750L;", "long minimumDelay = noraConversationActive ? 120L : 650L;")
main = main.replace("scheduleTaraRestart(noraConversationActive ? 350L : 800L);", "scheduleTaraRestart(noraConversationActive ? 160L : 700L)")

main = replace_once(
    main,
    "    private void dispatchTaraTranscript(String text) {\n        WebView webView = bridge == null ? null : bridge.getWebView();",
    "    private void dispatchTaraUserSpeechStart() {\n"
    "        WebView webView = bridge == null ? null : bridge.getWebView();\n"
    "        if (webView == null) return;\n"
    "        String script = \"window.dispatchEvent(new CustomEvent('centralhub:tara-user-speech-start'));\";\n"
    "        webView.post(() -> webView.evaluateJavascript(script, null));\n"
    "    }\n\n"
    "    private void dispatchTaraRmsDb(float rmsDb) {\n"
    "        double level = Math.max(0d, Math.min(1d, (rmsDb + 2d) / 12d));\n"
    "        dispatchTaraRmsLevel(level);\n"
    "    }\n\n"
    "    public void dispatchTaraRmsLevel(double level) {\n"
    "        long now = System.currentTimeMillis();\n"
    "        if (now - taraLastRmsDispatchAt < 50L) return;\n"
    "        taraLastRmsDispatchAt = now;\n"
    "        double safeLevel = Math.max(0d, Math.min(1d, level));\n"
    "        WebView webView = bridge == null ? null : bridge.getWebView();\n"
    "        if (webView == null) return;\n"
    "        String script = \"window.dispatchEvent(new CustomEvent('centralhub:tara-rms',{detail:{level:\" + safeLevel + \"}}));\";\n"
    "        webView.post(() -> webView.evaluateJavascript(script, null));\n"
    "    }\n\n"
    "    private void dispatchTaraTranscript(String text) {\n"
    "        WebView webView = bridge == null ? null : bridge.getWebView();",
    "native browser events",
)

main = replace_once(
    main,
    "                ShruthiAudioPipe audioPipe = ShruthiAudioPipe.start();",
    "                ShruthiAudioPipe audioPipe = ShruthiAudioPipe.start(level -> {\n"
    "                    if (noraConversationActive && !taraSpeaking) dispatchTaraRmsLevel(level);\n"
    "                });",
    "audio pipe level callback",
)

main = main.replace(
    "        taraHandler.removeCallbacks(taraStartWatchdogRunnable);\n        clearPendingPartialWake();\n        closeTaraAudioPipe();",
    "        taraHandler.removeCallbacks(taraStartWatchdogRunnable);\n        taraHandler.removeCallbacks(taraSegmentCommitRunnable);\n        taraSegmentText.setLength(0);\n        clearPendingPartialWake();\n        closeTaraAudioPipe();",
)

# Fix accidental missing semicolons if both active restart replacements matched.
main = main.replace("scheduleTaraRestart(noraConversationActive ? 160L : 700L)\n", "scheduleTaraRestart(noraConversationActive ? 160L : 700L);\n")
main_path.write_text(main)


# Audio pipe computes a real microphone level even when SpeechRecognizer does not
# emit onRmsChanged for EXTRA_AUDIO_SOURCE sessions.
pipe_path = Path("android/app/src/main/java/com/centralhub/network/ShruthiAudioPipe.java")
pipe = pipe_path.read_text()
pipe = replace_once(
    pipe,
    "final class ShruthiAudioPipe implements AutoCloseable {\n    static final int SAMPLE_RATE_HZ = 16000;",
    "final class ShruthiAudioPipe implements AutoCloseable {\n"
    "    interface LevelListener { void onLevel(float level); }\n\n"
    "    static final int SAMPLE_RATE_HZ = 16000;",
    "level listener interface",
)
pipe = replace_once(
    pipe,
    "    static ShruthiAudioPipe start() {\n        ParcelFileDescriptor[] pipe = null;",
    "    static ShruthiAudioPipe start() { return start(null); }\n\n"
    "    static ShruthiAudioPipe start(LevelListener levelListener) {\n"
    "        ParcelFileDescriptor[] pipe = null;",
    "start overload",
)
pipe = replace_once(
    pipe,
    "                    while (holder[0].running) {\n"
    "                        int read = activeRecorder.read(buffer, 0, buffer.length);\n"
    "                        if (read > 0) {\n"
    "                            stream.write(buffer, 0, read);\n"
    "                            stream.flush();",
    "                    long lastLevelAt = 0L;\n"
    "                    while (holder[0].running) {\n"
    "                        int read = activeRecorder.read(buffer, 0, buffer.length);\n"
    "                        if (read > 0) {\n"
    "                            if (levelListener != null) {\n"
    "                                long now = android.os.SystemClock.elapsedRealtime();\n"
    "                                if (now - lastLevelAt >= 50L) {\n"
    "                                    long sumSquares = 0L;\n"
    "                                    int sampleCount = read / 2;\n"
    "                                    for (int i = 0; i + 1 < read; i += 2) {\n"
    "                                        int sample = (short) (((buffer[i + 1] & 0xff) << 8) | (buffer[i] & 0xff));\n"
    "                                        sumSquares += (long) sample * (long) sample;\n"
    "                                    }\n"
    "                                    if (sampleCount > 0) {\n"
    "                                        double rms = Math.sqrt((double) sumSquares / (double) sampleCount) / 32768d;\n"
    "                                        float level = (float) Math.max(0d, Math.min(1d, rms * 8d));\n"
    "                                        try { levelListener.onLevel(level); } catch (Exception ignored) { }\n"
    "                                    }\n"
    "                                    lastLevelAt = now;\n"
    "                                }\n"
    "                            }\n"
    "                            stream.write(buffer, 0, read);\n"
    "                            stream.flush();",
    "pcm rms calculation",
)
pipe_path.write_text(pipe)


# Web assistant: a newer user turn invalidates a pending model/TTS turn. Stale
# model responses and stale TTS generations are never allowed to speak later.
voice_path = Path("components/CentralHubVoiceAssistant.tsx")
voice = voice_path.read_text()
voice = replace_once(
    voice,
    "  const cloudAudioUrlRef = useRef<string | null>(null);",
    "  const cloudAudioUrlRef = useRef<string | null>(null);\n"
    "  const turnGenerationRef = useRef(0);\n"
    "  const speechGenerationRef = useRef(0);",
    "generation refs",
)
voice = replace_once(
    voice,
    "  const stopSpeech = useCallback(() => {\n    if (speechVisualTimerRef.current)",
    "  const stopSpeech = useCallback(() => {\n"
    "    speechGenerationRef.current += 1;\n"
    "    if (speechVisualTimerRef.current)",
    "speech generation invalidation",
)
voice = replace_once(
    voice,
    "  useEffect(() => () => {\n    stopTracks();\n    stopSpeech();\n  }, [stopSpeech, stopTracks]);",
    "  const interruptPendingTurn = useCallback(() => {\n"
    "    turnGenerationRef.current += 1;\n"
    "    processingRef.current = false;\n"
    "    setProcessing(false);\n"
    "    stopSpeech();\n"
    "    setError('');\n"
    "  }, [stopSpeech]);\n\n"
    "  useEffect(() => () => {\n"
    "    turnGenerationRef.current += 1;\n"
    "    stopTracks();\n"
    "    stopSpeech();\n"
    "  }, [stopSpeech, stopTracks]);",
    "turn interruption helper",
)
voice = replace_once(
    voice,
    "    const bridge = getNativeBridge();\n    stopSpeech();\n    setSpeaking(true);",
    "    const bridge = getNativeBridge();\n"
    "    stopSpeech();\n"
    "    const speechGeneration = speechGenerationRef.current;\n"
    "    setSpeaking(true);",
    "speech generation capture",
)
voice = replace_once(
    voice,
    "        const speech = await invokeShruthiSpeech(text);\n        if (!speech.success || !speech.audioBase64)",
    "        const speech = await invokeShruthiSpeech(text);\n"
    "        if (speechGeneration !== speechGenerationRef.current) return;\n"
    "        if (!speech.success || !speech.audioBase64)",
    "stale tts guard",
)
voice = replace_once(
    voice,
    "  const runCommand = useCallback(async (text: string) => {\n"
    "    const clean = text.trim();\n"
    "    if (!clean || processingRef.current) return;\n"
    "    processingRef.current = true;",
    "  const runCommand = useCallback(async (text: string) => {\n"
    "    const clean = text.trim();\n"
    "    if (!clean) return;\n"
    "    const turnGeneration = ++turnGenerationRef.current;\n"
    "    processingRef.current = true;",
    "run command generation",
)
voice = replace_once(
    voice,
    "      if (await tryResumePendingBrowserQuestion(clean)) return;\n\n      const mode = inferMode(pathname, clean);",
    "      if (await tryResumePendingBrowserQuestion(clean)) return;\n"
    "      if (turnGeneration !== turnGenerationRef.current) return;\n\n"
    "      const mode = inferMode(pathname, clean);",
    "browser generation check",
)
voice = replace_once(
    voice,
    "      if (!result.success || !result.reply) throw new Error(result.error || 'Shruthi could not answer.');\n      setResponse(result);",
    "      if (turnGeneration !== turnGenerationRef.current) return;\n"
    "      if (!result.success || !result.reply) throw new Error(result.error || 'Shruthi could not answer.');\n"
    "      setResponse(result);",
    "model generation check",
)
voice = replace_once(
    voice,
    "    } catch (e: any) {\n"
    "      setError(e?.message || 'Shruthi failed.');\n"
    "      stopSpeech();\n"
    "    } finally {\n"
    "      processingRef.current = false;\n"
    "      setProcessing(false);\n"
    "    }\n"
    "  }, [pathname, speak, stopSpeech, tryResumePendingBrowserQuestion]);",
    "    } catch (e: any) {\n"
    "      if (turnGeneration !== turnGenerationRef.current) return;\n"
    "      setError(e?.message || 'Shruthi failed.');\n"
    "      stopSpeech();\n"
    "    } finally {\n"
    "      if (turnGeneration === turnGenerationRef.current) {\n"
    "        processingRef.current = false;\n"
    "        setProcessing(false);\n"
    "      }\n"
    "    }\n"
    "  }, [pathname, speak, stopSpeech, tryResumePendingBrowserQuestion]);",
    "stale command finish",
)
voice = replace_once(
    voice,
    "  const handleNativeTranscript = useCallback((rawText: string) => {\n"
    "    if (processingRef.current || recordingRef.current) return;",
    "  const handleNativeTranscript = useCallback((rawText: string) => {\n"
    "    if (recordingRef.current) return;\n"
    "    if (processingRef.current) interruptPendingTurn();",
    "native transcript can supersede processing",
)
voice = voice.replace(
    "  }, [chooseTheme, runCommand, setSession, speak]);",
    "  }, [chooseTheme, interruptPendingTurn, runCommand, setSession, speak]);",
    1,
)
voice = replace_once(
    voice,
    "    const onTranscript = (event: Event) => {\n"
    "      const text = String((event as NativeTranscriptEvent).detail?.text || '').trim();\n"
    "      if (text) handleNativeTranscript(text);\n"
    "    };\n"
    "    window.addEventListener('centralhub:tara-transcript', onTranscript as EventListener);\n"
    "    return () => {\n"
    "      window.removeEventListener('centralhub:tara-transcript', onTranscript as EventListener);\n"
    "      bridge?.setTaraEnabled?.(false);\n"
    "    };\n"
    "  }, [handleNativeTranscript]);",
    "    const onSpeechStart = () => {\n"
    "      if (noraSessionRef.current) interruptPendingTurn();\n"
    "    };\n"
    "    const onTranscript = (event: Event) => {\n"
    "      const text = String((event as NativeTranscriptEvent).detail?.text || '').trim();\n"
    "      if (text) handleNativeTranscript(text);\n"
    "    };\n"
    "    window.addEventListener('centralhub:tara-user-speech-start', onSpeechStart as EventListener);\n"
    "    window.addEventListener('centralhub:tara-transcript', onTranscript as EventListener);\n"
    "    return () => {\n"
    "      window.removeEventListener('centralhub:tara-user-speech-start', onSpeechStart as EventListener);\n"
    "      window.removeEventListener('centralhub:tara-transcript', onTranscript as EventListener);\n"
    "      bridge?.setTaraEnabled?.(false);\n"
    "    };\n"
    "  }, [handleNativeTranscript, interruptPendingTurn]);",
    "speech-start listener",
)
voice_path.write_text(voice)


# Native RMS should drive the visible waveform even in the always-listening mode.
enhancer_path = Path("components/ShruthiRealtimeVoiceEnhancer.tsx")
enhancer = enhancer_path.read_text()
enhancer = replace_once(
    enhancer,
    "type NativeTranscriptEvent = CustomEvent<{ text?: string; liveStable?: boolean }>;",
    "type NativeTranscriptEvent = CustomEvent<{ text?: string; liveStable?: boolean }>;\n"
    "type NativeRmsEvent = CustomEvent<{ level?: number }>;",
    "native rms type",
)
enhancer = replace_once(
    enhancer,
    "  const screen = document.querySelector<HTMLElement>('.nora-screen');\n"
    "  if (!screen) return;\n"
    "  const stopButton = screen.querySelector<HTMLButtonElement>('button[aria-label=\"Stop listening\"]');\n"
    "  if (!stopButton) return;\n\n"
    "  const bars = Array.from(screen.querySelectorAll<HTMLElement>('.nora-wavebar'));",
    "  const screen = document.querySelector<HTMLElement>('.nora-screen');\n"
    "  if (!screen) return;\n\n"
    "  const bars = Array.from(screen.querySelectorAll<HTMLElement>('.nora-wavebar'));",
    "always-listening waveform",
)
enhancer = replace_once(
    enhancer,
    "    const onClickCapture = (event: Event) => {\n"
    "      const target = event.target instanceof Element ? event.target.closest('button') : null;",
    "    const onNativeRms = (event: Event) => {\n"
    "      const level = Number((event as NativeRmsEvent).detail?.level ?? 0);\n"
    "      if (Number.isFinite(level)) setListeningBars(level);\n"
    "    };\n\n"
    "    const onClickCapture = (event: Event) => {\n"
    "      const target = event.target instanceof Element ? event.target.closest('button') : null;",
    "native rms handler",
)
enhancer = replace_once(
    enhancer,
    "    window.addEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);\n"
    "    document.addEventListener('click', onClickCapture, true);",
    "    window.addEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);\n"
    "    window.addEventListener('centralhub:tara-rms', onNativeRms as EventListener);\n"
    "    document.addEventListener('click', onClickCapture, true);",
    "rms attach",
)
enhancer = replace_once(
    enhancer,
    "      window.removeEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);\n"
    "      document.removeEventListener('click', onClickCapture, true);",
    "      window.removeEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);\n"
    "      window.removeEventListener('centralhub:tara-rms', onNativeRms as EventListener);\n"
    "      document.removeEventListener('click', onClickCapture, true);",
    "rms cleanup",
)
enhancer_path.write_text(enhancer)

print("Shruthi live-turn patch applied")
