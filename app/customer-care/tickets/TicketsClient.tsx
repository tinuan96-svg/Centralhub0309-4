'use client';

import { useState, useEffect } from 'react';
import { SupportTicket } from '@/lib/types';
import { ticketService } from '@/lib/services/customer-care/ticketService';
import { designTokens, Card, Button, Badge, PageHeader } from '@/lib/design-system';
import CreateTicketModal from '@/components/CreateTicketModal';
import StoreScopeSelector from '@/components/StoreScopeSelector';

const formatFullDate = (date: string | null) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function TicketsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  useEffect(() => {
    loadTickets();
  }, [selectedStoreId]);

  const loadTickets = async () => {
    try {
      const data = await ticketService.getTickets(selectedStoreId ? { store_id: selectedStoreId } : undefined);
      setTickets(data);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: any) => {
    try {
      await ticketService.updateTicket(id, { status });
      loadTickets();
      if (selectedTicket?.id === id) setSelectedTicket(prev => prev ? { ...prev, status } : null);
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/20 text-red-400';
      case 'high': return 'bg-amber-500/20 text-amber-400';
      case 'medium': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Support Tickets"
        subtitle="Manage and resolve customer complaints and enquiries."
        action={
          <Button onClick={() => setIsCreateModalOpen(true)}>+ New Ticket</Button>
        }
      />

      <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>

      {selectedTicket && (
        <Card className="p-6 bg-slate-900 border-blue-500/50 space-y-6 animate-in slide-in-from-top duration-300">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">Ticket Details #{selectedTicket.id.slice(0, 8)}</h3>
                    <p className="text-sm text-slate-400">Created on {formatFullDate(selectedTicket.created_at)}</p>
                </div>
                <Button variant="secondary" onClick={() => setSelectedTicket(null)}>Close Details</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-2">Subject / Category</label>
                        <p className="text-slate-100 font-medium capitalize">{selectedTicket.category.replace('_', ' ')}</p>
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-2">Description</label>
                        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 text-sm text-slate-300 whitespace-pre-wrap">
                            {selectedTicket.description || 'No description provided.'}
                        </div>
                    </div>
                    {selectedTicket.resolution && (
                        <div>
                            <label className="text-[10px] text-emerald-500 font-bold uppercase block mb-2">Resolution</label>
                            <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-sm text-emerald-100">
                                {selectedTicket.resolution}
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-800">
                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-3">Workflow</label>
                        <div className="space-y-4">
                            <div>
                                <p className="text-[10px] text-slate-500 mb-1">STATUS</p>
                                <select
                                    value={selectedTicket.status}
                                    onChange={(e) => handleUpdateStatus(selectedTicket.id, e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                                >
                                    <option value="open">Open</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="waiting_customer">Waiting Customer</option>
                                    <option value="resolved">Resolved</option>
                                    <option value="closed">Closed</option>
                                </select>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 mb-1">PRIORITY</p>
                                <Badge className={getPriorityColor(selectedTicket.priority)}>{selectedTicket.priority}</Badge>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
      )}

      <div className="grid gap-4">
        {loading ? (
          <div className="text-center py-10 text-slate-500 animate-pulse">Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800">
            <p className="text-slate-500 text-sm">No support tickets found for this store.</p>
          </div>
        ) : (
          tickets.map((ticket) => (
            <Card key={ticket.id} className="p-4 bg-slate-900/40 border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-bold text-slate-100 uppercase text-xs">#{ticket.id.slice(0, 8)}</span>
                    <Badge variant="info" className={`text-[10px] px-1.5 py-0 capitalize ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority}
                     priority</Badge>
                    <Badge className="text-[10px] px-1.5 py-0 capitalize">{ticket.status.replace('_', ' ')}</Badge>
                  </div>
                  <h3 className="font-medium text-slate-200 truncate capitalize">{ticket.category.replace('_', ' ')}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Created {formatFullDate(ticket.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setSelectedTicket(ticket)}>View Details</Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <CreateTicketModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={() => {
            loadTickets();
            alert('Ticket created successfully');
        }}
        initialData={{ store_id: selectedStoreId }}
      />
    </div>
  );
}
