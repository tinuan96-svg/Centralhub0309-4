import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export const useDashboardFilterStore = create<DashboardFilterState>()(
  persist(
    (set) => ({
      timeRange: '30days',
      comparisonType: 'previous',
      selectedStoreId: 'all',
      customStartDate: null,
      customEndDate: null,

      setTimeRange: (timeRange) => set({ timeRange }),
      setComparisonType: (comparisonType) => set({ comparisonType }),
      setSelectedStoreId: (selectedStoreId) => set({ selectedStoreId }),
      setCustomDates: (customStartDate, customEndDate) => set({ customStartDate, customEndDate }),
    }),
    {
      name: 'centralhub-dashboard-filters',
    }
  )
);
