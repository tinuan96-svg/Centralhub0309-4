'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { uploadReleaseArtifactResumable, type ResumableUploadProgress } from '@/lib/storage/resumableUpload';

type Store = { id: string; name: string; slug?: string | null };
type AppRow = {
  id: string;
  store_id: string;
  platform: 'android' | 'ios' | string;
  package_identifier: string;
  display_name: string | null;
  status: string;
  metadata?: Record<string, any>;
};
type Release = {
  id: string;
  app_id: string;
  store_id: string;
  platform: string;
  provider_id: string;
  version_name: string | null;
  build_number: string | null;
  release_notes: string | null;
  artifact_file_name: string;
  artifact_path: string;
  artifact_size: number | null;
  status: string;
  target_track: string | null;
  rollout_fraction: number | null;
  last_error: string | null;
  created_at: string;
  published_at: string | null;
};
type ProviderConfig = {
  provider_id: string;
  status: string;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  public_config?: Record<string, any>;
};

type Overview = {
  success: boolean;
  apps: AppRow[];
  releases: Release[];
  configs: ProviderConfig[];
  error?: string;
};

const MAX_RELEASE_BYTES = 1024 * 1024 * 1024;
const providerLabel = (id: string) => id === 'google_play' ? 'Google Play' : id === 'app_store_connect' ? 'App Store Connect' : id;
const expectedProvider = (platform: string) => platform === 'ios' ? 'app_store_connect' : 'google_play';
const safeReleaseFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 160);

