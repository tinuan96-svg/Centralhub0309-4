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

  static async getTransactions(accountId: string, limit = 5000): Promise<BankTransaction[]> {
    const pageSize = 1000;
    const all: BankTransaction[] = [];
    const maxRows = Math.max(1, limit);
    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const end = Math.min(offset + pageSize - 1, maxRows - 1);
      const { data, error } = await supabase.from('bank_transactions').select('*').eq('bank_account_id', accountId).order('transaction_date', { ascending: false }).order('transaction_time', { ascending: false, nullsFirst: false }).range(offset, end);
      if (error) { console.error('getTransactions error:', error); return all; }
      all.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return all;
  }

  static async getCashflowSummary(days = 30): Promise<CashflowSummary> {
    const empty: CashflowSummary = { incoming: 0, outgoing: 0, transactionCount: 0, reconciledCount: 0, unreconciledCount: 0 };
    const { data: activeAccounts, error: accountError } = await supabase
      .from('store_bank_accounts')
      .select('id')
      .eq('is_active', true);

    if (accountError) {
      console.error('getCashflowSummary account lookup error:', accountError);
      return empty;
    }

    const activeAccountIds = (activeAccounts || []).map((account) => account.id).filter(Boolean);
    if (activeAccountIds.length === 0) return empty;

    const start = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const pageSize = 1000;
    const all: Pick<BankTransaction, 'amount' | 'type' | 'is_reconciled'>[] = [];

    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('amount,type,is_reconciled')
        .in('bank_account_id', activeAccountIds)
        .gte('transaction_date', start)
        .order('transaction_date', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) {
        console.error('getCashflowSummary error:', error);
        return empty;
      }
      all.push(...((data || []) as Pick<BankTransaction, 'amount' | 'type' | 'is_reconciled'>[]));
      if (!data || data.length < pageSize) break;
    }

    return all.reduce<CashflowSummary>((summary, transaction) => {
      const amount = Math.abs(Number(transaction.amount) || 0);
      if (transaction.type === 'credit') summary.incoming += amount;
      if (transaction.type === 'debit') summary.outgoing += amount;
      summary.transactionCount += 1;
      if (transaction.is_reconciled) summary.reconciledCount += 1;
      else summary.unreconciledCount += 1;
      return summary;
    }, { ...empty });
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
