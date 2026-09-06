import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Store } from '../types';

interface StoreState {
  selectedStore: Store | null;
  stores: Store[];
  selectedProductIds: string[];
  setSelectedStore: (store: Store | null) => void;
  setStores: (stores: Store[]) => void;
  toggleProductSelection: (productId: string) => void;
  selectAllProducts: (productIds: string[]) => void;
  clearProductSelection: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      selectedStore: null, // Default: null represents ALL STORES
      stores: [],
      selectedProductIds: [],
      setSelectedStore: (store) => {
        set({ selectedStore: store });
      },
      setStores: (stores) => set({ stores }),
      toggleProductSelection: (productId) =>
        set((state) => ({
          selectedProductIds: state.selectedProductIds.includes(productId)
            ? state.selectedProductIds.filter((id) => id !== productId)
            : [...state.selectedProductIds, productId],
        })),
      selectAllProducts: (productIds) =>
        set({ selectedProductIds: productIds }),
      clearProductSelection: () => set({ selectedProductIds: [] }),
    }),
    {
      name: 'centralhub-storage',
      partialize: (state) => ({
        selectedStore: state.selectedStore,
      }),
    }
  )
);
