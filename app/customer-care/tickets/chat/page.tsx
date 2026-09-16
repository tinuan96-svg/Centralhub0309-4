import TicketChatClient from './TicketChatClient';

export default async function TicketChatPage({ searchParams }: { searchParams: any }) {
  const resolved = await searchParams;
  const conversationId = String(resolved?.conversation || '');
  const ticketId = resolved?.ticket ? String(resolved.ticket) : null;
  return <TicketChatClient conversationId={conversationId} ticketId={ticketId} />;
}
