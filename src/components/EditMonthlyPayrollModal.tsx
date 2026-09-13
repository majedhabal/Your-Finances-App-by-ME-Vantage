import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Coins, Calendar, Repeat, Check, Loader2, DollarSign, ArrowUpRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getCurrentPeriodYearMonth } from '../lib/salaryBreakdownUtils';
import { triggerHaptic, hapticPresets } from '../lib/haptics';

interface EditMonthlyPayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  currency: string;
  currentSalaryAmount: number;
  recurringIncomes?: any[];
  onSuccess?: () => void;
}

export const EditMonthlyPayrollModal: React.FC<EditMonthlyPayrollModalProps> = ({
  isOpen,
  onClose,
  uid,
  currency,
  currentSalaryAmount,
  recurringIncomes = [],
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [amountInput, setAmountInput] = useState<string>('');
  const [scope, setScope] = useState<'this_month' | 'future'>('future');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const currentPeriodKey = getCurrentPeriodYearMonth();

  useEffect(() => {
    if (isOpen) {
      setAmountInput(currentSalaryAmount > 0 ? String(currentSalaryAmount) : '12000');
      setScope('future');
      window.dispatchEvent(new CustomEvent('salary-modal-toggled', { detail: { isOpen: true } }));
      window.dispatchEvent(new CustomEvent('edit-payroll-modal-toggled', { detail: { isOpen: true } }));
    } else {
      window.dispatchEvent(new CustomEvent('salary-modal-toggled', { detail: { isOpen: false } }));
      window.dispatchEvent(new CustomEvent('edit-payroll-modal-toggled', { detail: { isOpen: false } }));
    }
    return () => {
      window.dispatchEvent(new CustomEvent('salary-modal-toggled', { detail: { isOpen: false } }));
      window.dispatchEvent(new CustomEvent('edit-payroll-modal-toggled', { detail: { isOpen: false } }));
    };
  }, [isOpen, currentSalaryAmount]);

  if (!isOpen) return null;

  const numericAmount = parseFloat(amountInput) || 0;



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || numericAmount <= 0) return;

    triggerHaptic(hapticPresets.medium);
    setIsSubmitting(true);

    try {
      const batch = writeBatch(db);
      const currentYM = getCurrentPeriodYearMonth();

      // 1. Fetch or filter recurring income transactions
      let targetIncomes = recurringIncomes && recurringIncomes.length > 0 ? recurringIncomes : [];

      if (targetIncomes.length === 0) {
        const q = query(collection(db, `users/${uid}/recurringTransactions`));
        const snap = await getDocs(q);
        targetIncomes = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter((item: any) => {
            const isIncome = (item.transactionType === 'income' || item.type === 'income' || item.transactionType === 'inflow' || item.type === 'inflow') &&
              item.transactionType !== 'expense' && item.transactionType !== 'outflow' && item.transactionType !== 'transfer' &&
              item.type !== 'expense' && item.type !== 'outflow' && item.type !== 'transfer';
            return isIncome && item.isActive !== false;
          });
      }

      if (targetIncomes.length === 0) {
        // Create a new recurring payroll transaction document
        const newRecRef = doc(collection(db, `users/${uid}/recurringTransactions`));
        const payload: any = {
          userId: uid,
          title: 'Monthly Payroll',
          notes: 'Monthly Payroll',
          amount: numericAmount,
          transactionType: 'income',
          type: 'income',
          category: 'Salary',
          subcategory: 'Wage',
          frequency: 'Monthly',
          dayOption: 28,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (scope === 'this_month') {
          payload.periodOverrides = { [currentYM]: numericAmount };
        }

        batch.set(newRecRef, payload);
      } else {
        // Update existing recurring income streams
        for (const rec of targetIncomes) {
          const recRef = doc(db, `users/${uid}/recurringTransactions`, rec.id);
          if (scope === 'this_month') {
            const existingOverrides = rec.periodOverrides || {};
            batch.update(recRef, {
              periodOverrides: {
                ...existingOverrides,
                [currentYM]: numericAmount,
              },
              updatedAt: serverTimestamp(),
            });
          } else {
            // All future transactions: update baseline amount
            const existingOverrides = { ...(rec.periodOverrides || {}) };
            delete existingOverrides[currentYM];
            batch.update(recRef, {
              amount: numericAmount,
              periodOverrides: existingOverrides,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      // 2. Synchronize current month's salaryBreakdown document
      const sbRef = doc(db, `users/${uid}/salaryBreakdowns/${currentYM}`);
      const sbSnap = await getDoc(sbRef);
      if (sbSnap.exists()) {
        batch.update(sbRef, {
          baseSalary: numericAmount,
          baseSalaryInput: numericAmount,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(sbRef, {
          baseSalary: numericAmount,
          baseSalaryInput: numericAmount,
          yearMonth: currentYM,
          currency: currency || 'AED',
          isConfirmed: false,
          isBreakdownConfigured: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      // 3. Update any upcoming draft or pending income transactions
      const txQuery = query(
        collection(db, `users/${uid}/transactions`),
        where('type', '==', 'income')
      );
      const txSnap = await getDocs(txQuery);
      txSnap.docs.forEach((d) => {
        const data = d.data();
        const txDate = data.date || '';
        const txYM = typeof txDate === 'string' ? txDate.substring(0, 7) : '';

        const isMatchingPeriod = scope === 'this_month' ? txYM === currentYM : txYM >= currentYM;
        const isDraftOrUpcoming = data.status === 'draft' || data.isUpcoming === true || data.status === 'pending';

        if (isMatchingPeriod && isDraftOrUpcoming) {
          batch.update(doc(db, `users/${uid}/transactions`, d.id), {
            amount: numericAmount,
            updatedAt: serverTimestamp(),
          });
        }
      });

      await batch.commit();
      setIsSubmitting(false);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to update monthly payroll amount:', err);
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 12 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-white border border-[#E1E8ED] rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-4 z-10 overflow-hidden"
          style={{ fontFamily: "'Google Sans', sans-serif" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#111C2D]">
                {t('edit_payroll.title', 'Edit your monthly salary')}
              </h2>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer border-none"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Amount Input Section */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-3">
              <label className="block text-xs font-bold text-gray-700">
                {t('edit_payroll.amount_label', 'New Monthly Payroll Amount')} ({currency})
              </label>

              <div className="relative flex items-center">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-[45px] pl-4 pr-16 text-sm font-bold text-[#111C2D] bg-white border border-[#E1E8ED] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#366945]/40 focus:border-[#366945] transition-all shadow-xs"
                />
                <span className="absolute right-4 text-sm font-bold text-gray-400 pointer-events-none">
                  {currency}
                </span>
              </div>


            </div>

            {/* Application Scope Question */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-[#111C2D]">
                {t('edit_payroll.scope_question', 'Is it for this month or for all future transactions?')}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Option 1: Only for this month */}
                <div
                  onClick={() => {
                    triggerHaptic(hapticPresets.light);
                    setScope('this_month');
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 relative ${
                    scope === 'this_month'
                      ? 'bg-[#E8F8EE]/60 border-[#366945] ring-2 ring-[#366945]/20 shadow-xs'
                      : 'bg-white border-[#E1E8ED] hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-[#111C2D]">
                      {t('edit_payroll.only_this_month', 'Only for this month')}
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0 ${
                        scope === 'this_month' ? 'bg-[#366945] border-[#366945]' : 'border-gray-300'
                      }`}
                    >
                      {scope === 'this_month' && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                </div>

                {/* Option 2: For all future transactions */}
                <div
                  onClick={() => {
                    triggerHaptic(hapticPresets.light);
                    setScope('future');
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 relative ${
                    scope === 'future'
                      ? 'bg-[#E8F8EE]/60 border-[#366945] ring-2 ring-[#366945]/20 shadow-xs'
                      : 'bg-white border-[#E1E8ED] hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-[#111C2D]">
                      {t('edit_payroll.all_future_transactions', 'For all future transactions')}
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0 ${
                        scope === 'future' ? 'bg-[#366945] border-[#366945]' : 'border-gray-300'
                      }`}
                    >
                      {scope === 'future' && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:text-gray-900 rounded-xl transition-all cursor-pointer border-none"
              >
                {t('common.cancel', 'Cancel')}
              </button>

              <button
                type="submit"
                disabled={isSubmitting || numericAmount <= 0}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#366945] hover:bg-[#2e593a] active:scale-95 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:pointer-events-none cursor-pointer border-none"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>{t('common.saving', 'Saving...')}</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>{t('edit_payroll.save_changes', 'Update Monthly Payroll')}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
