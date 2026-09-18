package com.centralhub.network;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.os.SystemClock;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONObject;

final class ShruthiRealtimeVoiceClient {
    interface Listener {
        void onState(String state);
        void onUserTranscript(String text);
        void onAssistantTranscript(String text);
        void onError(String message);
    }
    private static final AtomicReference<ShruthiRealtimeVoiceClient> ACTIVE=new AtomicReference<>();
    private static final long SPEAKER_TAIL_GUARD_MS=1400L, MANUAL_INTERRUPT_GUARD_MS=250L;
    private static final int MAX_EVENT_IDS=512;
    private static final class PlaybackItem {
        final byte[] pcm; final String responseId; final boolean end;
        PlaybackItem(byte[] p,String r,boolean e){pcm=p;responseId=r;end=e;}
        static PlaybackItem audio(byte[] p){return new PlaybackItem(p,null,false);}
        static PlaybackItem end(String r){return new PlaybackItem(null,r,true);}
    }
    private static final class SessionSecret {
        final String value,model; SessionSecret(String v,String m){value=v;model=m;}
    }

    private final Context context;
    private final String accessToken,supabaseUrl,publishableKey;
    private final Listener listener;
    private final AudioManager audioManager;
    private final ExecutorService io=Executors.newCachedThreadPool();
    private final ScheduledExecutorService scheduler=Executors.newSingleThreadScheduledExecutor();
    private final OkHttpClient http=new OkHttpClient.Builder().connectTimeout(10,TimeUnit.SECONDS).readTimeout(0,TimeUnit.MILLISECONDS).pingInterval(15,TimeUnit.SECONDS).retryOnConnectionFailure(true).build();
    private final LinkedBlockingQueue<PlaybackItem> playbackQueue=new LinkedBlockingQueue<>();
    private final AtomicBoolean running=new AtomicBoolean(false), reconnectScheduled=new AtomicBoolean(false), assistantAudioActive=new AtomicBoolean(false), captureEnabled=new AtomicBoolean(true);
    private final AtomicInteger generation=new AtomicInteger(0);
    private final Set<String> blockedResponses=new LinkedHashSet<>(), seenEvents=new LinkedHashSet<>();
    private final ConcurrentLinkedQueue<String> pendingTextTurns=new ConcurrentLinkedQueue<>();

    private volatile WebSocket socket;
    private volatile AudioRecord recorder;
    private volatile AudioTrack player;
    private volatile AcousticEchoCanceler echoCanceler;
    private volatile NoiseSuppressor noiseSuppressor;
    private volatile Thread captureThread,playbackThread;
    private volatile boolean explicitlyClosed=false;
    private volatile boolean socketOpen=false;
    private volatile int reconnectAttempt=0,previousAudioMode=AudioManager.MODE_NORMAL;
    private volatile long suppressMicUntilMs=0L;
    private volatile String activeResponseId="",audioEventType="",transcriptEventType="";

