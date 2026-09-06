'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, Button, Badge } from '@/lib/design-system';
import { whatsappService } from '@/lib/services/customer-care/whatsappService';
import StoreScopeSelector from '@/components/StoreScopeSelector';

export default function KnowledgeBaseClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingArticle, setEditingArticle] = useState<any>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  useEffect(() => { if (selectedStoreId) loadKB(); }, [selectedStoreId]);

  const loadKB = async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try { setArticles((await whatsappService.getKnowledgeBase(selectedStoreId)) || []); }
    catch (err) { console.error('Failed to load KB:', err); }
    finally { setLoading(false); }
  };

  const handleSave = async (article: any) => {
    if (!selectedStoreId) return;
    try {
      const payload = { ...article, store_id: selectedStoreId, is_published: article.is_published ?? true };
      if (payload.id) await whatsappService.updateArticle(payload.id, payload);
      else await whatsappService.createArticle(payload);
      setEditingArticle(null); await loadKB();
    } catch (err: any) { console.error('Save failed:', err); alert(`Could not save article: ${err?.message || 'Unknown error'}`); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this article?')) return;
    try { await whatsappService.deleteArticle(id); await loadKB(); }
    catch (err: any) { console.error('Delete failed:', err); alert(`Could not delete article: ${err?.message || 'Unknown error'}`); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader title="Knowledge Base" subtitle="Store-specific information used by the AI Assistant." action={selectedStoreId ? <Button onClick={() => setEditingArticle({ store_id: selectedStoreId })}>+ Add Article</Button> : undefined} />
      <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl"><StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} /></div>

      {!selectedStoreId ? <div className="text-center py-12 text-slate-500">Select a store to manage its AI knowledge.</div> : editingArticle ? (
        <Card className="p-4 sm:p-6 bg-slate-900 border-blue-500/50">
          <h3 className="text-lg font-bold text-white mb-4">{editingArticle.id ? 'Edit' : 'Add'} Article</h3>
          <div className="space-y-4">
            <input type="text" placeholder="Title" value={editingArticle.title || ''} onChange={e => setEditingArticle({ ...editingArticle, title: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white" />
            <textarea placeholder="Content" rows={7} value={editingArticle.content || ''} onChange={e => setEditingArticle({ ...editingArticle, content: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white" />
            <div className="flex gap-3"><Button onClick={() => handleSave(editingArticle)} disabled={!editingArticle.title?.trim() || !editingArticle.content?.trim()}>Save Article</Button><Button variant="secondary" onClick={() => setEditingArticle(null)}>Cancel</Button></div>
          </div>
        </Card>
      ) : loading ? <div className="text-center py-10 text-slate-500">Loading knowledge base...</div> : articles.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800"><p className="text-slate-500 text-sm">No articles found. Add store information for the AI.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">{articles.map(article => <Card key={article.id} className="p-4 bg-slate-900/40 border-slate-800 flex flex-col justify-between"><div><div className="flex justify-between items-start gap-3 mb-2"><h3 className="font-bold text-slate-100">{article.title}</h3><Badge variant="info" className="text-[9px] uppercase">{article.category?.name || 'General'}</Badge></div><p className="text-xs text-slate-500 mb-4 line-clamp-4">{article.content}</p></div><div className="flex gap-2"><Button variant="secondary" className="flex-1 text-xs" onClick={() => setEditingArticle(article)}>Edit</Button><Button variant="danger" className="p-2 text-xs" onClick={() => handleDelete(article.id)}>🗑️</Button></div></Card>)}</div>
      )}
    </div>
  );
}
