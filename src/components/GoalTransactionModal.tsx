import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { CollectionReference, collection, doc, serverTimestamp, setDoc, runTransaction, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { evaluateMathExpression } from '../lib/constants';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { useTranslation } from '@/lib/i18n';
import { DEFAULT_RATES } from '../lib/exchangeRates';

const getRateToAED = (curr: string) => {
  const c = curr || 'AED';
  if (c === 'AED') return 1;
  try {
    const cached = localStorage.getItem('vantage_exchange_rates');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed[c]) return parsed[c];
    }
  } catch (e) {}
  return (DEFAULT_RATES as any)[c] || 1;
};

export const GoalTransactionModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess?: () => void;
  target: any; // The milestone or debt object
  type: 'milestone' | 'debt';
  accounts: any[]; 
  profile: any;
}> = ({ isOpen, onClose, onSuccess, target, type, accounts, profile }) => {
  const { t } = useTranslation();
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [actionType, setActionType] = useState<'income' | 'transfer'>('income');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('hide-header-footer');
    } else {
      document.body.style.overflow = 'unset';
      document.body.classList.remove('hide-header-footer');
    }
    return () => {
      document.body.style.overflow = 'unset';
      document.body.classList.remove('hide-header-footer');
    };
  }, [isOpen]);

  const activeAccounts = accounts.filter(acc => !acc.isArchived);
  useEffect(() => {
    if (activeAccounts.length > 0 && !sourceAccountId) {
      setSourceAccountId(activeAccounts[0].id);
    }
  }, [activeAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid || !sourceAccountId || !amount) return;
    if (actionType === 'transfer' && !destinationAccountId) return;
    setIsLoading(true);

    try {
      const amountValue = parseFloat(evaluateMathExpression(amount));
      const today = new Date().toLocaleDateString('en-CA');
      const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      await runTransaction(db, async (transaction) => {
        const sourceAccRef = doc(db, `users/${profile.uid}/accounts`, sourceAccountId);
        
        if (actionType === 'transfer') {
          const sourceAccSnap = await transaction.get(sourceAccRef);
          const destAccRef = doc(db, `users/${profile.uid}/accounts`, destinationAccountId);
          const destAccSnap = await transaction.get(destAccRef);

          const sourceCurrency = sourceAccSnap.data()?.currency || 'AED';
          const destCurrency = destAccSnap.data()?.currency || 'AED';

          const sourceRate = getRateToAED(sourceCurrency);
          const destRate = getRateToAED(destCurrency);
          const sourceAmountInAED = amountValue * sourceRate;
          const destAmount = destCurrency === sourceCurrency 
            ? amountValue 
            : Number((sourceAmountInAED / destRate).toFixed(4));
          
          const outflowTxRef = doc(collection(db, `users/${profile.uid}/transactions`));
          const inflowTxRef = doc(collection(db, `users/${profile.uid}/transactions`));
          
          transaction.set(outflowTxRef, {
            id: outflowTxRef.id,
            userId: profile.uid,
            accountId: sourceAccountId,
            toAccountId: destinationAccountId,
            amount: amountValue,
            currency: sourceCurrency,
            toAmount: destAmount,
            type: 'Outflow',
            transactionType: 'transfer',
            category: 'Transfer',
            subcategory: 'Internal Transfer',
            notes: note || t('goal_transaction_modal.deposit_transfer', 'Transfer deposit: ') + target.name,
            date: today,
            time,
            createdAt: serverTimestamp(),
            status: 'confirmed',
            hasMirror: true
          });

          transaction.set(inflowTxRef, {
            id: inflowTxRef.id,
            userId: profile.uid,
            accountId: destinationAccountId,
            fromAccountId: sourceAccountId,
            amount: destAmount,
            currency: destCurrency,
            type: 'Inflow',
            transactionType: 'transfer',
            category: 'Transfer',
            subcategory: 'Internal Transfer',
            notes: note || t('goal_transaction_modal.deposit_transfer', 'Transfer deposit: ') + target.name,
            date: today,
            time,
            createdAt: serverTimestamp(),
            status: 'confirmed',
            hasMirror: true
          });

          transaction.update(sourceAccRef, {
            currentBalance: increment(-amountValue),
            updatedAt: serverTimestamp()
          });
          transaction.update(destAccRef, {
            currentBalance: increment(destAmount),
            updatedAt: serverTimestamp()
          });
        } else {
          // Income/Payment logic
          const txRef = doc(collection(db, `users/${profile.uid}/transactions`));
          const txData: any = {
            id: txRef.id,
            userId: profile.uid,
            accountId: sourceAccountId,
            amount: amountValue,
            type: 'Inflow',
            transactionType: 'income',
            category: type === 'milestone' ? 'Investments' : 'Financial Expenses',
            subcategory: type === 'milestone' ? 'Savings' : target.name,
            notes: note || t('goal_transaction_modal.deposit_income', 'Income deposit: ') + target.name,
            date: today,
            time,
            createdAt: serverTimestamp(),
            status: 'confirmed'
          };
          
          if (type === 'milestone') txData.milestoneId = target.id;
          else txData.debtAccountId = target.accountId;
          
          transaction.set(txRef, txData);
          transaction.update(sourceAccRef, {
            currentBalance: increment(amountValue),
            updatedAt: serverTimestamp()
          });
        }
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}/transactions`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-start justify-center p-3 sm:p-4 overflow-y-auto bg-black/20 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0" />
          <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-[400px] mt-8 mb-24 bg-white border border-[#E1E8ED] rounded-[1.5rem] p-6 pb-12 shadow-2xl">
            <h4 className="font-bold text-lg mb-4 text-[#111c2d]">{t('goal_transaction_modal.add_transaction', 'Add Transaction')} - {target.name}</h4>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8c8c99] px-1">{t('goal_transaction_modal.transaction_type', 'Transaction Type')}</label>
                <select value={actionType} onChange={e => setActionType(e.target.value as 'income' | 'transfer')} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none">
                  <option value="income">{t('goal_transaction_modal.option_income', 'Income')}</option>
                  <option value="transfer">{t('goal_transaction_modal.option_transfer', 'Transfer')}</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8c8c99] px-1">{t('goal_transaction_modal.source_account', 'Source Account')}</label>
                <select value={sourceAccountId} onChange={e => setSourceAccountId(e.target.value)} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none">
                  {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
              </div>

              {actionType === 'transfer' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8c8c99] px-1">{t('goal_transaction_modal.destination_account', 'Destination Account')}</label>
                  <select value={destinationAccountId} onChange={e => setDestinationAccountId(e.target.value)} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none">
                    <option value="">{t('goal_transaction_modal.select_account', 'Select Account')}</option>
                    {activeAccounts.filter(acc => acc.id !== sourceAccountId).map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
              )}
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8c8c99] px-1">{t('goal_transaction_modal.amount', 'Amount')}</label>
                <input type="text" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))} onBlur={() => setAmount(prev => evaluateMathExpression(prev))} placeholder="0" className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8c8c99] px-1">{t('goal_transaction_modal.note', 'Note')}</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder={t('goal_transaction_modal.placeholder_note', 'Note...')} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none" />
              </div>

              <button type="submit" disabled={isLoading} className="w-full py-4 bg-[#a6ddb1] text-[#111c2d] rounded-2xl font-bold text-sm hover:brightness-105 transition-all">
                {isLoading ? <RefreshCw className="animate-spin h-5 w-5 mx-auto"/> : t('goal_transaction_modal.btn_commit_entry', 'Commit Entry')}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
