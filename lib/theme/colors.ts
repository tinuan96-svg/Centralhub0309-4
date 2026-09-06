export const theme = {
  colors: {
    background: {
      primary: 'from-slate-950 via-slate-900 to-slate-950',
      card: 'bg-slate-900/50',
      cardHover: 'bg-slate-800/50',
      overlay: 'bg-slate-950/95',
    },
    border: {
      default: 'border-slate-800/50',
      hover: 'border-cyan-500/30',
      active: 'border-cyan-500/50',
    },
    text: {
      primary: 'text-slate-100',
      secondary: 'text-slate-400',
      muted: 'text-slate-500',
      accent: 'text-cyan-400',
    },
    gradient: {
      primary: 'from-cyan-500 via-blue-600 to-purple-600',
      accent: 'from-cyan-400 via-blue-400 to-purple-400',
    },
  },
  spacing: {
    page: 'p-8',
    card: 'p-6',
    section: 'space-y-8',
  },
  borderRadius: {
    card: 'rounded-2xl',
    button: 'rounded-lg',
    input: 'rounded-lg',
  },
  shadows: {
    card: 'shadow-2xl shadow-cyan-500/5',
    cardHover: 'shadow-2xl shadow-cyan-500/10',
  },
};

export const getMetricCardClasses = (variant: 'cyan' | 'emerald' | 'rose' | 'orange' | 'blue' | 'purple' = 'cyan', hasAlert: boolean = false) => {
  const variants = {
    cyan: hasAlert
      ? 'bg-gradient-to-br from-cyan-900/30 to-slate-900/50 border-cyan-500/30 hover:border-cyan-500/50 hover:shadow-cyan-500/20'
      : 'bg-slate-900/50 border-slate-800/50 hover:border-slate-700/50',
    emerald: hasAlert
      ? 'bg-gradient-to-br from-emerald-900/30 to-slate-900/50 border-emerald-500/30 hover:border-emerald-500/50 hover:shadow-emerald-500/20'
      : 'bg-slate-900/50 border-slate-800/50 hover:border-slate-700/50',
    rose: hasAlert
      ? 'bg-gradient-to-br from-rose-900/30 to-slate-900/50 border-rose-500/30 hover:border-rose-500/50 hover:shadow-rose-500/20'
      : 'bg-slate-900/50 border-slate-800/50 hover:border-slate-700/50',
    orange: hasAlert
      ? 'bg-gradient-to-br from-orange-900/30 to-slate-900/50 border-orange-500/30 hover:border-orange-500/50 hover:shadow-orange-500/20'
      : 'bg-slate-900/50 border-slate-800/50 hover:border-slate-700/50',
    blue: hasAlert
      ? 'bg-gradient-to-br from-blue-900/30 to-slate-900/50 border-blue-500/30 hover:border-blue-500/50 hover:shadow-blue-500/20'
      : 'bg-slate-900/50 border-slate-800/50 hover:border-slate-700/50',
    purple: hasAlert
      ? 'bg-gradient-to-br from-purple-900/30 to-slate-900/50 border-purple-500/30 hover:border-purple-500/50 hover:shadow-purple-500/20'
      : 'bg-slate-900/50 border-slate-800/50 hover:border-slate-700/50',
  };

  return `group relative rounded-2xl backdrop-blur-xl border ${variants[variant]} hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]`;
};
