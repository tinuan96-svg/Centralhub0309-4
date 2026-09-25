'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

type Provider = {
  id: 'vat' | 'paye' | 'corporation_tax' | 'companies_house';
  name: string;
  protocol: string;
  required: string[];
  missing: string[];
  configured: boolean;
  status: 'awaiting_credentials' | 'credentials_present_untested';
  diagnostic: 'vat_application' | 'companies_house_company_read' | null;
  nextStep: string;
};
type Readiness = { sandboxOnly: boolean; liveFilingEnabled: boolean; providers: Provider[] };
type DiagnosticResult = { passed?: boolean; note?: string; error?: string };

export default function TaxSandboxPanel() {
  const { isAdmin } = useAuth();
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTest, setActiveTest] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const request = useCallback(async (method: 'GET' | 'POST', diagnostic?: string) => {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) throw new Error('Sign in to CentralHub again.');
    const response = await fetch('/api/finance/tax-sandbox', {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify({ diagnostic }) } : {}),
    });
    const payload: Readiness & DiagnosticResult = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Sandbox service unavailable');
    return payload;
  }, []);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    try { setReadiness(await request('GET')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Sandbox status unavailable'); }
    finally { setLoading(false); }
  }, [isAdmin, request]);

  useEffect(() => { void refresh(); }, [refresh]);
  if (!isAdmin) return null;

  const test = async (provider: Provider) => {
    if (!provider.configured || !provider.diagnostic || activeTest) return;
    setActiveTest(provider.id);
    setMessage(previous => ({ ...previous, [provider.id]: '' }));
    try {
      const result = await request('POST', provider.diagnostic);
      setMessage(previous => ({ ...previous, [provider.id]: result.note || 'Sandbox diagnostic complete.' }));
    } catch (cause) {
      setMessage(previous => ({ ...previous, [provider.id]: cause instanceof Error ? cause.message : 'Sandbox diagnostic unavailable' }));
    } finally { setActiveTest(null); }
  };

  return (
    <section id="tax-sandbox-setup" aria-labelledby="tax-sandbox-title" className="rounded-2xl border border-cyan-500/20 bg-slate-900/50 p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1">
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-amber-200">Internal setup · Sandbox only</span>
          <h2 id="tax-sandbox-title" className="text-xl font-black text-white">Tax integration readiness</h2>
          <p className="text-xs leading-5 text-slate-400">Super Admin only. Add test credentials as private Netlify environment variables. A configured field is not a successful API test or an HMRC approval.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-50">{loading ? 'Checking…' : 'Refresh status'}</button>
      </div>
      <p className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">Live VAT, PAYE, CT600 and Companies House filing remain disabled. No credentials are entered or displayed in this screen.</p>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      {readiness && <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {readiness.providers.map(provider => (
          <article key={provider.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h3 className="text-sm font-bold text-slate-100">{provider.name}</h3><p className="text-[11px] text-slate-500">{provider.protocol}</p></div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${provider.configured ? 'bg-cyan-500/10 text-cyan-300' : 'bg-amber-500/10 text-amber-200'}`}>
                {provider.configured ? 'Credentials detected · Not tested' : 'Awaiting test credentials'}
              </span>
            </div>
            {provider.missing.length > 0 && <div className="space-y-1"><p className="text-xs text-slate-400">Missing private environment variables:</p>
              <div className="flex flex-wrap gap-1">{provider.missing.map(variable => <code key={variable} className="break-all rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300">{variable}</code>)}</div>
            </div>}
            <p className="text-xs leading-5 text-slate-400">{provider.nextStep}</p>
            {provider.diagnostic ? <button type="button" disabled={!provider.configured || !!activeTest} onClick={() => void test(provider)} className="rounded-lg border border-cyan-500/40 px-3 py-2 text-xs font-bold text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">{activeTest === provider.id ? 'Testing…' : provider.id === 'vat' ? 'Test sandbox application' : 'Test sandbox company lookup'}</button> :
              <p className="text-xs font-medium text-amber-200">XML test submission is not available in this setup screen.</p>}
            {message[provider.id] && <p role="status" className="text-xs leading-5 text-slate-200">{message[provider.id]}</p>}
          </article>
        ))}
      </div>}
      <p className="text-[11px] leading-5 text-slate-500">Sandbox checks are initiated manually by the Super Admin. Each provider requires its own registration, authorisation, testing and approval before any live filing can be developed or enabled.</p>
    </section>
  );
}
