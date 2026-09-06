import { SyncState } from "@/lib/types";

interface SyncStatusBadgeProps {
  state: SyncState | null;
}

export default function SyncStatusBadge({ state }: SyncStatusBadgeProps) {
  if (!state) return null;

  const config = {
    idle: { label: 'Idle', classes: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
    syncing: { label: 'Syncing', classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse' },
    synced: { label: 'Synced', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    error: { label: 'Error', classes: 'bg-red-500/10 text-red-400 border-red-500/20' },
    failed: { label: 'Failed', classes: 'bg-amber-500/10 text-red-400 border-red-500/20' },
    pending: { label: 'Pending', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
  };

  const { label, classes } = config[state as keyof typeof config] || config.idle;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${classes}`}>
      {label}
    </span>
  );
}