    ShruthiRealtimeVoiceClient(Context c,String token,String url,String key,Listener l){
        context=c.getApplicationContext();accessToken=token;supabaseUrl=url.replaceAll("/+$","");publishableKey=key;listener=l;
        audioManager=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
    }
    void connect(){
        ShruthiRealtimeVoiceClient previous=ACTIVE.getAndSet(this); if(previous!=null&&previous!=this)previous.disconnect();
        if(running.getAndSet(true))return;
        explicitlyClosed=false;socketOpen=false;reconnectAttempt=0;reconnectScheduled.set(false);assistantAudioActive.set(false);captureEnabled.set(true);suppressMicUntilMs=0;resetResponseState();state("connecting");io.execute(this::openSession);
    }
    void disconnect(){
        explicitlyClosed=true;socketOpen=false;running.set(false);reconnectScheduled.set(false);generation.incrementAndGet();captureEnabled.set(false);assistantAudioActive.set(false);playbackQueue.clear();pendingTextTurns.clear();resetResponseState();cleanupAudio();
        WebSocket s=socket;socket=null;if(s!=null)s.close(1000,"Shruthi voice closed");ACTIVE.compareAndSet(this,null);state("idle");
    }
    void interrupt(){
        playbackQueue.clear();synchronized(blockedResponses){if(!activeResponseId.isEmpty())blockedResponses.add(activeResponseId);}
        activeResponseId="";audioEventType="";transcriptEventType="";assistantAudioActive.set(false);hardPauseMicrophone(true);suppressMicUntilMs=SystemClock.elapsedRealtime()+MANUAL_INTERRUPT_GUARD_MS;
        try{if(player!=null){player.pause();player.flush();player.play();}}catch(Exception ignored){}
        WebSocket s=socket;if(s!=null){s.send("{\"type\":\"response.cancel\"}");s.send("{\"type\":\"input_audio_buffer.clear\"}");}
        scheduler.schedule(()->{if(running.get()&&!explicitlyClosed){resumeMicrophoneAfterPlayback();state("listening");}},MANUAL_INTERRUPT_GUARD_MS,TimeUnit.MILLISECONDS);
    }
    void sendTextTurn(String rawText) {
        String text = rawText == null ? "" : rawText.trim();
        if (text.isEmpty() || !running.get() || explicitlyClosed) return;
        if (!socketOpen || socket == null) {
            pendingTextTurns.offer(text);
            return;
        }
        sendTextTurnNow(text);
    }

    private void sendTextTurnNow(String text) {
        WebSocket s = socket;
        if (s == null || !socketOpen) {
            pendingTextTurns.offer(text);
            return;
        }
        try {
            JSONObject item = new JSONObject()
                    .put("type", "message")
                    .put("role", "user")
                    .put("content", new org.json.JSONArray().put(new JSONObject().put("type", "input_text").put("text", text)));
            s.send(new JSONObject().put("type", "conversation.item.create").put("item", item).toString());
            s.send("{\"type\":\"response.create\"}");
            state("thinking");
        } catch (Exception error) {
            listener.onError(message(error, "Could not send Shruthi text turn"));
        }
    }

    private void flushPendingTextTurns() {
        String text;
        while ((text = pendingTextTurns.poll()) != null) sendTextTurnNow(text);
    }

    void release(){disconnect();io.shutdownNow();scheduler.shutdownNow();http.dispatcher().executorService().shutdown();}

