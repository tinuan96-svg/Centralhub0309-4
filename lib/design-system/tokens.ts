export const designTokens = {
  colors: {
    gradient: {
      primary: 'bg-gradient-to-r from-blue-500 to-purple-600',
      primaryHover: 'hover:from-blue-600 hover:to-purple-700',
      text: 'bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent',
    },
    background: {
      main: 'bg-[#0D1117]',
      secondary: 'bg-[#161B22]',
      card: 'bg-[#161B22]',
      cardSolid: 'bg-[#161B22]',
      overlay: 'bg-[#161B22]/95',
      hover: 'hover:bg-[#21262D]',
    },
    border: {
      default: 'border-[#30363D]',
      hover: 'hover:border-slate-600',
      focus: 'focus:border-blue-500',
      separator: 'border-[#30363D]',
    },
    text: {
      primary: 'text-white',
      secondary: 'text-[#C9D1D9]',
      muted: 'text-[#8B949E]',
    },
    status: {
      success: 'text-emerald-300',
      successBg: 'bg-[#2EA043]/15',
      successBorder: 'border-[#2EA043]/30',
      warning: 'text-[#FFC107]',
      warningBg: 'bg-[#FFC107]/15',
      warningBorder: 'border-[#FFC107]/30',
      danger: 'text-[#F85149]',
      dangerBg: 'bg-[#F85149]/15',
      dangerBorder: 'border-[#F85149]/30',
      info: 'text-[#58A6FF]',
      infoBg: 'bg-[#58A6FF]/15',
      infoBorder: 'border-[#58A6FF]/30',
      pending: 'text-[#FFC107]',
      pendingBg: 'bg-[#FFC107]/15',
      pendingBorder: 'border-[#FFC107]/30',
      paid: 'text-emerald-300',
      paidBg: 'bg-[#2EA043]/15',
      paidBorder: 'border-[#2EA043]/30',
      failed: 'text-[#F85149]',
      failedBg: 'bg-[#F85149]/15',
      failedBorder: 'border-[#F85149]/30',
    },
    profit: {
      positive: 'text-emerald-300',
      negative: 'text-[#F85149]',
    },
  },
  spacing: {
    page: 'px-4 sm:px-6 py-5',
    section: 'space-y-6',
    card: 'p-6',
    cardSm: 'p-4',
    grid: 'gap-4',
    gridSm: 'gap-4',
  },
  borderRadius: {
    card: 'rounded-2xl',
    button: 'rounded-xl',
    input: 'rounded-xl',
    badge: 'rounded-lg',
    full: 'rounded-full',
  },
  shadow: {
    card: 'shadow-sm',
    button: 'shadow-md',
    hover: 'hover:shadow-lg',
  },
  transition: {
    default: 'transition-all duration-200',
    fast: 'transition-all duration-150',
    slow: 'transition-all duration-300',
  },
  typography: {
    pageTitle: 'text-2xl font-bold text-white',
    sectionTitle: 'text-xl font-semibold text-white',
    cardTitle: 'text-lg font-semibold text-white',
    body: 'text-base text-[#C9D1D9]',
    bodyMuted: 'text-sm text-[#8B949E]',
    label: 'text-sm font-medium text-slate-300',
    metric: 'text-3xl font-semibold text-white tabular-nums tracking-tight',
    metricLabel: 'text-sm text-slate-300',
    tableHeader: 'text-xs font-semibold text-[#C9D1D9] uppercase tracking-wider',
    tableCell: 'text-sm text-white',
    tableCellSecondary: 'text-sm text-[#8B949E]',
    keyValue: 'text-sm font-semibold text-white',
    amount: 'text-sm font-bold text-white',
  },
  layout: {
    topbarHeight: 'h-16',
    sidebarWidth: 'w-64',
    sidebarWidthCollapsed: 'w-20',
    containerMax: 'max-w-7xl',
    mobileBottomNavHeight: 'h-16',
    safeAreaPadding: 'pt-safe-top pb-safe-bottom px-safe-left pr-safe-right',
  },
  touch: {
    minTarget: 'min-h-[44px] min-w-[44px]',
    optimalTarget: 'min-h-[48px] min-w-[48px]',
    padding: 'p-3',
  },
  table: {
    row: 'border-b border-[#30363D]',
    rowHover: 'hover:bg-[#21262D]',
    cellPadding: 'px-4 py-3',
    headerPadding: 'px-4 py-3',
  },
};

