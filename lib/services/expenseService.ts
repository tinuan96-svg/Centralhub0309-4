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
  updated_at: string;
  store?: {
    name: string;
  };
}

export interface ExpenseSummary {
  total_expenses: number;
  total_pending: number;
  total_paid: number;
  count: number;
}

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Utilities',
  'Salaries',
  'Supplies',
  'Marketing',
  'Maintenance',
  'Software',
  'Travel',
  'Insurance',
  'Taxes',
  'Other'
];

export const expenseService = {
  async getAllExpenses(filters: { status?: string; category?: string; storeId?: string } = {}) {
    let query = supabase
      .from('expenses')
      .select('*, store:stores(name)')
      .order('expense_date', { ascending: false });

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'pending') {
        query = query.in('payment_status', ['pending', 'unpaid']);
      } else {
        query = query.eq('payment_status', filters.status);
      }
    }
    if (filters.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }
    if (filters.storeId && filters.storeId !== 'all') {
      if (filters.storeId === 'null') {
        query = query.is('store_id', null);
      } else {
        query = query.eq('store_id', filters.storeId);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching expenses:', error);
      return [];
    }

    // Map DB fields to UI fields if necessary
    // Based on the migration found, amount_gross might be what UI calls amount
    // and invoice_date might be expense_date.
    // However, we'll try to use the UI names first and if it fails, we can add mapping.
    return (data || []).map((exp: any) => ({
      ...exp,
      amount: exp.amount ?? exp.amount_gross ?? 0,
      expense_date: exp.expense_date ?? exp.invoice_date ?? new Date().toISOString(),
      category: exp.category ?? exp.expense_type ?? 'Other',
      store_name: exp.store?.name ?? 'Global',
      file_url: exp.file_url ?? exp.invoice_attachment_url ?? null
    })) as Expense[];
  },

  async getExpenseById(id: string) {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, store:stores(name)')
      .eq('id', id)
      .single();
    if (error) throw error;

    return {
      ...data,
      amount: data.amount ?? data.amount_gross ?? 0,
      expense_date: data.expense_date ?? data.invoice_date ?? new Date().toISOString(),
      category: data.category ?? data.expense_type ?? 'Other',
      store_name: data.store?.name ?? 'Global',
      file_url: data.file_url ?? data.invoice_attachment_url ?? null
    } as Expense;
  },

  async createExpense(expense: Partial<Expense>) {
    // Map UI fields back to DB fields if necessary
    const dbExpense = {
      description: expense.description,
      amount_gross: expense.amount,
      amount_net: expense.amount, // Simplified
      expense_type: expense.category,
      invoice_date: expense.expense_date,
      payment_status: expense.payment_status === 'pending' ? 'unpaid' : expense.payment_status,
      payment_method: expense.payment_method,
      notes: expense.notes,
      store_id: expense.store_id,
      invoice_attachment_url: expense.file_url
    };

    const { data, error } = await supabase
      .from('expenses')
      .insert([dbExpense])
      .select()
      .single();
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
      dbUpdates.amount_gross = updates.amount;
      dbUpdates.amount_net = updates.amount;
    }
    if (updates.category !== undefined) dbUpdates.expense_type = updates.category;
    if (updates.expense_date !== undefined) dbUpdates.invoice_date = updates.expense_date;
    if (updates.payment_status !== undefined) {
      dbUpdates.payment_status = updates.payment_status === 'pending' ? 'unpaid' : updates.payment_status;
    }
    if (updates.payment_method !== undefined) dbUpdates.payment_method = updates.payment_method;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.store_id !== undefined) dbUpdates.store_id = updates.store_id;
    if (updates.file_url !== undefined) dbUpdates.invoice_attachment_url = updates.file_url;

    const { error } = await supabase
      .from('expenses')
      .update(dbUpdates)
      .eq('id', id);
    if (error) {
      console.error('Error updating expense:', error);
      return false;
    }
    return true;
  },

  async deleteExpense(id: string) {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id);
    return !error;
  },

  async getSummary(filters: { storeId?: string } = {}) {
    let query = supabase.from('expenses').select('amount_gross, payment_status');

    if (filters.storeId && filters.storeId !== 'all') {
      if (filters.storeId === 'null') {
        query = query.is('store_id', null);
      } else {
        query = query.eq('store_id', filters.storeId);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching summary:', error);
      return { total_expenses: 0, total_pending: 0, total_paid: 0, count: 0 };
    }

    const summary: ExpenseSummary = {
      total_expenses: 0,
      total_pending: 0,
      total_paid: 0,
      count: data.length
    };

    data.forEach(exp => {
      const amt = exp.amount_gross || 0;
      summary.total_expenses += amt;
      if (exp.payment_status === 'paid') {
        summary.total_paid += amt;
      } else if (exp.payment_status === 'unpaid' || exp.payment_status === 'pending') {
        summary.total_pending += amt;
      }
    });

    return summary;
  }
};
