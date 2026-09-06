export function getCurrencySymbol(currency: string | null | undefined): string {
  const currencyCode = (currency || 'GBP').toUpperCase();

  switch (currencyCode) {
    case 'GBP':
      return '£';
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'JPY':
      return '¥';
    case 'CHF':
      return 'CHF';
    case 'AUD':
      return 'A$';
    case 'CAD':
      return 'C$';
    default:
      return currencyCode;
  }
}

export function formatCurrency(amount: number | null | undefined, currency?: string | null): string {
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${(amount ?? 0).toFixed(2)}`;
}