export default function AppReleasesPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [overview, setOverview] = useState<Overview>({ success: true, apps: [], releases: [], configs: [] });
  const [appId, setAppId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [versionName, setVersionName] = useState('');
  const [buildNumber, setBuildNumber] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [targetTrack, setTargetTrack] = useState('internal');
  const [rolloutPercent, setRolloutPercent] = useState(100);
  const [productionConfirmation, setProductionConfirmation] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [uploadProgress, setUploadProgress] = useState<ResumableUploadProgress | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error: invokeError } = await supabase.functions.invoke('app-release-manager', { body });
    if (invokeError) throw new Error(invokeError.message || 'App release manager request failed');
    if (!data?.success) throw new Error(data?.error || 'App release manager rejected the request');
    return data;
  }, []);

  const loadOverview = useCallback(async (selectedStoreId: string) => {
    if (!selectedStoreId) {
      setOverview({ success: true, apps: [], releases: [], configs: [] });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await invoke({ action: 'overview', storeId: selectedStoreId });
      const next: Overview = {
        success: true,
        apps: data.apps || [],
        releases: data.releases || [],
        configs: data.configs || [],
      };
      setOverview(next);
      setAppId(current => next.apps.some(app => app.id === current) ? current : (next.apps[0]?.id || ''));
    } catch (e: any) {
      setError(e?.message || 'Could not load release controls.');
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error: storesError } = await supabase.from('stores').select('id,name,slug').order('name');
      if (storesError) {
        setError(storesError.message);
        setLoading(false);
        return;
      }
      const rows = (data || []) as Store[];
      setStores(rows);
      const first = rows[0]?.id || '';
      setStoreId(first);
      if (first) await loadOverview(first);
      else setLoading(false);
    })();
  }, [loadOverview]);

  const selectedApp = useMemo(() => overview.apps.find(app => app.id === appId) || null, [overview.apps, appId]);
  const providerId = selectedApp ? expectedProvider(selectedApp.platform) : '';
  const provider = overview.configs.find(config => config.provider_id === providerId);
  const providerReady = provider?.last_test_status === 'passed';
  const publishingBlocked = selectedApp?.status === 'needs_native_sync' || selectedApp?.metadata?.publishing_enabled === false;
  const recentReleases = overview.releases.filter(release => !appId || release.app_id === appId);

  const onStoreChange = async (nextStoreId: string) => {
    setStoreId(nextStoreId);
    setAppId('');
    setFile(null);
    setUploadProgress(null);
    setMessage('');
    setError('');
    await loadOverview(nextStoreId);
  };

  const stageRelease = async () => {
    if (!storeId || !selectedApp || !file) {
      setError('Choose a store, app and release file first.');
      return;
    }
    if (selectedApp.platform === 'android' && !file.name.toLowerCase().endsWith('.aab')) {
      setError('Android releases must use an Android App Bundle (.aab).');
      return;
    }
    if (selectedApp.platform === 'ios' && !file.name.toLowerCase().endsWith('.ipa')) {
      setError('iOS releases must use an .ipa file.');
      return;
    }
    if (selectedApp.platform === 'ios' && (!versionName.trim() || !buildNumber.trim())) {
      setError('iOS releases require both version and build number.');
      return;
    }
    if (!file.size || file.size > MAX_RELEASE_BYTES) {
      setError(`Release files must be between 1 byte and ${formatBytes(MAX_RELEASE_BYTES)}.`);
      return;
    }

    setBusy('stage');
    setUploadProgress({ bytesUploaded: 0, bytesTotal: file.size, percent: 0, resumed: false });
    setMessage('');
    setError('');
    try {
      const safeName = safeReleaseFileName(file.name);
      const matchingPending = overview.releases.find(release =>
        release.app_id === selectedApp.id &&
        release.status === 'upload_pending' &&
        release.artifact_file_name === safeName &&
        Number(release.artifact_size || 0) === file.size &&
        (release.version_name || '') === versionName.trim() &&
        (release.build_number || '') === buildNumber.trim()
      );

      let release: Release;
      let bucket = 'app-release-artifacts';

      if (matchingPending) {
        release = matchingPending;
        try {
          await invoke({ action: 'mark_uploaded', storeId, releaseId: release.id });
          setUploadProgress({ bytesUploaded: file.size, bytesTotal: file.size, percent: 100, resumed: true });
          setMessage('The previously uploaded release file was already complete. CentralHub recovered it and staged it as Ready.');
          setFile(null);
          await loadOverview(storeId);
          return;
        } catch (recoveryError: any) {
          const recoveryMessage = String(recoveryError?.message || '');
          if (!recoveryMessage.toLowerCase().includes('not found')) throw recoveryError;
        }
      } else {
        const created = await invoke({
          action: 'create',
          storeId,
          appId: selectedApp.id,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || 'application/octet-stream',
          versionName: versionName.trim(),
          buildNumber: buildNumber.trim(),
          releaseNotes: releaseNotes.trim(),
          targetTrack: selectedApp.platform === 'android' ? targetTrack : undefined,
          rolloutFraction: selectedApp.platform === 'android' ? Math.max(0.01, Math.min(1, rolloutPercent / 100)) : undefined,
        });
        release = created.release as Release;
        bucket = created.bucket || bucket;
      }

      await uploadReleaseArtifactResumable({
        bucket,
        objectPath: release.artifact_path,
        file,
        contentType: file.type || 'application/octet-stream',
        onProgress: setUploadProgress,
      });

      await invoke({ action: 'mark_uploaded', storeId, releaseId: release.id });
      setMessage('Release file uploaded with resumable transfer and staged as Ready. Nothing has been submitted to an app store yet.');
      setFile(null);
      await loadOverview(storeId);
    } catch (e: any) {
      setError(e?.message || 'Could not stage the release. The pending release is preserved so the same file can resume instead of starting over.');
      await loadOverview(storeId).catch(() => undefined);
    } finally {
      setBusy('');
    }
  };

  const releaseAction = async (release: Release, action: 'publish_google' | 'publish_apple' | 'refresh' | 'cancel') => {
    setBusy(`${action}:${release.id}`);
    setMessage('');
    setError('');
    try {
      const body: Record<string, unknown> = { action, storeId, releaseId: release.id };
      if (action === 'publish_google') body.confirmation = release.target_track === 'production' ? productionConfirmation.trim() : '';
      await invoke(body);
      setMessage(action === 'cancel' ? 'Release cancelled.' : action === 'refresh' ? 'Release status refreshed.' : 'Release submitted to the configured app-store provider.');
      if (action === 'publish_google') setProductionConfirmation('');
      await loadOverview(storeId);
    } catch (e: any) {
      setError(e?.message || 'Release action failed.');
    } finally {
      setBusy('');
    }
  };

  return <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-6">
    <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-[.2em] text-cyan-400 font-black">App operations</div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-100 mt-1">App Release Manager</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl">Upload a signed app build, stage it privately, verify the connector, and only then submit it to Google Play or App Store Connect. Uploading never publishes automatically.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/marketing/apps" className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-sm">App analytics</Link>
        <Link href="/marketing/integrations" className="px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-sm font-bold">Provider connections</Link>
        <button onClick={() => loadOverview(storeId)} disabled={!storeId || loading || busy === 'stage'} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-sm disabled:opacity-50">Refresh</button>
      </div>
    </div>

    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
      <span className="font-black">Safety rule:</span> CentralHub stages files first. A separate Publish action is required. Google Play production also requires typing <span className="font-mono font-bold">PUBLISH</span> before submission.
    </div>

    {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 text-sm">{error}</div>}
    {message && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300 text-sm">{message}</div>}

    <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-5">
      <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Store</span>
          <select value={storeId} onChange={e => onStoreChange(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100" disabled={busy === 'stage'}>
            <option value="">Select store</option>
            {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Registered app</span>
          <select value={appId} onChange={e => { setAppId(e.target.value); setFile(null); setUploadProgress(null); setMessage(''); }} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100" disabled={!overview.apps.length || busy === 'stage'}>
            {!overview.apps.length && <option value="">No registered apps for this store</option>}
            {overview.apps.map(app => <option key={app.id} value={app.id}>{app.display_name || app.package_identifier} · {app.platform}</option>)}
          </select>
        </label>
      </div>

      {selectedApp && <div className="grid lg:grid-cols-3 gap-3">
        <Info label="App identity" value={selectedApp.package_identifier} />
        <Info label="Platform" value={selectedApp.platform} />
        <Info label="Publishing provider" value={providerLabel(providerId)} />
      </div>}

      {selectedApp && <div className={`rounded-xl border p-4 text-sm ${providerReady ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
        <div className="font-black">{providerReady ? `${providerLabel(providerId)} connector tested and ready` : `${providerLabel(providerId)} is not ready for publishing`}</div>
        <div className="text-xs mt-1 opacity-80">{providerReady ? `Last successful test: ${provider?.last_test_at ? new Date(provider.last_test_at).toLocaleString() : 'recorded'}` : provider?.last_test_error || 'Add the store-specific credentials in Provider Connections and run a successful test before publishing.'}</div>
      </div>}

      {publishingBlocked && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        {String(selectedApp?.metadata?.blocking_reason || 'Publishing is blocked until this app identity/native project is synchronized.')}
      </div>}

      <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Version name</span>
          <input value={versionName} onChange={e => setVersionName(e.target.value)} placeholder="e.g. 1.4.0" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100" disabled={busy === 'stage'} />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Build number {selectedApp?.platform === 'ios' ? '(required)' : '(optional)'}</span>
          <input value={buildNumber} onChange={e => setBuildNumber(e.target.value)} placeholder="e.g. 104" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100" disabled={busy === 'stage'} />
        </label>
      </div>

      {selectedApp?.platform === 'android' && <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Target track</span>
          <select value={targetTrack} onChange={e => setTargetTrack(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100" disabled={busy === 'stage'}>
            <option value="internal">Internal testing</option>
            <option value="alpha">Alpha</option>
            <option value="beta">Beta</option>
            <option value="production">Production</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Rollout %</span>
          <input type="number" min={1} max={100} value={rolloutPercent} onChange={e => setRolloutPercent(Number(e.target.value) || 1)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100" disabled={busy === 'stage'} />
        </label>
      </div>}

      <label className="block">
        <span className="block text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Release notes</span>
        <textarea value={releaseNotes} onChange={e => setReleaseNotes(e.target.value)} rows={3} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100" placeholder="What changed in this version?" disabled={busy === 'stage'} />
      </label>

      <label className="block">
        <span className="block text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Signed release file</span>
        <input type="file" accept={selectedApp?.platform === 'ios' ? '.ipa' : '.aab'} onChange={e => { setFile(e.target.files?.[0] || null); setUploadProgress(null); }} className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-2.5 file:text-slate-200" disabled={busy === 'stage'} />
        <p className="text-xs text-slate-600 mt-2">{selectedApp?.platform === 'ios' ? 'Use a signed .ipa.' : 'Use a signed Android App Bundle (.aab).'} Uploads use resumable 6 MB chunks with automatic retry; selecting the same file can resume an interrupted upload. Maximum size: {formatBytes(MAX_RELEASE_BYTES)}.</p>
      </label>

      {uploadProgress && <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-bold text-cyan-200">{uploadProgress.resumed ? 'Resumable upload recovered' : 'Resumable upload'}</span>
          <span className="text-cyan-300 tabular-nums">{uploadProgress.percent.toFixed(1)}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-cyan-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, uploadProgress.percent))}%` }} /></div>
        <div className="text-[11px] text-slate-500">{formatBytes(uploadProgress.bytesUploaded)} of {formatBytes(uploadProgress.bytesTotal)} uploaded</div>
      </div>}

      <div className="flex justify-end">
        <button onClick={stageRelease} disabled={!file || !selectedApp || Boolean(publishingBlocked) || busy === 'stage'} className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black disabled:opacity-40">
          {busy === 'stage' ? `Uploading ${uploadProgress?.percent?.toFixed(1) || '0.0'}%…` : 'Upload & Stage Release'}
        </button>
      </div>
    </section>

    <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div><h2 className="text-lg font-black text-slate-100">Release queue</h2><p className="text-xs text-slate-500 mt-1">Staged and submitted releases for the selected app.</p></div>
        <span className="text-xs text-slate-500">{recentReleases.length} release{recentReleases.length === 1 ? '' : 's'}</span>
      </div>

      {loading ? <div className="py-10 text-center text-slate-500">Loading releases…</div> : !recentReleases.length ? <div className="py-10 text-center text-slate-600">No releases staged yet.</div> : <div className="space-y-3">
        {recentReleases.map(release => {
          const config = overview.configs.find(item => item.provider_id === release.provider_id);
          const canPublish = ['ready', 'failed'].includes(release.status) && config?.last_test_status === 'passed';
          const isProductionGoogle = release.provider_id === 'google_play' && release.target_track === 'production';
          const publishAction = release.provider_id === 'google_play' ? 'publish_google' : 'publish_apple';
          return <div key={release.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap"><span className="font-bold text-slate-200">{release.artifact_file_name}</span><Status value={release.status} /></div>
                <div className="text-xs text-slate-500 mt-1">{providerLabel(release.provider_id)} · {release.version_name || 'version pending'}{release.build_number ? ` (${release.build_number})` : ''}{release.target_track ? ` · ${release.target_track}` : ''} · {new Date(release.created_at).toLocaleString()}</div>
                {release.status === 'upload_pending' && <div className="text-xs text-cyan-300 mt-2">Upload is pending. Re-select the same signed file above to resume safely.</div>}
                {release.last_error && <div className="text-xs text-rose-300 mt-2">{release.last_error}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => releaseAction(release, 'refresh')} disabled={Boolean(busy)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs disabled:opacity-40">Refresh status</button>
                {!['publishing', 'processing', 'submitted', 'released', 'cancelled'].includes(release.status) && <button onClick={() => releaseAction(release, 'cancel')} disabled={Boolean(busy)} className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs disabled:opacity-40">Cancel</button>}
              </div>
            </div>

            {isProductionGoogle && canPublish && <label className="block max-w-sm">
              <span className="block text-[10px] uppercase tracking-widest font-black text-amber-400 mb-1">Type PUBLISH for production</span>
              <input value={productionConfirmation} onChange={e => setProductionConfirmation(e.target.value)} className="w-full bg-slate-950 border border-amber-500/30 rounded-lg px-3 py-2 text-sm text-white" placeholder="PUBLISH" />
            </label>}

            {['ready', 'failed'].includes(release.status) && <div className="flex items-center justify-between gap-3 flex-wrap border-t border-slate-800 pt-3">
              <div className="text-xs text-slate-500">{canPublish ? 'Provider connector passed its latest test. Publishing remains manual.' : 'Publishing is locked until this store connector passes its test.'}</div>
              <button
                onClick={() => releaseAction(release, publishAction)}
                disabled={!canPublish || Boolean(busy) || (isProductionGoogle && productionConfirmation.trim() !== 'PUBLISH')}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black disabled:opacity-40"
              >
                {busy === `${publishAction}:${release.id}` ? 'Submitting…' : `Publish to ${providerLabel(release.provider_id)}`}
              </button>
            </div>}
          </div>;
        })}
      </div>}
    </section>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3"><div className="text-[9px] uppercase tracking-widest text-slate-600 font-black">{label}</div><div className="text-sm text-slate-200 mt-1 break-all">{value}</div></div>;
}

function Status({ value }: { value: string }) {
  const good = ['ready', 'submitted', 'released', 'succeeded'].includes(value);
  const warn = ['upload_pending', 'publishing', 'processing', 'queued', 'running'].includes(value);
  return <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border ${good ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : warn ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>{value.replaceAll('_', ' ')}</span>;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const amount = value / Math.pow(1024, index);
  return `${amount >= 100 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}