    private void openSession(){
        int current=generation.incrementAndGet();
        try{
            ensureMicPermission();SessionSecret secret=requestClientSecret();if(!isCurrent(current))return;
            Request req=new Request.Builder().url("wss://api.openai.com/v1/realtime?model="+secret.model).header("Authorization","Bearer "+secret.value).build();
            WebSocket ws=http.newWebSocket(req,new SocketListener(current));if(!isCurrent(current)){ws.close(1000,"Stale Shruthi session");return;}socket=ws;
        }catch(Exception e){if(isCurrent(current))failOrReconnect(message(e,"Unable to start Shruthi voice"));}
    }
    private boolean isCurrent(int current){return running.get()&&!explicitlyClosed&&current==generation.get();}
    private void ensureMicPermission(){if(ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw new SecurityException("Microphone permission is required for Shruthi voice.");}
    private SessionSecret requestClientSecret() throws Exception{
        HttpURLConnection c=(HttpURLConnection)new URL(supabaseUrl+"/functions/v1/shruthi-realtime-session").openConnection();
        c.setRequestMethod("POST");c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setDoOutput(true);
        if(!publishableKey.isEmpty())c.setRequestProperty("apikey",publishableKey);
        c.setRequestProperty("Authorization","Bearer "+accessToken);c.setRequestProperty("Content-Type","application/json");
        try(OutputStream out=c.getOutputStream()){out.write("{}".getBytes(StandardCharsets.UTF_8));}
        try{
            int code=c.getResponseCode();InputStream in=code>=200&&code<300?c.getInputStream():c.getErrorStream();StringBuilder raw=new StringBuilder();
            if(in!=null)try(BufferedReader r=new BufferedReader(new InputStreamReader(in,StandardCharsets.UTF_8))){String line;while((line=r.readLine())!=null)raw.append(line);}
            if(code<200||code>=300)throw new IllegalStateException("Realtime session unavailable ("+code+")");
            JSONObject p=new JSONObject(raw.toString());String value=p.optString("value");
            if(value.isEmpty()&&p.optJSONObject("client_secret")!=null)value=p.optJSONObject("client_secret").optString("value");
            if(value.isEmpty())throw new IllegalStateException("Realtime session did not return a client secret");
            return new SessionSecret(value,p.optString("centralhub_model","gpt-realtime-1.5"));
        }finally{c.disconnect();}
    }

    private final class SocketListener extends WebSocketListener{
        private final int current;SocketListener(int c){current=c;}
        @Override public void onOpen(WebSocket w,Response r){if(!isCurrent(current)){w.close(1000,"Stale Shruthi session");return;}socketOpen=true;reconnectScheduled.set(false);reconnectAttempt=0;try{startAudio(current);state("listening");flushPendingTextTurns();}catch(Exception e){if(isCurrent(current))failOrReconnect(message(e,"Unable to start voice audio"));}}
        @Override public void onMessage(WebSocket w,String text){
            if(!isCurrent(current))return;
            try{
                JSONObject e=new JSONObject(text);if(!rememberEvent(e.optString("event_id")))return;String t=e.optString("type");
                switch(t){
                    case "input_audio_buffer.speech_started": if(micSuppressed()){w.send(new JSONObject().put("type","input_audio_buffer.clear").toString());return;}state("listening");break;
                    case "input_audio_buffer.speech_stopped": if(!micSuppressed())state("thinking");break;
                    case "conversation.item.input_audio_transcription.completed": if(!micSuppressed()){String s=e.optString("transcript").trim();if(!s.isEmpty())listener.onUserTranscript(s);}break;
                    case "response.output_audio.delta":case "response.audio.delta":handleAudioDelta(t,e);break;
                    case "response.output_audio_transcript.done":case "response.audio_transcript.done":handleAssistantTranscript(t,e);break;
                    case "response.done":
                        String id=e.optJSONObject("response")==null?"":e.optJSONObject("response").optString("id");
                        synchronized(blockedResponses){if(!id.isEmpty()&&blockedResponses.remove(id))return;}
                        if(!activeResponseId.isEmpty()&&!id.isEmpty()&&!id.equals(activeResponseId))return;
                        playbackQueue.offer(PlaybackItem.end(id.isEmpty()?activeResponseId:id));break;
                    case "error":JSONObject er=e.optJSONObject("error");listener.onError(er==null?"Shruthi Realtime reported an error.":er.optString("message","Shruthi Realtime reported an error."));break;
                }
            }catch(Exception ignored){}
        }
        @Override public void onFailure(WebSocket w,Throwable t,Response r){if(isCurrent(current))failOrReconnect(message(t,"Voice connection interrupted"));}
        @Override public void onClosed(WebSocket w,int code,String reason){if(isCurrent(current))failOrReconnect("Voice connection closed");}
    }
    private void handleAudioDelta(String type,JSONObject e){
        String id=e.optString("response_id");synchronized(blockedResponses){if(!id.isEmpty()&&blockedResponses.contains(id))return;}
        if(activeResponseId.isEmpty()&&!id.isEmpty())activeResponseId=id;else if(!activeResponseId.isEmpty()&&!id.isEmpty()&&!id.equals(activeResponseId)){synchronized(blockedResponses){blockedResponses.add(id);}return;}
        if(audioEventType.isEmpty())audioEventType=type;else if(!audioEventType.equals(type))return;
        String delta=e.optString("delta");if(delta.isEmpty())return;byte[] pcm;try{pcm=Base64.decode(delta,Base64.DEFAULT);}catch(Exception ex){return;}
        if(assistantAudioActive.compareAndSet(false,true))hardPauseMicrophone(true);state("speaking");playbackQueue.offer(PlaybackItem.audio(pcm));
    }
    private void handleAssistantTranscript(String type,JSONObject e){
        String id=e.optString("response_id");synchronized(blockedResponses){if(!id.isEmpty()&&blockedResponses.contains(id))return;}
        if(!activeResponseId.isEmpty()&&!id.isEmpty()&&!id.equals(activeResponseId))return;
        if(transcriptEventType.isEmpty())transcriptEventType=type;else if(!transcriptEventType.equals(type))return;
        String s=e.optString("transcript").trim();if(!s.isEmpty())listener.onAssistantTranscript(s);
    }
    private void startAudio(int current){
        ensureMicPermission();int rate=24000,inputMin=AudioRecord.getMinBufferSize(rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT),outputMin=AudioTrack.getMinBufferSize(rate,AudioFormat.CHANNEL_OUT_MONO,AudioFormat.ENCODING_PCM_16BIT);
        if(inputMin<=0||outputMin<=0)throw new IllegalStateException("24 kHz voice audio is not supported on this device");
        previousAudioMode=audioManager==null?AudioManager.MODE_NORMAL:audioManager.getMode();if(audioManager!=null)try{audioManager.setMode(AudioManager.MODE_NORMAL);}catch(Exception ignored){}
        AudioRecord r=createRecorder(rate,inputMin);recorder=r;
        if(AcousticEchoCanceler.isAvailable())try{echoCanceler=AcousticEchoCanceler.create(r.getAudioSessionId());if(echoCanceler!=null)echoCanceler.setEnabled(true);}catch(Exception ignored){}
        if(NoiseSuppressor.isAvailable())try{noiseSuppressor=NoiseSuppressor.create(r.getAudioSessionId());if(noiseSuppressor!=null)noiseSuppressor.setEnabled(true);}catch(Exception ignored){}
        AudioTrack p=new AudioTrack.Builder().setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setAudioFormat(new AudioFormat.Builder().setSampleRate(rate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build()).setTransferMode(AudioTrack.MODE_STREAM).setBufferSizeInBytes(Math.max(outputMin*2,8192)).build();
        if(p.getState()!=AudioTrack.STATE_INITIALIZED){p.release();cleanupAudio();throw new IllegalStateException("Unable to initialize voice playback");}player=p;p.play();r.startRecording();
        captureThread=new Thread(()->{byte[] b=new byte[2400];while(isCurrent(current)&&!Thread.currentThread().isInterrupted()){if(!captureEnabled.get()||micSuppressed()){sleep(20);continue;}AudioRecord a=recorder;if(a==null)break;if(a.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING){sleep(20);continue;}int n=a.read(b,0,b.length);if(n>0&&captureEnabled.get()&&!micSuppressed()){String audio=Base64.encodeToString(b,0,n,Base64.NO_WRAP);WebSocket s=socket;if(s!=null)s.send("{\"type\":\"input_audio_buffer.append\",\"audio\":\""+audio+"\"}");}}},"shruthi-realtime-capture");captureThread.setDaemon(true);captureThread.start();
        playbackThread=new Thread(()->{while(isCurrent(current)&&!Thread.currentThread().isInterrupted()){try{PlaybackItem item=playbackQueue.poll(150,TimeUnit.MILLISECONDS);if(item==null)continue;if(!item.end){AudioTrack a=player;if(a==null)break;a.write(item.pcm,0,item.pcm.length,AudioTrack.WRITE_BLOCKING);}else finishPlaybackAfterDrain(current,item.responseId);}catch(InterruptedException x){Thread.currentThread().interrupt();break;}}},"shruthi-realtime-playback");playbackThread.setDaemon(true);playbackThread.start();
    }
    private void finishPlaybackAfterDrain(int current,String id){suppressMicUntilMs=SystemClock.elapsedRealtime()+SPEAKER_TAIL_GUARD_MS;sleep(SPEAKER_TAIL_GUARD_MS);if(!isCurrent(current))return;if(id==null||activeResponseId.isEmpty()||id.equals(activeResponseId)){activeResponseId="";audioEventType="";transcriptEventType="";}assistantAudioActive.set(false);resumeMicrophoneAfterPlayback();state("listening");}
    private void hardPauseMicrophone(boolean clear){captureEnabled.set(false);try{if(recorder!=null&&recorder.getRecordingState()==AudioRecord.RECORDSTATE_RECORDING)recorder.stop();}catch(Exception ignored){}if(clear){WebSocket s=socket;if(s!=null)s.send("{\"type\":\"input_audio_buffer.clear\"}");}}
    private void resumeMicrophoneAfterPlayback(){if(!running.get()||explicitlyClosed)return;AudioRecord a=recorder;if(a==null)return;try{if(a.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING)a.startRecording();}catch(Exception e){failOrReconnect(message(e,"Unable to resume microphone audio"));return;}WebSocket s=socket;if(s!=null)s.send("{\"type\":\"input_audio_buffer.clear\"}");suppressMicUntilMs=0;captureEnabled.set(true);}
    private AudioRecord createRecorder(int rate,int min){AudioRecord r=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(min*2,4096));if(r.getState()==AudioRecord.STATE_INITIALIZED)return r;r.release();AudioRecord f=new AudioRecord(MediaRecorder.AudioSource.MIC,rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(min*2,4096));if(f.getState()!=AudioRecord.STATE_INITIALIZED){f.release();throw new IllegalStateException("Unable to initialize microphone audio");}return f;}
    private boolean micSuppressed(){return assistantAudioActive.get()||!captureEnabled.get()||SystemClock.elapsedRealtime()<suppressMicUntilMs;}
    private boolean rememberEvent(String id){if(id==null||id.isEmpty())return true;synchronized(seenEvents){if(!seenEvents.add(id))return false;if(seenEvents.size()>MAX_EVENT_IDS)seenEvents.remove(seenEvents.iterator().next());}return true;}
    private void resetResponseState(){activeResponseId="";audioEventType="";transcriptEventType="";synchronized(blockedResponses){blockedResponses.clear();}synchronized(seenEvents){seenEvents.clear();}}
    private void cleanupAudio(){Thread c=captureThread;captureThread=null;if(c!=null)c.interrupt();Thread p=playbackThread;playbackThread=null;if(p!=null)p.interrupt();playbackQueue.clear();try{if(echoCanceler!=null)echoCanceler.release();}catch(Exception ignored){}echoCanceler=null;try{if(noiseSuppressor!=null)noiseSuppressor.release();}catch(Exception ignored){}noiseSuppressor=null;try{if(recorder!=null)recorder.stop();}catch(Exception ignored){}try{if(recorder!=null)recorder.release();}catch(Exception ignored){}recorder=null;try{if(player!=null)player.pause();}catch(Exception ignored){}try{if(player!=null)player.flush();}catch(Exception ignored){}try{if(player!=null)player.release();}catch(Exception ignored){}player=null;if(audioManager!=null)try{audioManager.setMode(previousAudioMode);}catch(Exception ignored){}}
    private void failOrReconnect(String msg){if(explicitlyClosed||!running.get()||!reconnectScheduled.compareAndSet(false,true))return;generation.incrementAndGet();resetResponseState();assistantAudioActive.set(false);captureEnabled.set(false);cleanupAudio();WebSocket failed=socket;socket=null;if(failed!=null)failed.cancel();reconnectAttempt++;if(reconnectAttempt>4){running.set(false);reconnectScheduled.set(false);ACTIVE.compareAndSet(this,null);state("error");listener.onError(msg+". Tap the microphone to reconnect.");return;}state("reconnecting");long delay=Math.min(2800L,350L<<(reconnectAttempt-1));scheduler.schedule(()->{reconnectScheduled.set(false);captureEnabled.set(true);if(running.get()&&!explicitlyClosed)openSession();},delay,TimeUnit.MILLISECONDS);}
    private void state(String v){try{listener.onState(v);}catch(Exception ignored){}}
    private static void sleep(long ms){try{Thread.sleep(ms);}catch(InterruptedException e){Thread.currentThread().interrupt();}}
    private static String message(Throwable e,String fallback){String m=e==null?"":e.getMessage();return m==null||m.trim().isEmpty()?fallback:m.trim();}
}
