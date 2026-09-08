import { supabase } from '@/lib/supabase';

export interface BankAccount {
  id: string;
  store_id: string | null;
  bank_name: string;
  account_name: string;
  account_number: string | null;
  currency: string;
  current_balance: number;
  last_synced_at: string | null;
  is_active: boolean;
  google_sheet_id?: string | null;
  google_sheet_name?: string | null;
  google_sheet_range?: string | null;
  balance_source?: string | null;
  sync_source?: string | null;
}

export interface BankTransaction {
  id: string;
  bank_account_id: string;
  store_id: string | null;
  transaction_date: string;
  transaction_time?: string | null;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  balance: number | null;
  reference: string | null;
  merchant: string | null;
  category: string | null;
  source: string;
  is_reconciled: boolean;
  transaction_category?: string | null;
  accounting_category?: string | null;
  classification_status?: string | null;
  financial_treatment?: string | null;
}

export interface CashflowSummary {
  incoming: number;
  outgoing: number;
  transactionCount: number;
  reconciledCount: number;
  unreconciledCount: number;
}

const BANK_TX_FIELDS = 'id,bank_account_id,store_id,transaction_date,transaction_time,description,amount,type,balance,reference,merchant,category,source,is_reconciled,transaction_category,accounting_category,classification_status,financial_treatment';

export class BankSyncService {
  static async getBankAccounts(): Promise<BankAccount[]> {
    const { data, error } = await supabase.from('store_bank_accounts').select('*').order('bank_name');
    if (error) { console.error('getBankAccounts error:', error); return []; }

    // Prefer the account configured as the live Google Sheets bank statement.
    // BankingClient auto-selects the first account, so this ensures the
    // configured statement is what is displayed by default.
    return (data || []).sort((a, b) => {
      const aGoogle = a.google_sheet_id ? 1 : 0;
      const bGoogle = b.google_sheet_id ? 1 : 0;
      return bGoogle - aGoogle || String(a.account_name || '').localeCompare(String(b.account_name || ''));
    });
  }

  static async getTransactions(accountId: string, limit = 250): Promise<BankTransaction[]> {
    const maxRows = Math.max(1, Math.min(limit, 5000));
    const pageSize = Math.min(500, maxRows);
    const all: BankTransaction[] = [];

    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const end = Math.min(offset + pageSize - 1, maxRows - 1);
      const { data, error } = await supabase
        .from('bank_transactions')
        .select(BANK_TX_FIELDS)
        .eq('bank_account_id', accountId)
        .order('transaction_date', { ascending: false })
        .order('transaction_time', { ascending: false, nullsFirst: false })
        .range(offset, end);
      if (error) { console.error('getTransactions error:', error); return all; }
      all.push(...((data || []) as BankTransaction[]));
      if (!data || data.length < pageSize) break;
    }
    return all;
  }

  static async getCashflowSummary(days = 30): Promise<CashflowSummary> {
    const empty: CashflowSummary = { incoming: 0, outgoing: 0, transactionCount: 0, reconciledCount: 0, unreconciledCount: 0 };
    const { data, error } = await supabase.rpc('get_bank_cashflow_summary', { p_days: Math.max(1, days) });
    if (error) {
      console.error('getCashflowSummary error:', error);
      return empty;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return empty;
    return {
      incoming: Number(row.incoming || 0),
      outgoing: Number(row.outgoing || 0),
      transactionCount: Number(row.transaction_count || 0),
      reconciledCount: Number(row.reconciled_count || 0),
      unreconciledCount: Number(row.unreconciled_count || 0),
    };
  }

  static async syncGoogleSheet(accountId: string): Promise<{ success: boolean; inserted?: number; updated?: number; duplicates?: number; latest_balance?: number | null; error?: string }> {
    const { data, error } = await supabase.functions.invoke('sync-bank-statements', { body: { bank_account_id: accountId } });
    if (error) { console.error('syncGoogleSheet error:', error); return { success: false, error: error.message }; }
    return data || { success: false, error: 'Empty sync response' };
  }

  static async createBankAccount(account: Partial<BankAccount>): Promise<BankAccount> {
    const { data, error } = await supabase.from('store_bank_accounts').insert([account]).select().single();
    if (error) { console.error('createBankAccount error:', error); throw error; }
    return data;
  }
}
