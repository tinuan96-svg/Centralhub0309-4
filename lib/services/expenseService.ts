import { supabase } from '../supabase';

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  store_id: string | null;
  store_name: string;
  file_url: string | null;
  created_at: string;
  updated_at: string | null;
  source: 'manual' | 'bank';
  bank_transaction_id?: string | null;
  reconciliation_status?: string | null;
  reconciliation_source?: string | null;
  is_reconciled?: boolean;
  ledger_code?: string | null;
  store?: { name: string };
}

export interface ExpenseSummary {
  total_expenses: number;
  total_pending: number;
  total_paid: number;
  count: number;
}

export const EXPENSE_CATEGORIES = [
  'Shipping / courier costs','Packaging materials','Software / online services','Telecoms / internet','Merchant / payment services',
  'Finance costs','Tax expense','Other expenses','Facebook Marketing','Rent','Utilities','Salaries','Supplies','Marketing','Maintenance','Software','Travel','Insurance','Taxes','Other'
];

const manualExpenseType = (category?: string | null) => {
  const value = (category || '').toLowerCase();
  if (value.includes('tax')) return 'tax';
  if (value.includes('finance')) return 'finance';
  return 'operating';
};

export const expenseService = {
  async getAllExpenses(filters: { status?: string; category?: string; storeId?: string } = {}) {
    const [manualResult, ledgerResult, storeResult, creditorResult] = await Promise.all([
      supabase.from('expenses').select('*').order('invoice_date', { ascending: false }),
      supabase.from('finance_ledger_accounts').select('id, code, name, ledger_type, pnl_class').eq('ledger_type', 'expense').eq('is_active', true),
      supabase.from('stores').select('id, name'),
      supabase.from('finance_creditors').select('id, name').eq('is_active', true)
    ]);

    if (manualResult.error) throw new Error(`Manual expenses could not be loaded: ${manualResult.error.message}`);
    if (ledgerResult.error) throw new Error(`Expense ledger accounts could not be loaded: ${ledgerResult.error.message}`);

    const ledgers = ledgerResult.data || [];
    const ledgerById = new Map(ledgers.map((l: any) => [l.id, l]));
    const storeById = new Map((storeResult.data || []).map((s: any) => [s.id, s.name]));
    const creditorById = new Map((creditorResult.data || []).map((c: any) => [c.id, c.name]));
    const expenseLedgerIds = ledgers.map((l: any) => l.id);

    let bankRows: any[] = [];
    if (expenseLedgerIds.length > 0) {
      const bankResult = await supabase.from('bank_transactions')
        .select('id, transaction_date, merchant, description, amount, type, store_id, ledger_account_id, creditor_id, is_reconciled, reconciliation_status, classification_status, reconciliation_source, created_at, updated_at')
        .eq('type', 'debit')
        .in('ledger_account_id', expenseLedgerIds)
        .order('transaction_date', { ascending: false });
      if (bankResult.error) throw new Error(`Classified bank expenses could not be loaded: ${bankResult.error.message}`);
      bankRows = bankResult.data || [];
    }

    const manualRows = (manualResult.data || []).map((exp: any): Expense => ({
      id: exp.id,
      description: exp.description || 'Business expense',
      amount: Number(exp.amount_gross ?? 0),
      expense_date: exp.invoice_date ?? exp.created_at,
      category: exp.category ?? exp.expense_type ?? 'Other',
      payment_status: exp.payment_status ?? 'pending',
      payment_method: null,
      notes: exp.notes ?? null,
      store_id: exp.store_id ?? null,
      store_name: exp.store_id ? (storeById.get(exp.store_id) || 'Store') : 'Global',
      file_url: exp.file_url ?? null,
      created_at: exp.created_at,
      updated_at: exp.created_at ?? null,
      source: 'manual',
      bank_transaction_id: exp.bank_transaction_id ?? null
    }));

    const manuallyLinkedBankIds = new Set(manualRows.map(e => e.bank_transaction_id).filter((id): id is string => Boolean(id)));
    const bankExpenses = bankRows
      .filter((bt: any) => !manuallyLinkedBankIds.has(bt.id))
      .map((bt: any): Expense => {
        const ledger: any = ledgerById.get(bt.ledger_account_id);
        const creditorName = bt.creditor_id ? creditorById.get(bt.creditor_id) : null;
        const payee = creditorName || bt.merchant || bt.description || 'Bank expense';
        return {
          id: `bank:${bt.id}`,
          description: String(payee),
          amount: Math.abs(Number(bt.amount ?? 0)),
          category: ledger?.name || 'Other expenses',
          expense_date: bt.transaction_date,
          payment_status: 'paid',
          payment_method: 'Bank',
          notes: bt.description && bt.description !== payee ? bt.description : null,
          store_id: bt.store_id ?? null,
          store_name: bt.store_id ? (storeById.get(bt.store_id) || 'Store') : 'Global',
          file_url: null,
          created_at: bt.created_at,
          updated_at: bt.updated_at ?? bt.created_at ?? null,
          source: 'bank',
          bank_transaction_id: bt.id,
          reconciliation_status: bt.reconciliation_status ?? bt.classification_status ?? null,
          reconciliation_source: bt.reconciliation_source ?? null,
          is_reconciled: Boolean(bt.is_reconciled),
          ledger_code: ledger?.code ?? null
        };
      });

    let merged = [...manualRows, ...bankExpenses];
    if (filters.status && filters.status !== 'all') {
      merged = filters.status === 'pending'
        ? merged.filter(e => ['pending','unpaid'].includes(e.payment_status))
        : merged.filter(e => e.payment_status === filters.status);
    }
    if (filters.category && filters.category !== 'all') merged = merged.filter(e => e.category === filters.category);
    if (filters.storeId && filters.storeId !== 'all') {
      merged = filters.storeId === 'null'
        ? merged.filter(e => !e.store_id)
        : merged.filter(e => e.store_id === filters.storeId);
    }

    return merged.sort((a,b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());
  },

  async getExpenseById(id: string) {
    if (id.startsWith('bank:')) throw new Error('Bank-origin expenses are opened from Banking.');
    const { data, error } = await supabase.from('expenses').select('*').eq('id', id).single();
    if (error) throw error;

    let storeName = 'Global';
    if (data.store_id) {
      const { data: store } = await supabase.from('stores').select('name').eq('id', data.store_id).maybeSingle();
      storeName = store?.name || 'Store';
    }

    return {
      id: data.id,
      description: data.description || 'Business expense',
      amount: Number(data.amount_gross ?? 0),
      expense_date: data.invoice_date ?? data.created_at,
      category: data.category ?? data.expense_type ?? 'Other',
      payment_status: data.payment_status ?? 'pending',
      payment_method: null,
      notes: data.notes ?? null,
      store_id: data.store_id ?? null,
      store_name: storeName,
      file_url: data.file_url ?? null,
      created_at: data.created_at,
      updated_at: data.created_at ?? null,
      source: 'manual' as const,
      bank_transaction_id: data.bank_transaction_id ?? null
    } as Expense;
  },

  async createExpense(expense: Partial<Expense>) {
    const category = expense.category || 'Other';
    const amount = Number(expense.amount || 0);
    const dbExpense = {
      description: expense.description || 'Business expense',
      amount_gross: amount,
      amount_net: amount,
      vat_amount: 0,
      category,
      expense_type: manualExpenseType(category),
      invoice_date: expense.expense_date || new Date().toISOString().slice(0, 10),
      payment_status: expense.payment_status === 'pending' ? 'unpaid' : (expense.payment_status || 'unpaid'),
      notes: expense.notes || null,
      store_id: expense.store_id || null,
      file_url: expense.file_url || null,
      is_variable_cost: false,
      pricing_relevant: true
    };

    const { data, error } = await supabase.from('expenses').insert([dbExpense]).select().single();
    if (error) {
      console.error('Error creating expense:', error);
      return null;
    }
    return data.id;
  },

  async updateExpense(id: string, updates: Partial<Expense>) {
    const dbUpdates: any = {};
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.amount !== undefined) {
      dbUpdates.amount_gross = Number(updates.amount);
      dbUpdates.amount_net = Number(updates.amount);
    }
    if (updates.category !== undefined) {
      dbUpdates.category = updates.category;
      dbUpdates.expense_type = manualExpenseType(updates.category);
    }
    if (updates.expense_date !== undefined) dbUpdates.invoice_date = updates.expense_date;
    if (updates.payment_status !== undefined) dbUpdates.payment_status = updates.payment_status === 'pending' ? 'unpaid' : updates.payment_status;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.store_id !== undefined) dbUpdates.store_id = updates.store_id;
    if (updates.file_url !== undefined) dbUpdates.file_url = updates.file_url;

    const { error } = await supabase.from('expenses').update(dbUpdates).eq('id', id);
    if (error) {
      console.error('Error updating expense:', error);
      return false;
    }
    return true;
  },

  async deleteExpense(id: string) {
    if (id.startsWith('bank:')) return false;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    return !error;
  },

  async getSummary(filters: { storeId?: string } = {}) {
    const data = await this.getAllExpenses({ storeId: filters.storeId });
    return data.reduce<ExpenseSummary>((summary, exp) => {
      summary.total_expenses += exp.amount;
      summary.count += 1;
      if (exp.payment_status === 'paid') summary.total_paid += exp.amount;
      if (['unpaid','pending'].includes(exp.payment_status)) summary.total_pending += exp.amount;
      return summary;
    }, { total_expenses: 0, total_pending: 0, total_paid: 0, count: 0 });
  }
};
