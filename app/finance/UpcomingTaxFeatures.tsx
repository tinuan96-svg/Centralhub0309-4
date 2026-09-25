/** Informational roadmap only: never represent unimplemented HMRC filing as available. */
const upcoming = [
  {
    name: 'PAYE & Payroll',
    detail: 'Employee payroll, payslips, PAYE and National Insurance calculations, and HMRC RTI filing.',
    icon: '👥',
  },
  {
    name: 'Corporation Tax',
    detail: 'Company tax calculations, CT600 preparation, supporting accounts and HMRC filing.',
    icon: '🏢',
  },
  {
    name: 'Companies House Filing',
    detail: 'Annual accounts, confirmation statements and company filing reminders.',
    icon: '📄',
  },
] as const;

export default function UpcomingTaxFeatures() {
  return (
    <section id="upcoming-tax-features" aria-labelledby="upcoming-tax-features-heading" className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-6 space-y-4">
      <div className="space-y-1">
        <span className="inline-flex rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-violet-200">Upcoming features · Planned</span>
        <h2 id="upcoming-tax-features-heading" className="text-xl font-black text-white">More tax &amp; filing tools are on our roadmap</h2>
        <p className="text-sm text-slate-300">We hope to bring more UK business tax, payroll and company filing tools to CentralHub. These features are planned, not available for use yet.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {upcoming.map(feature => (
          <article key={feature.name} className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span aria-hidden="true" className="text-2xl">{feature.icon}</span>
              <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-200">Coming soon</span>
            </div>
            <h3 className="font-bold text-slate-100">{feature.name}</h3>
            <p className="text-xs leading-5 text-slate-400">{feature.detail}</p>
          </article>
        ))}
      </div>
      <p className="text-xs leading-5 text-slate-500">No launch date is confirmed. Direct filings will only be enabled after the relevant integrations, security checks and authorisations are complete.</p>
    </section>
  );
}
