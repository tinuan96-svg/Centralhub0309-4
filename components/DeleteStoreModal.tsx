'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface DeleteStoreModalProps {
  storeId: string;
  storeName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function DeleteStoreModal({ storeId, storeName, onClose, onSuccess }: DeleteStoreModalProps) {
  const router = useRouter();
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'warning' | 'confirm'>('warning');

  const isConfirmationValid = confirmationText === storeName;

  const handleDelete = async () => {
    if (!isConfirmationValid) return;

    setIsDeleting(true);
    setError(null);

    try {
      const { data, error: deleteError } = await supabase.rpc('delete_store', {
        p_store_id: storeId,
      });

      if (deleteError) {
        throw deleteError;
      }

      if (onSuccess) {
        onSuccess();
        onClose();
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: any) {
      console.error('Error deleting store:', err);
      setError(err.message || 'Failed to delete store');
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full overflow-hidden">
        {step === 'warning' && (
          <>
            <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-6">
              <div className="flex items-center gap-3">
                <span className="text-4xl">⚠️</span>
                <div>
                  <h3 className="font-bold text-xl">Delete Store Warning</h3>
                  <p className="text-red-100 text-sm">This action cannot be undone</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                <h4 className="font-bold text-red-900 mb-2 flex items-center gap-2">
                  <span className="text-xl">🔥</span>
                  Critical Warning
                </h4>
                <p className="text-red-800 text-sm mb-3">
                  You are about to permanently delete <strong>{storeName}</strong> and ALL related data.
                </p>
                <p className="text-red-700 text-sm font-semibold">
                  This will delete:
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-red-200 rounded p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🛍️</span>
                    <p className="font-semibold text-gray-900 text-sm">All Orders</p>
                  </div>
                  <p className="text-xs text-gray-600">Order history, items, shipments</p>
                </div>

                <div className="bg-white border border-red-200 rounded p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">📦</span>
                    <p className="font-semibold text-gray-900 text-sm">Store Products</p>
                  </div>
                  <p className="text-xs text-gray-600">Product overrides & settings</p>
                </div>

                <div className="bg-white border border-red-200 rounded p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">💰</span>
                    <p className="font-semibold text-gray-900 text-sm">Financial Data</p>
                  </div>
                  <p className="text-xs text-gray-600">Payments, VAT, expenses</p>
                </div>

                <div className="bg-white border border-red-200 rounded p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">📊</span>
                    <p className="font-semibold text-gray-900 text-sm">Analytics</p>
                  </div>
                  <p className="text-xs text-gray-600">Profit reports, statistics</p>
                </div>

                <div className="bg-white border border-red-200 rounded p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🏷️</span>
                    <p className="font-semibold text-gray-900 text-sm">Promotions</p>
                  </div>
                  <p className="text-xs text-gray-600">Campaigns, pricing rules</p>
                </div>

                <div className="bg-white border border-red-200 rounded p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🏠</span>
                    <p className="font-semibold text-gray-900 text-sm">Homepage</p>
                  </div>
                  <p className="text-xs text-gray-600">Featured sections, layouts</p>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                  <span className="text-lg">✅</span>
                  What will NOT be deleted:
                </h4>
                <ul className="text-sm text-green-800 space-y-1 list-disc list-inside">
                  <li>Global products (shared across stores)</li>
                  <li>Users and admin accounts</li>
                  <li>Suppliers and supplier data</li>
                  <li>Brands and categories</li>
                </ul>
              </div>
            </div>

            <div className="bg-gray-50 border-t border-gray-200 p-6 flex items-center justify-between">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('confirm')}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
              >
                I Understand, Continue →
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div className="bg-gradient-to-r from-red-700 to-red-800 text-white p-6">
              <div className="flex items-center gap-3">
                <span className="text-4xl">🔒</span>
                <div>
                  <h3 className="font-bold text-xl">Final Confirmation Required</h3>
                  <p className="text-red-100 text-sm">Type store name to confirm deletion</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-5">
                <p className="text-red-900 font-semibold mb-3">
                  To confirm deletion, type the store name exactly:
                </p>
                <p className="text-2xl font-bold text-red-700 bg-white border-2 border-red-300 rounded px-4 py-3 mb-4 font-mono">
                  {storeName}
                </p>

                <input
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder="Type store name here..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-lg"
                  autoFocus
                />

                {confirmationText && !isConfirmationValid && (
                  <p className="text-red-600 text-sm mt-2">Store name does not match</p>
                )}

                {isConfirmationValid && (
                  <p className="text-green-600 text-sm mt-2 flex items-center gap-1">
                    <span>✓</span> Confirmation valid
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-100 border border-red-300 rounded-lg p-4">
                  <p className="text-red-800 font-semibold">Error:</p>
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}
            </div>

            <div className="bg-gray-50 border-t border-gray-200 p-6 flex items-center justify-between">
              <button
                onClick={() => setStep('warning')}
                disabled={isDeleting}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50"
              >
                ← Back
              </button>
              <button
                onClick={handleDelete}
                disabled={!isConfirmationValid || isDeleting}
                className="px-8 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting Store...' : 'DELETE STORE PERMANENTLY'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
