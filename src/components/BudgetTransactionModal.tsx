import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { collection, doc, serverTimestamp, setDoc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { evaluateMathExpression, MASTER_CATEGORIES } from '../lib/constants';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { useTranslation } from '@/lib/i18n';
import { translateCategoryOrSubcategory } from '../lib/stringUtils';
import { DEFAULT_RATES } from '../lib/exchangeRates';
import { getCanonicalCategoryId } from '../services/vantageAiContext';

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

export const BudgetTransactionModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess?: () => void;
  budget: any; // The budget object
  accounts: any[]; 
  profile: any;
  categories: any[];
}> = ({ isOpen, onClose, onSuccess, budget, accounts, profile, categories }) => {
  const { t } = useTranslation();
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [type, setType] = useState<'expense' | 'transfer'>('expense');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const selectedCategories = React.useMemo(() => {
    if (budget?.mappedCategories && budget.mappedCategories.length > 0) {
      return budget.mappedCategories;
    }
    if (budget?.category) {
      return [budget.category];
    }
    return [];
  }, [budget]);

  const selectedSubcategories = React.useMemo(() => {
    if (budget?.mappedSubCategories && budget.mappedSubCategories.length > 0) {
      return budget.mappedSubCategories.filter((s: string) => s && s !== 'All');
    }
    if (budget?.subcategory && budget.subcategory !== 'All') {
      return [budget.subcategory];
    }
    return [];
  }, [budget]);

  const availableCategoryOptions = React.useMemo(() => {
    const opts: { category: string; subcategory: string; label: string }[] = [];
    
    if (selectedSubcategories.length > 0) {
      selectedSubcategories.forEach(sub => {
        let parentCat = selectedCategories[0] || 'General';
        MASTER_CATEGORIES.forEach(catDef => {
          if (catDef.subcategories?.some(s => s.toLowerCase() === sub.toLowerCase())) {
            parentCat = catDef.name;
          }
        });
        opts.push({
          category: parentCat,
          subcategory: sub,
          label: `${translateCategoryOrSubcategory(parentCat, t)} > ${translateCategoryOrSubcategory(sub, t)}`
        });
      });
    }

    if (opts.length === 0 && selectedCategories.length > 0) {
      selectedCategories.forEach(cat => {
        opts.push({
          category: cat,
          subcategory: '',
          label: translateCategoryOrSubcategory(cat, t)
        });
      });
    }

    if (opts.length === 0) {
      const categoryTitleRaw = budget?.categoryTitle || budget?.title || '';
      let dCat = budget?.category || '';
      let dSub = budget?.subcategory || '';
      if (categoryTitleRaw.includes(' > ')) {
        const parts = categoryTitleRaw.split(' > ').map((s: string) => s.trim());
        dCat = dCat || parts[0];
        dSub = dSub || parts[1] || '';
      }
      opts.push({
        category: dCat || 'General',
        subcategory: dSub || '',
        label: dSub ? `${translateCategoryOrSubcategory(dCat, t)} > ${translateCategoryOrSubcategory(dSub, t)}` : translateCategoryOrSubcategory(dCat || 'General', t)
      });
    }

    return opts;
  }, [selectedCategories, selectedSubcategories, budget, t]);

  const [selectedCategoryOption, setSelectedCategoryOption] = useState<string>('');

  useEffect(() => {
    if (availableCategoryOptions.length > 0 && !selectedCategoryOption) {
      const first = availableCategoryOptions[0];
      setSelectedCategoryOption(`${first.category}__${first.subcategory}`);
    }
  }, [availableCategoryOptions]);

  const [chosenCat, chosenSub] = selectedCategoryOption.includes('__') 
    ? selectedCategoryOption.split('__') 
    : [availableCategoryOptions[0]?.category || 'General', availableCategoryOptions[0]?.subcategory || ''];

  const derivedCategory = chosenCat;
  const derivedSubcategory = chosenSub;

  const titleText = derivedSubcategory 
    ? translateCategoryOrSubcategory(derivedSubcategory, t) 
    : translateCategoryOrSubcategory(derivedCategory || 'General', t);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('budget-tx-modal-toggled', { detail: { isOpen } }));
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
      window.dispatchEvent(new CustomEvent('budget-tx-modal-toggled', { detail: { isOpen: false } }));
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
    if (type === 'transfer' && !destinationAccountId) return;
    setIsLoading(true);

    try {
      await runTransaction(db, async (transaction) => {
        const txRef = doc(collection(db, `users/${profile.uid}/transactions`));
        const txAmount = parseFloat(evaluateMathExpression(amount));
        
        // --- READS ---
        const sourceAccountRef = doc(db, `users/${profile.uid}/accounts`, sourceAccountId);
        const sourceAccountSnap = await transaction.get(sourceAccountRef);
        if (!sourceAccountSnap.exists()) throw new Error("Source account does not exist");
        
        let budgetSnap = null;
        if (type === 'expense') {
          const budgetRef = doc(db, `users/${profile.uid}/miniBudgets`, budget.id);
          budgetSnap = await transaction.get(budgetRef);
        }

        let destAccountSnap = null;
        if (type === 'transfer' && destinationAccountId) {
          const destAccountRef = doc(db, `users/${profile.uid}/accounts`, destinationAccountId);
          destAccountSnap = await transaction.get(destAccountRef);
          if (!destAccountSnap.exists()) throw new Error("Destination account does not exist");
        }

        // --- WRITES ---
        const sourceAccountData = sourceAccountSnap.data();
        const destAccountData = destAccountSnap ? destAccountSnap.data() : null;
        const sourceCurrency = sourceAccountData?.currency || 'AED';
        const destCurrency = destAccountData?.currency || 'AED';

        const sourceRate = getRateToAED(sourceCurrency);
        const destRate = getRateToAED(destCurrency);
        const sourceAmountInAED = txAmount * sourceRate;
        const destAmount = type === 'transfer' && destinationAccountId 
          ? (destCurrency === sourceCurrency ? txAmount : Number((sourceAmountInAED / destRate).toFixed(4)))
          : txAmount;

        const txData: any = {
          id: txRef.id,
          userId: profile.uid,
          accountId: sourceAccountId,
          amount: txAmount,
          currency: sourceCurrency,
          toAmount: type === 'transfer' ? destAmount : null,
          type: type === 'transfer' ? 'transfer' : 'expense',
          category: derivedCategory || 'General',
          categoryId: getCanonicalCategoryId(derivedCategory, derivedSubcategory),
          subcategory: derivedSubcategory || '',
          subCategory: derivedSubcategory || '', // Sync both keys
          destinationAccountId: type === 'transfer' ? destinationAccountId : null,
          notes: note || `${type === 'transfer' ? t("budget_modal.default_transfer_note", "Budget transfer") : t("budget_modal.default_expense_note", "Budget expense")}: ${titleText}`,
          date: new Date().toLocaleDateString('en-CA'),
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          createdAt: serverTimestamp(),
          status: 'confirmed',
          isRecurring: false,
          budgetId: budget.id
        };

        transaction.set(txRef, txData);

        const sourceBalance = sourceAccountData.currentBalance || 0;
        transaction.update(sourceAccountRef, { currentBalance: sourceBalance - txAmount, updatedAt: serverTimestamp() });

        if (type === 'expense' && budgetSnap?.exists()) {
             // (Removed spentAmount update: relying on ledger re-calculation)
        }

        if (type === 'transfer' && destinationAccountId && destAccountSnap?.exists()) {
          const destBalance = destAccountData.currentBalance || 0;
          const destAccountRef = doc(db, `users/${profile.uid}/accounts`, destinationAccountId);
          transaction.update(destAccountRef, { currentBalance: destBalance + destAmount, updatedAt: serverTimestamp() });
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
            <h4 className="font-bold text-lg mb-4 text-[#111c2d]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
              {t("budget_modal.add_transaction_title", "Add Transaction")}: {titleText}
            </h4>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-bold text-[#8c8c99] px-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                  {t("budget_modal.amount", "Amount")}
                </label>
                <input type="text" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))} onBlur={() => setAmount(prev => evaluateMathExpression(prev))} placeholder="0" className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-bold text-[#8c8c99] px-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                  {t("budget_modal.transaction_type", "Transaction Type")}
                </label>
                <select value={type} onChange={e => setType(e.target.value as 'expense' | 'transfer')} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                  <option value="expense">{t("budget_modal.expense", "Expense")}</option>
                  <option value="transfer">{t("budget_modal.transfer", "Transfer")}</option>
                </select>
              </div>

              {availableCategoryOptions.length > 1 && (
                <div className="flex flex-col gap-1">
                  <label className="text-[12px] font-bold text-[#8c8c99] px-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                    {t("budget_modal.select_category", "Select Category / Subcategory")}
                  </label>
                  <select 
                    value={selectedCategoryOption} 
                    onChange={e => setSelectedCategoryOption(e.target.value)} 
                    className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none" 
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  >
                    {availableCategoryOptions.map((opt, idx) => (
                      <option key={idx} value={`${opt.category}__${opt.subcategory}`}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-bold text-[#8c8c99] px-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                  {t("budget_modal.source_account", "Source Account")}
                </label>
                <select value={sourceAccountId} onChange={e => setSourceAccountId(e.target.value)} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                  {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
              </div>

              {type === 'transfer' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[12px] font-bold text-[#8c8c99] px-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                    {t("budget_modal.destination_account", "Destination Account")}
                  </label>
                  <select value={destinationAccountId} onChange={e => setDestinationAccountId(e.target.value)} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                    <option value="">{t("budget_modal.select_account", "Select Account")}</option>
                    {activeAccounts.filter(acc => acc.id !== sourceAccountId).map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
              )}
              
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-bold text-[#8c8c99] px-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                  {t("budget_modal.note", "Note")}
                </label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder={t("budget_modal.note_placeholder", "Note...")} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} />
              </div>

              <button type="submit" disabled={isLoading} className="w-full py-4 bg-[#a6ddb1] text-[#111c2d] rounded-2xl font-bold text-sm hover:brightness-105 transition-all" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
                {isLoading ? <RefreshCw className="animate-spin h-5 w-5 mx-auto"/> : t("budget_modal.commit_entry", "Confirm Transaction")}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
