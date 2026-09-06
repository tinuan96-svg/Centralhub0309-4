'use client';

import { designTokens, Button, Badge } from '@/lib/design-system';

interface TemplateViewModalProps {
  isOpen: boolean;
  template: any;
  onClose: () => void;
}

export default function TemplateViewModal({
  isOpen,
  template,
  onClose,
}: TemplateViewModalProps) {
  if (!isOpen || !template) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className={designTokens.typography.cardTitle}>{template.name}</h3>
            <p className="text-slate-500 text-xs uppercase tracking-tight mt-1">
              {template.category} • {template.language}
            </p>
          </div>
          <Badge variant={template.status === 'active' ? 'success' : 'warning'}>
            {template.status}
          </Badge>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          <section>
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Meta Reference</h4>
            <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Template ID:</span>
                <span className="text-slate-200 font-mono text-xs">{template.meta_template_id}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-slate-400">Internal Name:</span>
                <span className="text-slate-200">{template.meta_template_name}</span>
              </div>
            </div>
          </section>

          <section>
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Variables & Placeholders</h4>
            {template.variables && Array.isArray(template.variables) && template.variables.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {template.variables.map((v: string) => (
                  <div key={v} className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/50 flex items-center gap-2">
                    <span className="w-5 h-5 bg-blue-500/20 rounded flex items-center justify-center text-[10px] text-blue-400 font-bold">
                      {template.variables.indexOf(v) + 1}
                    </span>
                    <span className="text-xs text-slate-300 font-mono">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-xs italic">No variables defined for this template.</p>
            )}
          </section>

          <section>
             <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Technical Registry Info</h4>
             <pre className="text-[10px] bg-black/40 p-4 rounded-xl border border-slate-800 text-slate-400 overflow-x-auto">
               {JSON.stringify(template, null, 2)}
             </pre>
          </section>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-800">
          <Button onClick={onClose} className="w-full">Close Preview</Button>
        </div>
      </div>
    </div>
  );
}
