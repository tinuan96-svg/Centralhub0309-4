'use client';

import { useState } from 'react';
import { Button, Card } from '@/lib/design-system';
import { ticketService } from '@/lib/services/customer-care/ticketService';
import { TicketCategory, TicketPriority } from '@/lib/types';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
  initialData?: { customer_id?: string | null; contact_id?: string | null; conversation_id?: string | null; store_id?: string | null; order_id?: string | null; };
  customerId?: string | null;
  contactId?: string | null;
  conversationId?: string | null;
  storeId?: string | null;
  orderId?: string | null;
}

export default function CreateTicketModal({ isOpen, onClose, onCreated, initialData, customerId, contactId, conversationId, storeId, orderId }: CreateTicketModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ category: 'complaint' as TicketCategory, priority: 'medium' as TicketPriority, description: '', internal_notes: '' });
  if (!isOpen) return null;

  const context = { ...(initialData || {}), customer_id: initialData?.customer_id ?? customerId ?? null, contact_id: initialData?.contact_id ?? contactId ?? null, conversation_id: initialData?.conversation_id ?? conversationId ?? null, store_id: initialData?.store_id ?? storeId ?? null, order_id: initialData?.order_id ?? orderId ?? null };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!context.store_id) { console.warn('[CreateTicket] Missing store_id in ticket context:', context); alert('Internal Error: This conversation is not linked to a specific store. Ticket cannot be generated.'); return; }
    setLoading(true);
    try { await ticketService.createTicket({ ...context, ...formData, status: 'open' } as any); onCreated?.(); onClose(); }
    catch (err) { console.error('Failed to create ticket:', err); alert('Error creating ticket. Please try again.'); }
    finally { setLoading(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"><Card className="w-full max-w-lg bg-slate-900 border-slate-800 shadow-2xl overflow-hidden"><div className="p-6 border-b border-slate-800 flex justify-between items-center"><h2 className="text-xl font-black text-white uppercase tracking-tight">Create Support Ticket</h2><button onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-2xl" aria-label="Close">&times;</button></div><form onSubmit={handleSubmit} className="p-6 space-y-6"><div className="grid grid-cols-2 gap-4"><div><label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Category</label><select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as TicketCategory })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm"><option value="complaint">Complaint</option><option value="missing_order">Missing Order</option><option value="refund">Refund Request</option><option value="damaged_item">Damaged Item</option><option value="delivery_issue">Delivery Issue</option><option value="payment_issue">Payment Issue</option><option value="other">Other</option></select></div><div><label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Priority</label><select value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value as TicketPriority })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div></div><div><label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Issue Description</label><textarea required rows={3} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm" placeholder="Describe the customer issue..." /></div><div><label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Internal Notes (Optional)</label><textarea rows={2} value={formData.internal_notes} onChange={e => setFormData({ ...formData, internal_notes: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm" placeholder="Private notes for internal use..." /></div><div className="flex gap-3 pt-2"><Button type="button" variant="secondary" onClick={onClose} className="flex-1" disabled={loading}>Cancel</Button><Button type="submit" className="flex-1" disabled={loading}>{loading ? 'Creating...' : 'Create Ticket'}</Button></div></form></Card></div>;
}
