import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { triggerHaptic, hapticPresets } from '../lib/haptics';

export const MissingDaysModal: React.FC<any> = ({
  isOpen, onClose, uid, accounts = [], profile
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const activeAccounts = accounts.filter((acc: any) => !acc.isArchived);
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id || '');
  const [notes, setNotes] = useState('Missing days expenses');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeAccounts.length > 0 && !accountId) {
      setAccountId(activeAccounts[0].id);
    }
  }, [activeAccounts, accountId]);

  const selectedAccount = activeAccounts.find((a: any) => a.id === accountId);
  const accountCurrency = selectedAccount?.currency || profile?.baseCurrency || 'AED';

  const handleSave = async () => {
    if (!amount || !accountId || Number(amount) <= 0) return;
    setLoading(true);
    triggerHaptic(hapticPresets.medium);

    try {
      const transactionType = mode === 'income' ? 'Inflow' : 'Outflow';
      const today = new Date().toISOString().split('T')[0];

      const transactionData = {
        amount: Number(amount),
        currency: accountCurrency,
        notes: notes.trim() || 'Missing days transaction',
        category: 'Others',
        subcategory: 'Missing',
        subCategory: 'Missing',
        emoji: mode === 'income' ? '💰' : '📁',
        accountId,
        type: transactionType,
        date: today,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        createdAt: serverTimestamp(),
        status: 'confirmed',
        isRecurring: false
      };

      await addDoc(collection(db, 'users', uid, 'transactions'), transactionData);

      const accountRef = doc(db, 'users', uid, 'accounts', accountId);
      const amountChange = transactionType === 'Inflow' ? Number(amount) : -Number(amount);
      await updateDoc(accountRef, {
        currentBalance: increment(amountChange),
        updatedAt: serverTimestamp()
      });

      triggerHaptic(hapticPresets.success);
      setLoading(false);
      onClose();
    } catch (err) {
      console.error("Failed to add missing transaction:", err);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col"
          style={{ fontFamily: "'Google Sans', sans-serif" }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
            <h3 className="text-base font-bold text-neutral-900">Welcome Back</h3>
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-neutral-700 rounded-full transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
            <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-100 text-neutral-700 text-sm font-normal leading-relaxed">
              We know that life gets busy and we want to help you keep track of your finances. You can add below your total expenses for the missing days in order for your finances to match up
            </div>

            {/* Income / Expense Toggle */}
            <div className="flex gap-2 p-1 bg-neutral-100 rounded-xl">
              <button
                type="button"
                onClick={() => setMode('expense')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === 'expense' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                <ArrowDownRight size={14} className="text-rose-500" />
                <span>Expense</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('income')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === 'income' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                <ArrowUpRight size={14} className="text-emerald-500" />
                <span>Income</span>
              </button>
            </div>

            {/* Amount */}
            <div>
              <label className="text-[10px] font-bold text-neutral-500 mb-1 block">Total Amount ({accountCurrency})</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-base font-bold text-neutral-900 focus:border-[#a6ddb1] outline-none transition-all"
                  autoFocus
                />
              </div>
            </div>

            {/* Account Selector */}
            <div>
              <label className="text-[10px] font-bold text-neutral-500 mb-1 block">Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm font-normal text-neutral-900 focus:border-[#a6ddb1] outline-none transition-all cursor-pointer"
              >
                {activeAccounts.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency || 'AED'})
                  </option>
                ))}
              </select>
            </div>

            {/* Category / Sub-category badge info */}
            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between text-xs text-neutral-600">
              <span className="font-normal">Category & Sub-Category:</span>
              <span className="font-bold text-neutral-900 bg-white px-2.5 py-1 rounded-md border border-neutral-200 shadow-xs">
                Others › Missing
              </span>
            </div>

            {/* Notes */}
            <div>
              <label className="text-[10px] font-bold text-neutral-500 mb-1 block">Notes (Optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Missing days expenses"
                className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm font-normal text-neutral-900 focus:border-[#a6ddb1] outline-none transition-all"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50 transition-colors cursor-pointer"
            >
              Skip for Now
            </button>
            <button
              type="button"
              disabled={loading || !amount || Number(amount) <= 0}
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 transition-all cursor-pointer shadow-md flex items-center gap-2"
            >
              {loading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              <span>Save Transaction</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
