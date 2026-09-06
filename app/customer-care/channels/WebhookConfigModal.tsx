'use client';

import { useState } from 'react';
import { WhatsAppChannel, channelService } from '@/lib/services/customer-care/channelService';
import { designTokens, Button, Badge } from '@/lib/design-system';

interface Props {
  channel: WhatsAppChannel;
  onClose: () => void;
}

export default function WebhookConfigModal({ channel, onClose }: Props) {
  const webhookUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
  const [verifyToken, setVerifyToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (verifyToken.trim()) {
        await channelService.updateVerifyToken(channel.id, verifyToken.trim());
      }
      if (appSecret.trim()) {
        await channelService.updateAppSecret(channel.id, appSecret.trim());
      }
      setSuccess('Configuration saved successfully. The App Secret is stored server-side and will never be shown again.');
      setAppSecret('');
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!verifyToken.trim()) {
      setError('Enter a verify token before testing.');
      return;
    }
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const result = await channelService.testWebhook(webhookUrl, verifyToken.trim());
      if (result.verified) {
        setTestResult({ ok: true, message: 'Webhook verification successful! Meta can reach this endpoint.' });
      } else {
        setTestResult({ ok: false, message: `Webhook responded with status ${result.status}: ${result.body}` });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || 'Failed to test webhook.' });
    } finally {
      setTesting(false);
    }
  };

  const inputClasses = `${designTokens.colors.background.cardSolid} border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 w-full`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#161B22] border border-[#30363D] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#30363D]">
          <div>
            <h2 className="text-xl font-bold text-white">Configure Webhook</h2>
            <p className="text-sm text-slate-400 mt-1">{channel.store?.name || 'WhatsApp Channel'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-2xl leading-none">
            &times;
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-sm text-green-400">
              {success}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
              <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Store</label>
              <span className="text-sm text-blue-400 font-medium">{channel.store?.name || 'Unlinked'}</span>
            </div>
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
              <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">WhatsApp Phone</label>
              <span className="text-sm text-slate-300">{channel.display_phone_number || 'N/A'}</span>
            </div>
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
              <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Phone Number ID</label>
              <span className="text-xs text-slate-300 font-mono">{channel.phone_number_id || 'N/A'}</span>
            </div>
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
              <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">WABA ID</label>
              <span className="text-xs text-slate-300 font-mono">{channel.waba_id || 'N/A'}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Webhook URL</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-slate-950/50 border border-slate-800/50 rounded-lg px-3 py-2 text-xs text-green-400 font-mono break-all">
                {webhookUrl}
              </code>
              <Button
                variant="secondary"
                className="text-xs whitespace-nowrap shrink-0"
                onClick={() => handleCopy(webhookUrl, 'url')}
              >
                {copied === 'url' ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <p className="text-[10px] text-slate-500">
              Paste this URL into Meta WhatsApp Manager &gt; Configuration &gt; Callback URL.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Webhook Verify Token</label>
            <div className="flex items-center gap-2">
              <input
                type={showToken ? 'text' : 'password'}
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder="Enter verify token"
                className={inputClasses}
                autoComplete="off"
              />
              <Button
                variant="secondary"
                className="text-xs whitespace-nowrap shrink-0"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? 'Hide' : 'Show'}
              </Button>
              <Button
                variant="secondary"
                className="text-xs whitespace-nowrap shrink-0"
                onClick={() => handleCopy(verifyToken, 'token')}
                disabled={!verifyToken}
              >
                {copied === 'token' ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <p className="text-[10px] text-slate-500">
              Enter the same token in Meta WhatsApp Manager &gt; Configuration &gt; Verify Token.
              Stored securely in the database, used only for webhook verification.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Meta App Secret (Server-Side Only)</label>
            <div className="flex items-center gap-2">
              <input
                type={showSecret ? 'text' : 'password'}
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="Enter Meta App Secret (never displayed after saving)"
                className={inputClasses}
                autoComplete="off"
              />
              <Button
                variant="secondary"
                className="text-xs whitespace-nowrap shrink-0"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? 'Hide' : 'Show'}
              </Button>
            </div>
            <p className="text-[10px] text-slate-500">
              Used server-side only by the webhook edge function to verify Meta request signatures.
              After saving, this value is never returned to the browser. Enter it once here to configure.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Webhook Status:</span>
            <Badge variant={channel.status === 'active' ? 'success' : 'warning'} className="uppercase text-[10px]">
              {channel.status === 'active' ? 'Configured' : 'Not Configured'}
            </Badge>
          </div>

          {testResult && (
            <div className={`rounded-lg p-3 text-sm border ${testResult.ok ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
              {testResult.message}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-[#30363D]">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={handleTest} disabled={testing || !verifyToken.trim()}>
            {testing ? 'Testing...' : 'Test Webhook'}
          </Button>
          <Button onClick={handleSave} disabled={saving || (!verifyToken.trim() && !appSecret.trim())}>
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </div>
    </div>
  );
}