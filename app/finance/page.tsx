import Link from 'next/link';
import FinanceControlClient from './FinanceControlClient';
import FinancialPerformanceClient from './FinancialPerformanceClient';
import PayableAlertsClient from './PayableAlertsClient';
import CashlessIntegrityClient from './CashlessIntegrityClient';
import SupplierInvoiceProfitClient from './SupplierInvoiceProfitClient';
import ActualProfitClient from './ActualProfitClient';
import FinanceDocumentExceptionBadge from './FinanceDocumentExceptionBadge';

const links = [
  ['/finance', 'Overview'], ['/finance/planning', 'Planning & Growth'], ['/finance/admin-intake', 'WhatsApp Intake'], ['/finance/reserves', 'Reserves'], ['/finance/reserve-controls', 'Reserve Rules'], ['/finance/ledger', 'Chart of Accounts'], ['/finance/transactions', 'Bank Reconciliation'], ['/finance/mollie', 'Mollie Audit'], ['/finance/payables', 'Supplier Payables'], ['/finance/p-and-l', 'Profit & Loss'], ['/finance/profitability', 'Profitability'],
];

export default function FinancePage() { return <main className="min-h-screen bg-slate-950"><header className="px-4 sm:px-6 pt-5 max-w-[1700px] mx-auto"><div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4"><div><p className="text-[10px] text-cyan-400 font-black uppercase tracking-[.25em]">CentralHub Finance</p><h1 className="text-3xl font-black text-white">Financial Command Centre</h1><p className="text-sm text-slate-500 mt-1">Bank position, reserves, profit, supplier liabilities and business performance in one place.</p><FinanceDocumentExceptionBadge/></div><div className="flex gap-2"><Link href="/finance/planning" className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-black uppercase tracking-widest">Plan Growth →</Link><Link href="/pricing" className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest">Pricing Control Centre →</Link></div></div><nav className="mt-5 flex gap-2 overflow-x-auto pb-2">{links.map(([href,label])=><Link key={href} href={href} className="whitespace-nowrap px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-black uppercase tracking-widest hover:border-cyan-500/40 hover:text-cyan-300 transition-colors">{label}</Link>)}</nav></header><div className="px-4 sm:px-6 py-4 max-w-[1700px] mx-auto"><FinancialPerformanceClient/></div><FinanceControlClient/><ActualProfitClient/><div className="px-4 sm:px-6 py-4 max-w-[1700px] mx-auto"><SupplierInvoiceProfitClient/></div><div className="px-4 sm:px-6 py-4 max-w-[1700px] mx-auto"><CashlessIntegrityClient/></div><div className="px-4 sm:px-6 pb-8 max-w-[1700px] mx-auto"><PayableAlertsClient/></div></main>; }
