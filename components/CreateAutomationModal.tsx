'use client';

import { useState, useEffect } from 'react';
import { designTokens, Button, Badge, getInputClasses } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';
import { WHATSAPP_EVENTS, ALL_EVENTS, WhatsAppEvent } from '@/lib/constants/whatsapp-events';

interface CreateAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  storeId: string | null;
  initialTemplateId?: string;
  initialEventKey?: string;
}

export default function CreateAutomationModal({
  isOpen,
  onClose,
  onCreated,
  storeId,
  initialTemplateId,
  initialEventKey,
}: CreateAutomationModalProps) {
  const [name, setName] = useState('');
  const [eventKey, setEventKey] = useState(initialEventKey || ALL_EVENTS[0].key);
  const [templateId, setTemplateId] = useState(initialTemplateId || '');
  const [templates, setTemplates] = useState<any[]>([]);
  const [existingMapping, setExistingMapping] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedEvent = ALL_EVENTS.find(e => e.key === eventKey);

  useEffect(() => {
    if (isOpen && storeId) {
      loadTemplates();
    }
  }, [isOpen, storeId]);

  useEffect(() => {
    if (initialTemplateId) setTemplateId(initialTemplateId);
    if (initialEventKey) setEventKey(initialEventKey);
  }, [initialTemplateId, initialEventKey]);

  useEffect(() => {
    if (isOpen && storeId && eventKey) {
      checkExistingMapping();
    }
  }, [isOpen, storeId, eventKey]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('whatsapp_template_registry')
        .select('*')
        .eq('store_id', storeId)
        .eq('status', 'active');
      setTemplates(data || []);
      if (!templateId && data && data.length > 0) {
        setTemplateId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkExistingMapping = async () => {
    const { data } = await supabase
      .from('whatsapp_event_template_mappings')
      .select('*, template:whatsapp_template_registry(name)')
      .eq('store_id', storeId)
      .eq('event_key', eventKey)
      .maybeSingle();
    setExistingMapping(data);
  };

  const handleSave = async () => {
    if (!templateId || !storeId || !selectedEvent) {
      alert('Please fill in all fields');
      return;
    }

    const selectedTemplate = templates.find(t => t.id === templateId);
    if (!selectedTemplate) return;

    // Strict Variable Validation
    const templateVars = Array.isArray(selectedTemplate.variables) ? selectedTemplate.variables : [];

    // Check if the template contains the required variables for the chosen event
    const missingVars = selectedEvent.variables.filter(v => {
      // Logic: variable must exist in template. 'otp_code' matches 'otp' or 'code' fuzzy or exactly
      return !templateVars.some((tv: string) =>
        tv.toLowerCase() === v.toLowerCase() ||
        v.toLowerCase().includes(tv.toLowerCase())
      );
    });

    if (missingVars.length > 0) {
      const confirmForce = confirm(`Warning: This template might be missing required variables for this event (${missingVars.join(', ')}). Automation may fail. Proceed anyway?`);
      if (!confirmForce) return;
    }

    setIsSaving(true);
    try {
      if (existingMapping) {
        // Update existing mapping (Replace Template)
        const { error } = await supabase
          .from('whatsapp_event_template_mappings')
          .update({
            template_id: templateId,
            description: name || existingMapping.description,
            variables: selectedEvent.variables,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingMapping.id);
        if (error) throw error;
      } else {
        // Create new mapping
        const { error } = await supabase.from('whatsapp_event_template_mappings').insert({
          store_id: storeId,
          event_key: selectedEvent.key,
          event_type: selectedEvent.type,
          event_source: selectedEvent.source,
          description: name || `Mapping for ${selectedEvent.label}`,
          template_id: templateId,
          variables: selectedEvent.variables,
          enabled: true,
        });
        if (error) throw error;
      }

      onCreated();
      onClose();
    } catch (err: any) {
      console.error('Failed to save mapping:', err);
      alert(`Error: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl max-w-md w-full p-6">
        <h3 className={designTokens.typography.cardTitle + ' mb-6'}>
          {existingMapping ? 'Update Automation Mapping' : 'Link Template to Event'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Trigger Event</label>
            <select
              value={eventKey}
              onChange={(e) => setEventKey(e.target.value)}
              className={getInputClasses() + ' w-full appearance-none bg-slate-900'}
            >
              {Object.entries(WHATSAPP_EVENTS).map(([category, events]) => (
                <optgroup key={category} label={category} className="bg-slate-900">
                  {events.map((event) => (
                    <option key={event.key} value={event.key} className="bg-slate-900">
                      {event.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {selectedEvent && (
              <div className="mt-2 p-2 bg-black/20 rounded-lg border border-slate-800 flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] text-slate-500 font-mono">{selectedEvent.key}</span>
                  <Badge variant="info">{selectedEvent.source}</Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="text-[9px] text-slate-400 font-bold mr-1">Required:</span>
                  {selectedEvent.variables.map(v => (
                    <span key={v} className="text-[9px] text-blue-400 font-mono">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">WhatsApp Template</label>
            {loading ? (
              <div className="text-xs text-slate-500 animate-pulse p-2">Loading...</div>
            ) : templates.length === 0 ? (
              <div className="text-xs text-amber-500 p-2">No templates available.</div>
            ) : (
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className={getInputClasses() + ' w-full appearance-none bg-slate-900'}
              >
                {templates.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.id} className="bg-slate-900">
                    {tmpl.name} ({tmpl.meta_template_name})
                  </option>
                ))}
              </select>
            )}
          </div>

          {existingMapping && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className="text-xs text-amber-500">
                <span className="font-bold">Existing Link:</span> Currently using <span className="font-bold">&quot;{existingMapping.template?.name}&quot;</span>. Saving will update it.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-8">
          <Button variant="secondary" onClick={onClose} disabled={isSaving} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving || templates.length === 0} className="flex-1">
            {isSaving ? 'Saving...' : (existingMapping ? 'Replace Template' : 'Create Link')}
          </Button>
        </div>
      </div>
    </div>
  );
}
