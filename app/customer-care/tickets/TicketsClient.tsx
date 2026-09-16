'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { SupportTicket } from '@/lib/types';
import { ticketService } from '@/lib/services/customer-care/ticketService';
import { Card, Button, Badge, PageHeader } from '@/lib/design-system';
import CreateTicketModal from '@/components/CreateTicketModal';
import StoreScopeSelector from '@/components/StoreScopeSelector';

const formatFullDate = (date: string | null) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const chatHref = (ticket: SupportTicket) => ticket.conversation_id
  ? `/customer-care/tickets/chat?conversation=${encodeURIComponent(ticket.conversation_id)}&ticket=${encodeURIComponent(ticket.id)}`
  : null;

const PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const STATUS_RANK: Record<string, number> = {
  in_progress: 6,
  open: 5,
  assigned: 4,
  waiting_internal: 3,
  waiting_customer: 2,
  resolved: 1,
};

const activeTicketSort = (a: SupportTicket, b: SupportTicket) => {
  const priorityDifference = (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
  if (priorityDifference !== 0) return priorityDifference;

  const statusDifference = (STATUS_RANK[b.status] || 0) - (STATUS_RANK[a.status] || 0);
  if (statusDifference !== 0) return statusDifference;

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
};

export default function TicketsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);

  useEffect(() => {
    loadTickets();
  }, [selectedStoreId]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const data = await ticketService.getTickets(selectedStoreId ? { store_id: selectedStoreId } : undefined);
      const activeTickets = data
        .filter((ticket) => ticket.status !== 'closed')
        .sort(activeTicketSort);
      setTickets(activeTickets);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: SupportTicket['status']) => {
    if (updatingTicketId) return;
    setUpdatingTicketId(id);
    try {
      await ticketService.updateTicket(id, { status });

      if (status === 'closed') {
        setTickets((current) => current.filter((ticket) => ticket.id !== id));
        if (selectedTicket?.id === id) setSelectedTicket(null);
        return;
      }

      setTickets((current) => current
        .map((ticket) => ticket.id === id ? { ...ticket, status } : ticket)
        .filter((ticket) => ticket.status !== 'closed')
        .sort(activeTicketSort));
      if (selectedTicket?.id === id) setSelectedTicket((prev) => prev ? { ...prev, status } : null);
    } catch (err) {
      console.error('Update failed:', err);
    } finally {
      setUpdatingTicketId(null);
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
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 pb-28 md:pb-6">
      <PageHeader
        title="Support Tickets"
        subtitle="Manage and resolve customer complaints and enquiries."
        action={
          <Button onClick={() => setIsCreateModalOpen(true)}>+ New Ticket</Button>
        }
      />

      <div className="bg-slate-900/50 border border-slate-800 p-3 sm:p-4 rounded-2xl">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-xs font-bold text-slate-200">Active queue</span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">{tickets.length}</span>
        </div>
        <span className="text-[10px] font-semibold text-slate-500">Urgent → High → Medium → Low</span>
      </div>

      {selectedTicket && (
        <Card className="p-4 sm:p-6 bg-slate-900 border-blue-500/50 space-y-5 sm:space-y-6 animate-in slide-in-from-top duration-300">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-bold text-white mb-1 truncate">Ticket Details #{selectedTicket.id.slice(0, 8).toUpperCase()}</h3>
              <p className="text-xs sm:text-sm text-slate-400">Created on {formatFullDate(selectedTicket.created_at)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedTicket.status === 'resolved' && (
                <button
                  type="button"
                  disabled={updatingTicketId === selectedTicket.id}
                  onClick={() => void handleUpdateStatus(selectedTicket.id, 'closed')}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-300 transition active:scale-[.98] disabled:opacity-50"
                >
                  {updatingTicketId === selectedTicket.id ? 'Closing…' : 'Close ticket'}
                </button>
              )}
              {chatHref(selectedTicket) && (
                <Link href={chatHref(selectedTicket)!} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black text-slate-950 active:scale-[.98]">
                  Open customer chat
                </Link>
              )}
              <Button variant="secondary" onClick={() => setSelectedTicket(null)}>Close Details</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            <div className="md:col-span-2 space-y-5 sm:space-y-6">
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
                      disabled={updatingTicketId === selectedTicket.id}
                      onChange={(e) => void handleUpdateStatus(selectedTicket.id, e.target.value as SupportTicket['status'])}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white disabled:opacity-50"
                    >
                      <option value="open">Open</option>
                      <option value="assigned">Assigned</option>
                      <option value="in_progress">In Progress</option>
                      <option value="waiting_customer">Waiting Customer</option>
                      <option value="waiting_internal">Waiting Internal</option>
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

      <div className="grid gap-3 sm:gap-4">
        {loading ? (
          <div className="text-center py-10 text-slate-500 animate-pulse">Loading active tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800">
            <p className="text-slate-400 text-sm font-semibold">No active support tickets.</p>
            <p className="mt-1 text-[11px] text-slate-600">Closed tickets are automatically hidden from this queue.</p>
          </div>
        ) : (
          tickets.map((ticket) => {
            const directChat = chatHref(ticket);
            const isClosing = updatingTicketId === ticket.id;
            return (
              <Card key={ticket.id} className="p-4 bg-slate-900/40 border-slate-800 hover:border-slate-700 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
                      <span className="font-bold text-slate-100 uppercase text-xs">#{ticket.id.slice(0, 8)}</span>
                      <Badge variant="info" className={`text-[10px] px-1.5 py-0 capitalize ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority} priority
                      </Badge>
                      <Badge className="text-[10px] px-1.5 py-0 capitalize">{ticket.status.replace('_', ' ')}</Badge>
                    </div>
                    <h3 className="font-medium text-slate-200 truncate capitalize">{ticket.category.replace('_', ' ')}</h3>
                    <p className="text-xs text-slate-500 mt-1">Created {formatFullDate(ticket.created_at)}</p>
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                    {directChat ? (
                      <Link href={directChat} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950 active:scale-[.98]">
                        Go to chat
                      </Link>
                    ) : (
                      <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-800 px-3 py-2 text-[10px] text-slate-600">No linked chat</span>
                    )}
                    <Button variant="secondary" onClick={() => setSelectedTicket(ticket)}>View Details</Button>
                    {ticket.status === 'resolved' && (
                      <button
                        type="button"
                        disabled={isClosing}
                        onClick={() => void handleUpdateStatus(ticket.id, 'closed')}
                        className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-300 transition active:scale-[.98] disabled:opacity-50 sm:col-span-1"
                      >
                        {isClosing ? 'Closing…' : '✓ Close ticket'}
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
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
