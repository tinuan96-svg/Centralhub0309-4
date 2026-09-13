import { create } from 'zustand';

export type TimeRange = 'today' | '7days' | '30days' | 'month' | 'year' | 'custom';
export type ComparisonType = 'previous' | 'lastYear' | 'none';

interface DashboardFilterState {
  timeRange: TimeRange;
  comparisonType: ComparisonType;
  selectedStoreId: string | 'all';
  customStartDate: string | null;
  customEndDate: string | null;

  setTimeRange: (range: TimeRange) => void;
  setComparisonType: (type: ComparisonType) => void;
  setSelectedStoreId: (storeId: string | 'all') => void;
  setCustomDates: (start: string | null, end: string | null) => void;
}

/**
 * Dashboard scope is intentionally session-local.
 *
 * CentralHub has one super-admin and the dashboard is expected to open with the
 * same neutral scope everywhere: All stores + Month + Previous period. Persisting
 * these filters in localStorage caused Chrome and the Android WebView to remember
 * different scopes, making the same live backend appear inconsistent across
 * devices. Keep the state in Zustand for navigation within the current app
 * session, but never persist it across reloads/devices.
 */
export const useDashboardFilterStore = create<DashboardFilterState>()((set) => ({
  timeRange: '30days',
  comparisonType: 'previous',
  selectedStoreId: 'all',
  customStartDate: null,
  customEndDate: null,

  setTimeRange: (timeRange) => set({ timeRange }),
  setComparisonType: (comparisonType) => set({ comparisonType }),
  setSelectedStoreId: (selectedStoreId) => set({ selectedStoreId }),
  setCustomDates: (customStartDate, customEndDate) => set({ customStartDate, customEndDate }),
}));
