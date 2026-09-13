import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, X, AlertCircle, ArrowRight, ShieldCheck, Wallet } from 'lucide-react';

interface ConfirmRecurringTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  transaction: any;
  accounts: any[];
}

export const ConfirmRecurringTransactionModal: React.FC<ConfirmRecurringTransactionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  transaction,
  accounts
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !transaction) return null;

  const targetAccId = transaction.accountId || transaction.sourceAccountId || (accounts && accounts.length > 0 ? accounts[0]?.id : '');
  const associatedAccount = accounts.find(a => a.id === targetAccId) || accounts[0];
  const currentBalance = Number(associatedAccount?.currentBalance || 0);
  const txAmount = Number(transaction.amount || 0);
  const isWageOrSalary = 
    (transaction.notes || '').toLowerCase().includes('salary') || 
    (transaction.notes || '').toLowerCase().includes('wage') || 
    (transaction.notes || '').toLowerCase().includes('pay') ||
    (transaction.category || '').toLowerCase().includes('salary') ||
    (transaction.category || '').toLowerCase().includes('wage') ||
    (transaction.type || '').toLowerCase() === 'income';

  const displayCategory = isWageOrSalary && (!transaction.category || transaction.category === 'Savings' || transaction.category === 'General' || transaction.category === 'Recurring')
    ? 'Income > Wage' 
    : (transaction.subcategory ? `${transaction.category} > ${transaction.subcategory}` : (transaction.category || 'General'));
  const isIncome = (transaction.type || '').toLowerCase() === 'income' || (transaction.type || '').toLowerCase() === 'inflow' || isWageOrSalary;
  const postBalance = isIncome ? currentBalance + txAmount : currentBalance - txAmount;

  const handleConfirmAction = async () => {
    console.log("🟢 [DEBUG] ConfirmRecurringTransactionModal handleConfirmAction clicked for transaction:", transaction?.id);
    setIsSubmitting(true);
    try {
      await onConfirm();
      console.log("🟢 [DEBUG] ConfirmRecurringTransactionModal onConfirm resolved successfully");
      onClose();
    } catch (err) {
      console.error("❌ [DEBUG] Failed to confirm recurring transaction in modal:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-md bg-white rounded-2xl border border-neutral-200 shadow-xl overflow-hidden"
          style={{ fontFamily: "'Google Sans', sans-serif" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="text-[15px] text-neutral-900 font-bold" style={{ fontWeight: 700 }}>
                  Confirm Recurring Transaction
                </h3>
                <p className="text-[12px] text-neutral-500 font-normal" style={{ fontWeight: 400 }}>
                  Review account impact before confirming
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 flex items-center justify-center transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            {/* Transaction Summary Card */}
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-neutral-500 font-normal" style={{ fontWeight: 400 }}>
                  Transaction
                </span>
                <span className="text-[12px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold" style={{ fontWeight: 700 }}>
                  {displayCategory}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-neutral-900 font-bold truncate max-w-[220px]" style={{ fontWeight: 700 }}>
                  {transaction.notes || 'Recurring Transaction'}
                </span>
                <span className={`text-[15px] font-bold font-mono ${isIncome ? 'text-emerald-600' : 'text-neutral-900'}`} style={{ fontWeight: 700 }}>
                  {isIncome ? '+' : '-'}{associatedAccount?.currency || 'AED'} {txAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="text-[12px] text-neutral-400 font-normal pt-1 border-t border-neutral-200/40 flex items-center justify-between" style={{ fontWeight: 400 }}>
                <span>Scheduled Date: {transaction.date || new Date().toISOString().split('T')[0]}</span>
                <span>Frequency: {transaction.frequency || 'Monthly'}</span>
              </div>
            </div>

            {/* Account Balance Impact Preview */}
            <div className="space-y-2">
              <span className="text-[12px] text-neutral-700 font-bold block" style={{ fontWeight: 700 }}>
                Account Balance Impact
              </span>
              <div className="p-4 rounded-xl bg-white border border-neutral-200 space-y-3">
                <div className="flex items-center justify-between text-[13px]">
                  <div className="flex items-center gap-2 text-neutral-600">
                    <Wallet size={16} className="text-neutral-400" />
                    <span className="font-normal" style={{ fontWeight: 400 }}>{associatedAccount?.name || 'Primary Account'}</span>
                  </div>
                  <span className="text-neutral-900 font-bold font-mono" style={{ fontWeight: 700 }}>
                    {associatedAccount?.currency || 'AED'} {currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center justify-center py-1 text-neutral-400">
                  <ArrowRight size={16} className="rotate-90" />
                </div>

                <div className="flex items-center justify-between text-[13px] pt-2 border-t border-neutral-100">
                  <span className="text-neutral-800 font-bold" style={{ fontWeight: 700 }}>Updated Balance</span>
                  <span className={`font-bold font-mono text-[14px] ${postBalance < 0 ? 'text-amber-600' : 'text-emerald-700'}`} style={{ fontWeight: 700 }}>
                    {associatedAccount?.currency || 'AED'} {postBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Notice */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 text-[12px] text-emerald-900 font-normal" style={{ fontWeight: 400 }}>
              <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <span>Confirming this transaction will atomically update your account balance and ledger records securely.</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-neutral-50 border-t border-neutral-100">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 h-[38px] rounded-xl text-[13px] text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-100 font-normal transition-all cursor-pointer disabled:opacity-40"
              style={{ fontWeight: 400 }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleConfirmAction}
              className="px-5 h-[38px] rounded-xl text-[13px] text-neutral-900 bg-[#A6DDB1] hover:bg-[#A6DDB1]/90 hover:brightness-105 font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              style={{ fontWeight: 700 }}
            >
              {isSubmitting ? 'Processing...' : 'Confirm & Apply'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