export const getButtonClasses = (variant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'primary') => {
  const base = `px-4 py-2 ${designTokens.borderRadius.button} font-medium ${designTokens.transition.default}`;

  const variants = {
    primary: `${designTokens.colors.gradient.primary} ${designTokens.colors.gradient.primaryHover} text-white ${designTokens.shadow.button}`,
    secondary: `bg-slate-800 hover:bg-slate-700 text-white border ${designTokens.colors.border.default}`,
    danger: `${designTokens.colors.status.dangerBg} ${designTokens.colors.status.danger} border ${designTokens.colors.status.dangerBorder} hover:bg-red-500/20`,
    ghost: `hover:bg-slate-800 text-slate-400 hover:text-white`,
  };

  return `${base} ${variants[variant]}`;
};

export const getCardClasses = (variant: 'default' | 'glass' = 'default') => {
  const base = `ch-card ${designTokens.borderRadius.card} border ${designTokens.colors.border.default} ${designTokens.shadow.card}`;

  const variants = {
    default: `${designTokens.colors.background.card} backdrop-blur`,
    glass: `${designTokens.colors.background.overlay} backdrop-blur-xl`,
  };

  return `${base} ${variants[variant]}`;
};

export const getBadgeClasses = (variant: 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'paid' | 'failed' = 'info') => {
  const base = `inline-flex items-center px-2.5 py-1 ${designTokens.borderRadius.badge} text-xs font-semibold border`;

  const variants = {
    success: `${designTokens.colors.status.successBg} ${designTokens.colors.status.success} ${designTokens.colors.status.successBorder}`,
    warning: `${designTokens.colors.status.warningBg} ${designTokens.colors.status.warning} ${designTokens.colors.status.warningBorder}`,
    danger: `${designTokens.colors.status.dangerBg} ${designTokens.colors.status.danger} ${designTokens.colors.status.dangerBorder}`,
    info: `${designTokens.colors.status.infoBg} ${designTokens.colors.status.info} ${designTokens.colors.status.infoBorder}`,
    pending: `${designTokens.colors.status.pendingBg} ${designTokens.colors.status.pending} ${designTokens.colors.status.pendingBorder}`,
    paid: `${designTokens.colors.status.paidBg} ${designTokens.colors.status.paid} ${designTokens.colors.status.paidBorder}`,
    failed: `${designTokens.colors.status.failedBg} ${designTokens.colors.status.failed} ${designTokens.colors.status.failedBorder}`,
  };

  return `${base} ${variants[variant]}`;
};

export const getProfitClasses = (amount: number) => {
  const base = 'font-bold';
  const color = amount >= 0 ? designTokens.colors.profit.positive : designTokens.colors.profit.negative;
  return `${base} ${color}`;
};

export const getTableRowClasses = () => {
  return `${designTokens.table.row} ${designTokens.table.rowHover} ${designTokens.transition.fast}`;
};

export const getTableCellClasses = (emphasized: boolean = false) => {
  const base = designTokens.table.cellPadding;
  const text = emphasized ? designTokens.typography.keyValue : designTokens.typography.tableCell;
  return `${base} ${text}`;
};

export const getInputClasses = () => {
  return `${designTokens.colors.background.cardSolid} border border-slate-700 ${designTokens.borderRadius.input} px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${designTokens.transition.default}`;
};
