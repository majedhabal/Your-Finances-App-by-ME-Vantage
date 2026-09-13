import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Edit3, Trash2, Save, Calendar, Tag, GitBranch, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Building2, Menu, Clock } from 'lucide-react';
import { doc, updateDoc, deleteDoc, serverTimestamp, collection, getDocs, query, where, writeBatch, increment, getDoc, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MASTER_CATEGORIES } from '../lib/constants';
import { ConfirmationModal } from './ConfirmationModal';
import { EditRecurringScopeModal } from './EditRecurringScopeModal';
import { useTranslation } from '@/lib/i18n';
import { formatLabel, translateCategoryOrSubcategory } from '../lib/stringUtils';

const IMPULSE_CATEGORIES = [
  { id: 'craving', label: '🍔 Craving & Indulgence' },
  { id: 'comparison', label: '👀 Social Comparison & Status' },
  { id: 'stress', label: '💆 Stress & Mood Fix' },
  { id: 'reward', label: '🎉 Reward & Celebration' },
  { id: 'fomo', label: '🏷️ Deal FOMO & Scarcity' },
  { id: 'low_energy', label: '⚡ Low Energy & Convenience' }
];

interface TransactionDetailModalProps {
  tx: any;
  uid: string;
  isOpen: boolean;
  onClose: () => void;
  onMakeRecurring?: (tx: any) => void;
  onDelete?: (transactionId: string, recurringId?: string, isTransfer?: boolean) => Promise<void>;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({ 
  tx: initialTx, uid, isOpen, onClose, onDelete 
}) => {
  const { t } = useTranslation();
  const [tx, setTx] = useState<any>(initialTx);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [budget, setBudget] = useState<any>(null);
  const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitCount, setSplitCount] = useState<number | string>(24);
  const [splitRecurrence, setSplitRecurrence] = useState<string>('monthly');
  const [interestRate, setInterestRate] = useState<number | string>(0);
  const [splitLoading, setSplitLoading] = useState(false);

  const baseAmt = Number(tx?.amount || initialTx?.amount || 0);
  const countNum = Number(splitCount) || 12;
  const intRateNum = Number(interestRate) || 0;
  const totalInterest = baseAmt * (intRateNum / 100) * (countNum / 12);
  const totalWithInterest = baseAmt + totalInterest;
  const perInstallmentAmount = countNum > 0 ? totalWithInterest / countNum : baseAmt;

  const handleSplitTransactionConfirm = async () => {
    if (!uid || !tx?.id) return;
    if (countNum <= 0) {
      alert("Please enter a valid number of transactions / installments.");
      return;
    }
    if (Math.abs(perInstallmentAmount) > Math.abs(baseAmt) && intRateNum === 0) {
      alert("Validation Error: The installment amount cannot exceed the total amount of the original transaction.");
      return;
    }
    const isIncome = (tx?.type || tx?.transactionType || '').toLowerCase() === 'income' || 
                     (tx?.type || tx?.transactionType || '').toLowerCase() === 'inflow';
    const recType = isIncome ? 'income' : 'expense';

    setSplitLoading(true);
    try {
      await addDoc(collection(db, 'users', uid, 'recurringTransactions'), {
        userId: uid,
        title: notes || tx?.notes || tx?.category || 'Installment Plan',
        amount: Number(perInstallmentAmount.toFixed(2)),
        totalAmount: baseAmt,
        totalWithInterest: Number(totalWithInterest.toFixed(2)),
        transactionType: recType,
        type: recType,
        recurrency: splitRecurrence.toLowerCase(),
        frequency: splitRecurrence,
        interval: 1,
        dayOption: new Date(date || tx?.date || Date.now()).getDate(),
        duration: 'numEvents',
        durationLimit: String(countNum),
        installmentsTotal: countNum,
        installmentsPaid: 0,
        eventsRemaining: countNum,
        interestRate: intRateNum,
        category: category || tx?.category || 'Shopping',
        subcategory: subCategory || tx?.subcategory || 'General',
        accountId: selectedAccountId || tx?.accountId,
        sourceAccountId: selectedAccountId || tx?.accountId,
        startDate: date || tx?.date || new Date().toISOString().split('T')[0],
        nextGenerationDate: date || tx?.date || new Date().toISOString().split('T')[0],
        nextExecutionDate: date || tx?.date || new Date().toISOString().split('T')[0],
        isActive: true,
        notes: `Installment plan: ${countNum} payments of ${perInstallmentAmount.toFixed(2)} (${notes || tx?.notes || ''})`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const txId = tx.id;
      if (!txId.startsWith('proj_')) {
        const txRef = doc(db, 'users', uid, 'transactions', txId);
        await updateDoc(txRef, {
          notes: `${notes || tx?.notes || ''} (Split into ${countNum} installments)`.trim(),
          isInstallment: true,
          installmentsTotal: countNum,
          installmentAmount: Number(perInstallmentAmount.toFixed(2)),
          totalAmount: baseAmt,
          updatedAt: serverTimestamp()
        });
      }

      setIsSplitModalOpen(false);
      onClose();
    } catch (e: any) {
      console.error("Error splitting transaction into installment plan:", e);
      alert(`Failed to split transaction: ${e?.message || 'Please verify details.'}`);
    } finally {
      setSplitLoading(false);
    }
  };

  // Balanced Form Fields
  const [notes, setNotes] = useState(tx?.notes || '');
  const [category, setCategory] = useState<string>(() => {
    return initialTx?.category || MASTER_CATEGORIES[0]?.name || 'General';
  });
  const [subCategory, setSubCategory] = useState<string>(() => {
    return initialTx?.subcategory || initialTx?.subCategory || '';
  });
  const [selectedAccountId, setSelectedAccountId] = useState(tx?.accountId || '');
  const [isImpulsive, setIsImpulsive] = useState(tx?.isImpulsive || false);
  const [impulseCategory, setImpulseCategory] = useState(tx?.impulseCategory || '⚡ Low Energy & Convenience');

  const to24HourTime = (t: string | undefined) => {
    if (!t) return '09:41';
    if (t.includes('AM') || t.includes('PM')) {
      const [timeStr, modifier] = t.split(' ');
      if (!timeStr) return '09:41';
      let [hours, minutes] = timeStr.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) return '09:41';
      if (modifier === 'PM' && hours !== 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:${String(minutes || 0).padStart(2, '0')}`;
    }
    return t;
  };

  const [time, setTime] = useState(to24HourTime(tx?.time || '09:41'));
  const [confirmationDate, setConfirmationDate] = useState(tx?.confirmationDate || tx?.date || '');
  const [date, setDate] = useState(tx?.date || '');
  const [amount, setAmount] = useState(tx?.amount || 0);

  // When the modal enters edit mode, verify category matching
  useEffect(() => {
    if (initialTx && isEditing) {
      setCategory(initialTx.category || 'General');
      setSubCategory(initialTx.subcategory || initialTx.subCategory || '');
    }
  }, [initialTx, isEditing]);

  // Fetch fresh transaction data on open
  useEffect(() => {
    const fetchFreshTx = async () => {
      if (!uid || !initialTx?.id) return;
      try {
        const txRef = doc(db, 'users', uid, 'transactions', initialTx.id);
        const docSnap = await getDoc(txRef);
        if (docSnap.exists()) {
          const freshTx = { id: docSnap.id, ...docSnap.data() } as any;
          console.log('DEBUG: freshTx data:', freshTx);
          setTx(freshTx);
          setNotes(freshTx.notes || '');
          
          // Prioritize budget categoryTitle, fallback to freshTx.category
          setCategory(budget?.categoryTitle || freshTx.category || '');
          setSubCategory(freshTx.subcategory || freshTx.subCategory || budget?.subcategory || 'General');
          setSelectedAccountId(freshTx.accountId || '');
          setIsImpulsive(freshTx.isImpulsive || false);
          setImpulseCategory(freshTx.impulseCategory || '⚡ Low Energy & Convenience');
          setTime(to24HourTime(freshTx.time || '09:41'));
          setConfirmationDate(freshTx.confirmationDate || freshTx.date || '');
          setDate(freshTx.date || '');
          setAmount(freshTx.amount || 0);
        }
      } catch (e) {
        console.error("Error fetching fresh transaction:", e);
      }
    };
    if (isOpen) {
      fetchFreshTx();
    }
  }, [isOpen, uid, initialTx?.id, budget]);

  useEffect(() => {
    const fetchAccounts = async () => {
      if (!uid) return;
      try {
        const q = query(collection(db, 'users', uid, 'accounts'));
        const snap = await getDocs(q);
        const accs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        setAccounts(accs);
      } catch (e) {
        console.error("Error fetching accounts:", e);
      }
    };
    fetchAccounts();
  }, [uid]);

  useEffect(() => {
    const fetchBudget = async () => {
      if (!uid || !tx?.budgetId) return;
      try {
        const budgetRef = doc(db, 'users', uid, 'miniBudgets', tx.budgetId);
        const docSnap = await getDoc(budgetRef);
        if (docSnap.exists()) {
          setBudget(docSnap.data());
        }
      } catch (e) {
        console.error("Error fetching budget:", e);
      }
    };
    fetchBudget();
  }, [uid, tx?.budgetId]);


  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('hide-header-footer');
    } else {
      document.body.style.overflow = 'auto';
      document.body.classList.remove('hide-header-footer');
    }
    
    // Dispatch event to hide/show footer
    window.dispatchEvent(new CustomEvent('tx-detail-modal-toggled', { detail: { isOpen } }));

    return () => {
      document.body.style.overflow = 'auto';
      document.body.classList.remove('hide-header-footer');
      window.dispatchEvent(new CustomEvent('tx-detail-modal-toggled', { detail: { isOpen: false } }));
    };
  }, [isOpen]);

  if (!isOpen || !tx) return null;

  const handleUpdateEntry = () => {
    if (tx?.recurringId) {
      setIsScopeModalOpen(true);
    } else {
      executeTransactionUpdate('only_this');
    }
  };

  const executeTransactionUpdate = async (scope: 'only_this' | 'future') => {
    const txId = tx?.id || initialTx?.id;
    if (!uid || !txId) {
      console.error("Missing uid or transaction id:", { uid, txId });
      alert("Failed to update transaction: Missing transaction reference.");
      return;
    }
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const isProj = txId.startsWith('proj_');
      const txRef = isProj 
        ? doc(collection(db, 'users', uid, 'transactions'))
        : doc(db, 'users', uid, 'transactions', txId);
      
      const newAmount = Number(amount) || 0;
      const oldAmount = Number(tx?.amount || initialTx?.amount || 0);
      const oldAccountId = tx?.accountId || initialTx?.accountId || '';
      const targetAccountId = selectedAccountId || oldAccountId;
      const isConfirmed = isProj || (tx?.status || initialTx?.status || '').toLowerCase() === 'confirmed';
      const isInflow = (tx?.type || initialTx?.type || '').toLowerCase() === 'inflow' || (tx?.type || initialTx?.type || '').toLowerCase() === 'income';

      // Update or create the transaction doc
      batch.set(txRef, {
        notes: notes || '', 
        category: category || 'General', 
        subCategory: subCategory || 'General',
        subcategory: subCategory || 'General',
        accountId: targetAccountId,
        time: time || '09:41',
        confirmationDate: confirmationDate || date || new Date().toISOString().split('T')[0],
        date: date || new Date().toISOString().split('T')[0],
        amount: newAmount, 
        type: tx?.type || initialTx?.type || 'expense',
        status: 'confirmed',
        recurringId: tx?.recurringId || initialTx?.recurringId || null,
        isImpulsive: isImpulsive,
        impulseCategory: isImpulsive ? impulseCategory : null,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (scope === 'future' && tx.recurringId) {
        const recRef = doc(db, 'users', uid, 'recurringTransactions', tx.recurringId);
        batch.set(recRef, {
          amount: newAmount,
          notes: notes || '',
          title: notes || '',
          category: category || 'General',
          subcategory: subCategory || 'General',
          sourceAccountId: targetAccountId,
          accountId: targetAccountId,
          isImpulsive: isImpulsive,
          impulseCategory: isImpulsive ? impulseCategory : null,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // Atomic Balance Update logic
      if (targetAccountId && typeof targetAccountId === 'string' && targetAccountId.trim() !== '') {
        if (isProj) {
          const accRef = doc(db, 'users', uid, 'accounts', targetAccountId);
          const balanceChange = isInflow ? newAmount : -newAmount;
          batch.set(accRef, {
            currentBalance: increment(balanceChange),
            updatedAt: serverTimestamp()
          }, { merge: true });
        } else if (isConfirmed) {
          if (oldAccountId && typeof oldAccountId === 'string' && oldAccountId.trim() !== '' && oldAccountId === targetAccountId) {
            // Same account, different amount
            const diff = newAmount - oldAmount;
            if (diff !== 0) {
              const balanceChange = isInflow ? diff : -diff;
              const accRef = doc(db, 'users', uid, 'accounts', targetAccountId);
              batch.set(accRef, {
                currentBalance: increment(balanceChange),
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          } else {
            // Account changed or old account missing: Revert old if valid, apply to new
            if (oldAccountId && typeof oldAccountId === 'string' && oldAccountId.trim() !== '') {
              const oldAccRef = doc(db, 'users', uid, 'accounts', oldAccountId);
              const oldBalanceRevert = isInflow ? -oldAmount : oldAmount;
              batch.set(oldAccRef, {
                currentBalance: increment(oldBalanceRevert),
                updatedAt: serverTimestamp()
              }, { merge: true });
            }

            if (targetAccountId && typeof targetAccountId === 'string' && targetAccountId.trim() !== '') {
              const newAccRef = doc(db, 'users', uid, 'accounts', targetAccountId);
              const newBalanceApply = isInflow ? newAmount : -newAmount;
              batch.set(newAccRef, {
                currentBalance: increment(newBalanceApply),
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          }
        }
      }

      await batch.commit();
      setIsEditing(false);
      setIsScopeModalOpen(false);
      onClose();
    } catch (e: any) {
      console.error("Cloud storage index modification fault:", e);
      alert(`Failed to update transaction: ${e?.message || 'Please verify account and amount details.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTrigger = async () => {
    if (!uid || !tx?.id) return;
    setLoading(true);
    try {
      const isConfirmed = initialTx.status?.toLowerCase() === 'confirmed';
      const isTransfer = initialTx.type?.toLowerCase() === 'transfer';
      const batch = writeBatch(db);

      if (isConfirmed) {
        // Revert balance for primary account
        if (initialTx.accountId) {
          const accRef = doc(db, 'users', uid, 'accounts', initialTx.accountId);
          const isInflow = initialTx.type?.toLowerCase() === 'inflow' || initialTx.type?.toLowerCase() === 'income';
          const amountRevert = isInflow ? -Number(initialTx.amount || 0) : Number(initialTx.amount || 0);
          batch.update(accRef, {
            currentBalance: increment(amountRevert),
            updatedAt: serverTimestamp()
          });
        }

        // Handle Transfer mirror revert
        if (isTransfer) {
          const toAccId = initialTx.toAccountId;
          if (toAccId) {
            const toAccRef = doc(db, 'users', uid, 'accounts', toAccId);
            const amountRevert = -Number(initialTx.amount || 0); // Receiver always subtracts what it got
            batch.update(toAccRef, {
              currentBalance: increment(amountRevert),
              updatedAt: serverTimestamp()
            });
          }
        }
      }

      // Handle mirrors for transfers if any
      if (isTransfer) {
        const q = query(collection(db, 'users', uid, 'transactions'), where("transferId", "==", tx.id));
        const mirrorSnap = await getDocs(q);
        mirrorSnap.forEach(d => {
          batch.delete(d.ref);
        });
      }

      if (onDelete) {
        // Commit revert and mirror deletion first
        await batch.commit(); 
        await onDelete(tx.id, tx.recurringId, isTransfer);
      } else {
        batch.delete(doc(db, 'users', uid, 'transactions', tx.id));
        await batch.commit();
      }
      
      setIsDeleteConfirmOpen(false);
      onClose();
    } catch (e) {
      console.error("Cloud storage index deletion fault:", e);
    } finally {
      setLoading(false);
    }
  };

  const isInflow = tx.type === 'Inflow' || tx.type === 'income';
  const isTransfer = tx.type === 'Transfer' || tx.type === 'transfer';

  const translateValue = (val: string) => {
    if (!val) return val;
    const trimmed = val.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'starting balance' || lower === 'starting_balance') return t('transaction_detail_modal.starting_balance');
    if (lower === 'salary account' || lower === 'salary_account') return t('transaction_detail_modal.salary_account');
    if (lower === 'adjustment' || lower === 'adjustment') return t('transaction_detail_modal.adjustment');
    return val;
  };

  const formatCategoryLabel = (categoryKey: string) => {
    console.log('DEBUG: formatCategoryLabel categoryKey:', categoryKey);
    const raw = (categoryKey || 'Others');
    const label = raw.includes('__') ? raw.split('__').pop()! : 
                 raw.includes(' — ') ? raw.split(' — ').pop()! :
                 raw.includes(' > ') ? raw.split(' > ').pop()! : raw;
    
    return translateCategoryOrSubcategory(label, t);
  };

  return (
    <AnimatePresence>
      <div key="tx-detail-modal-wrapper" className="fixed inset-0 z-[9999] flex items-center justify-center p-[clamp(0.75rem,3vw,1.5rem)] box-border">
        
        {/* Soft blur backdrop overlay mask */}
        <motion.div 
          key="tx-modal-backdrop"
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          className="absolute inset-0 bg-black/20" 
          onClick={onClose} 
        />

        {/* High-Fidelity Professional Window Card Shell */}
        <motion.div
          key="tx-modal-content"
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          className="relative w-full max-w-[460px] flex flex-col overflow-hidden bg-white shadow-2xl box-border max-h-[92vh] h-full"
          style={{
            borderRadius: '24px',
            border: '1px solid #F2F4F7'
          }}
        >
          {/* TOP HANDLE FOR MOBILE FEEL */}
          <div className="w-12 h-1 bg-neutral-200 rounded-full mx-auto mt-3 shrink-0" />

          {/* HEADER ROW BLOCK */}
          <div className="px-6 py-4 flex justify-between items-center border-b border-[#F2F4F7] shrink-0 bg-white select-none">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#a6ddb1] flex items-center justify-center text-[#366945]">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.div>
              </div>
              <span className="text-xl font-bold text-[#111c2d] font-sans">{t('transaction_detail_modal.details')}</span>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-white hover:bg-neutral-50 text-neutral-400 hover:text-neutral-600 flex items-center justify-center transition-all cursor-pointer border-none"><X size={20} /></button>
          </div>

          {/* TOTAL BALANCE METRIC DISPLAY */}
          <div className="pt-8 pb-6 text-center flex flex-col items-center bg-white select-none shrink-0">
            {isEditing ? (
              <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="max-w-[200px] bg-white border border-neutral-200 rounded-xl py-2 px-3 text-center text-3xl font-bold text-[#366945] focus:border-[#366945] outline-none font-sans" />
            ) : (
              <h2 className="text-5xl font-bold tracking-tight m-0 text-[#366945] font-sans">
                {isInflow ? '+' : '-'}{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
            )}
            <div className="w-full max-w-[280px] h-[1px] bg-gradient-to-r from-transparent via-neutral-100 to-transparent mt-6" />
          </div>

          {/* ITEM SCROLLABLE FIELD BENTO */}
          <div className="px-6 py-4 space-y-6 flex-1 overflow-y-auto custom-vantage-scrollbar box-border">
            <div className="p-3.5 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_12px_rgba(0,0,0,0.02)] min-h-[60px] box-border">
              <Menu size={18} className="text-[#366945] shrink-0" />
              <div className="flex flex-col justify-center w-full">
                <span className="text-[10px] font-bold text-[#414941] font-sans opacity-60 leading-tight">{t('transaction_detail_modal.description_memo')}</span>
                {isEditing ? (
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border-none outline-none font-sans font-bold text-sm text-[#111c2d] p-0 bg-transparent" />
                ) : (
                  <span className="truncate font-sans font-bold text-sm text-[#111c2d]">{translateValue(notes) || '—'}</span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_12px_rgba(0,0,0,0.02)] min-h-[60px] box-border transition-all">
              <Tag size={18} className="text-[#366945] shrink-0" />
              <div className="flex flex-col justify-center w-full">
                <span className="text-[10px] font-bold text-[#414941] font-sans opacity-60 leading-tight">{t('transaction_detail_modal.tracking_envelope')}</span>
                {isEditing && tx.classification !== 'starting_balance' ? (
                  <select 
                    value={category} 
                    onChange={(e) => {
                      const newCat = e.target.value;
                      setCategory(newCat);
                      const def = MASTER_CATEGORIES.find(c => c.name === newCat);
                      if (def && def.subcategories.length > 0) {
                        setSubCategory(def.subcategories[0]);
                      } else {
                        setSubCategory('General');
                      }
                    }} 
                    className="w-full bg-white border-none text-sm font-bold text-[#111c2d] outline-none cursor-pointer p-0 font-sans"
                  >
                    {MASTER_CATEGORIES.map((def) => (
                      <option key={def.name} value={def.name}>{translateCategoryOrSubcategory(def.name, t)}</option>
                    ))}
                  </select>
                ) : (
                  <span className="truncate font-sans capitalize font-bold text-sm text-[#111c2d]">{formatCategoryLabel(category)}</span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_12px_rgba(0,0,0,0.02)] min-h-[60px] box-border">
              <Menu size={18} className="text-[#366945] shrink-0" />
              <div className="flex flex-col justify-center w-full">
                <span className="text-[10px] font-bold text-[#414941] font-sans opacity-60 leading-tight">{t('transaction_detail_modal.sub_category')}</span>
                {isEditing && tx.classification !== 'starting_balance' ? (
                  <select 
                    value={subCategory} 
                    onChange={(e) => setSubCategory(e.target.value)} 
                    className="w-full bg-white border-none text-sm font-bold text-[#111c2d] outline-none cursor-pointer p-0 font-sans"
                  >
                    {(MASTER_CATEGORIES.find(c => c.name === category)?.subcategories || ['General']).map((sub) => (
                      <option key={sub} value={sub}>{translateCategoryOrSubcategory(sub, t)}</option>
                    ))}
                  </select>
                ) : (
                  <span className="font-sans font-bold text-sm text-[#111c2d]">{translateCategoryOrSubcategory(subCategory || 'General', t)}</span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_12px_rgba(0,0,0,0.02)] min-h-[60px] box-border">
              <Building2 size={18} className="text-[#366945] shrink-0" />
              <div className="flex flex-col justify-center w-full">
                <span className="text-[10px] font-bold text-[#414941] font-sans opacity-60 leading-tight">{t('transaction_detail_modal.salary_account')}</span>
                {isEditing ? (
                  <select 
                    value={selectedAccountId} 
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full bg-white border-none text-sm font-bold text-[#111c2d] outline-none cursor-pointer p-0 font-sans"
                  >
                    {accounts.length > 0 ? (
                      accounts.filter((a: any) => !a.isArchived || (a.accountId || a.id) === selectedAccountId).map((acc: any) => (
                        <option key={acc.accountId || acc.id} value={acc.accountId || acc.id}>{acc.name}</option>
                      ))
                    ) : (
                      <option value="">{t('common.loading') || 'Loading accounts...'}</option>
                    )}
                  </select>
                ) : (
                  <span className="font-sans font-bold text-sm text-[#111c2d]">
                    {translateValue(accounts.find(a => (a.accountId || a.id) === selectedAccountId)?.name || tx.accountName || t('common.checking_account'))}
                  </span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_12px_rgba(0,0,0,0.02)] min-h-[60px] box-border">
              <Calendar size={18} className="text-[#366945] shrink-0" />
              <div className="flex flex-col justify-center w-full">
                <span className="text-[10px] font-bold text-[#414941] font-sans opacity-60 leading-tight">{t('transaction_detail_modal.date', 'Date')}</span>
                {isEditing ? (
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border-none outline-none font-sans font-bold text-sm text-[#111c2d] p-0 bg-transparent" />
                ) : (
                  <span className="font-sans font-bold text-sm text-[#111c2d]">{tx.date}</span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_12px_rgba(0,0,0,0.02)] min-h-[60px] box-border">
              <Clock size={18} className="text-[#366945] shrink-0" />
              <div className="flex flex-col justify-center w-full">
                <span className="text-[10px] font-bold text-[#414941] font-sans opacity-60 leading-tight">{t('transaction_detail_modal.time', 'Time')}</span>
                {isEditing ? (
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full border-none outline-none font-sans font-bold text-sm text-[#111c2d] p-0 bg-transparent" />
                ) : (
                  <span className="font-sans font-bold text-sm text-[#111c2d]">{time || '09:41'}</span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)] min-h-[60px] box-border">
              <Calendar size={18} className="text-[#366945] shrink-0" />
              <div className="flex flex-col justify-center w-full">
                <span className="text-[10px] font-bold text-[#414941] font-sans opacity-60 leading-tight">{t('transaction_detail_modal.confirmation_date')}</span>
                {isEditing ? (
                  <input type="date" value={confirmationDate} onChange={(e) => setConfirmationDate(e.target.value)} className="w-full border-none outline-none font-sans font-bold text-sm text-[#111c2d] p-0 bg-transparent" />
                ) : (
                  <span className="font-sans font-bold text-sm text-[#111c2d]">{confirmationDate || tx.date}</span>
                )}
              </div>
            </div>

            {isEditing && (
              <div className="p-4 rounded-xl bg-[#f9fbfd] border border-neutral-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">⚡</span>
                    <div>
                      <label className="text-xs font-bold text-[#111c2d] font-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>Mark as Impulse / Unplanned</label>
                      <p className="text-[11px] text-[#6b7280] font-normal font-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>Categorize emotional or spontaneous spending</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsImpulsive(!isImpulsive)}
                    className={`w-12 h-6 rounded-full p-1 transition-all ${isImpulsive ? 'bg-[#366945]' : 'bg-[#d8d8e5]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-all ${isImpulsive ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {isImpulsive && (
                  <div className="space-y-2 pt-2 border-t border-neutral-200">
                    <label className="text-[10px] font-bold text-[#6b7280] block font-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>Select Emotional Motive</label>
                    <select
                      value={impulseCategory}
                      onChange={(e) => setImpulseCategory(e.target.value)}
                      className="w-full bg-white border border-[#d8d8e5] rounded-xl px-4 py-3 text-xs sm:text-sm text-[#111c2d] focus:border-[#a6ddb1] outline-none transition-all pr-10 font-sans font-bold"
                    >
                      {IMPULSE_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.label}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {!isEditing && tx.isImpulsive && (
              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/60 text-sm font-bold text-[#111c2d] flex items-center gap-3">
                <span className="text-base">⚡</span>
                <div className="flex flex-col justify-center w-full">
                  <span className="text-[10px] font-bold text-[#366945] font-sans opacity-80 leading-tight">Impulse / Unplanned Spending</span>
                  <span className="font-sans font-bold text-xs text-[#366945]">{tx.impulseCategory || '⚡ Low Energy & Convenience'}</span>
                </div>
              </div>
            )}
          </div>

          {/* LOWER OPERATIONAL CONTROL TRIGGER BUTTONS */}
          <div className="p-6 border-t border-[#F2F4F7] flex gap-4 select-none shrink-0 bg-white box-border">
            {isEditing ? (
              <>
                <motion.button whileTap={{ scale: 0.95, opacity: 0.9 }} type="button" onClick={() => setIsEditing(false)} className="flex-1 py-4 border border-neutral-200 rounded-xl bg-white text-[#414941] text-sm font-bold hover:bg-neutral-50 transition-all cursor-pointer font-sans">{t('transaction_detail_modal.cancel')}</motion.button>
                <motion.button whileTap={{ scale: 0.95, opacity: 0.9 }} type="button" onClick={handleUpdateEntry} disabled={loading} className="flex-1 py-4 rounded-xl bg-[#366945] text-white text-sm font-bold hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer border-none font-sans"><Save size={16} /><span>{t('transaction_detail_modal.save')}</span></motion.button>
              </>
            ) : (
              <div className="flex flex-col gap-2 w-full">
                <div className="flex gap-3">
                  <motion.button whileTap={{ scale: 0.95, opacity: 0.9 }} type="button" onClick={() => setIsEditing(true)} className="flex-1 py-3 border-2 border-[#366945] rounded-xl bg-white text-[#366945] text-sm font-bold hover:bg-[#366945]/5 transition-colors cursor-pointer font-sans">{t('transaction_detail_modal.edit_transaction')}</motion.button>
                  <motion.button whileTap={{ scale: 0.95, opacity: 0.9 }} type="button" onClick={() => setIsDeleteConfirmOpen(true)} className="flex-1 py-3 rounded-xl border-2 border-[#ba1a1a] bg-white text-[#ba1a1a] text-sm font-bold hover:bg-[#ba1a1a]/5 transition-colors cursor-pointer font-sans">{t('transaction_detail_modal.delete_transaction')}</motion.button>
                </div>
                <motion.button whileTap={{ scale: 0.95, opacity: 0.9 }} type="button" onClick={() => setIsSplitModalOpen(true)} className="w-full py-3.5 rounded-xl bg-[#366945] text-white text-sm font-bold hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer border-none font-sans shadow-sm">
                  <GitBranch size={16} />
                  <span>{t('transaction_detail_modal.split_transaction', 'Split transaction')}</span>
                </motion.button>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <ConfirmationModal key="tx-delete-confirm" isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={handleDeleteTrigger} title={t('transaction_detail_modal.delete_title')} message={t('transaction_detail_modal.delete_message')} confirmLabel={t('transaction_detail_modal.delete_confirm')} isLoading={loading} />
      <EditRecurringScopeModal
        isOpen={isScopeModalOpen}
        onClose={() => setIsScopeModalOpen(false)}
        onSelectScope={(scope) => executeTransactionUpdate(scope)}
        isLoading={loading}
      />

      {isSplitModalOpen && (
        <div key="split-tx-modal-wrapper" className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40" onClick={() => setIsSplitModalOpen(false)} />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-[440px] bg-white rounded-3xl p-6 shadow-2xl border border-neutral-100 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#366945] flex items-center justify-center">
                  <GitBranch size={18} />
                </div>
                <h3 className="text-lg font-bold text-[#111c2d] font-sans m-0">{t('transaction_detail_modal.split_transaction_title')}</h3>
              </div>
              <button onClick={() => setIsSplitModalOpen(false)} className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-500 flex items-center justify-center transition-all cursor-pointer border-none">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-neutral-500 font-normal font-sans m-0">
              Convert this transaction into a structured recurring installment plan over time (e.g., credit card installment plan).
            </p>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#414941] font-sans opacity-80">{t('transaction_detail_modal.split_count')}</label>
                <input 
                  type="number" 
                  min="1" 
                  max="120"
                  value={splitCount} 
                  onChange={(e) => setSplitCount(e.target.value)} 
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm font-bold text-[#111c2d] outline-none focus:border-[#366945] font-sans" 
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#414941] font-sans opacity-80">{t('transaction_detail_modal.split_recurrence')}</label>
                <select 
                  value={splitRecurrence} 
                  onChange={(e) => setSplitRecurrence(e.target.value)} 
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm font-bold text-[#111c2d] outline-none focus:border-[#366945] font-sans cursor-pointer"
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#414941] font-sans opacity-80">{t('transaction_detail_modal.split_interest')}</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0"
                  value={interestRate} 
                  onChange={(e) => setInterestRate(e.target.value)} 
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm font-bold text-[#111c2d] outline-none focus:border-[#366945] font-sans" 
                  placeholder="0.00"
                />
              </div>

              <div className="p-4 rounded-2xl bg-[#f8fafc] border border-neutral-200/60 space-y-2">
                <div className="flex justify-between text-xs text-neutral-600 font-normal font-sans">
                  <span>{t('transaction_detail_modal.original_amount')}:</span>
                  <span className="font-bold text-[#111c2d]">{baseAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {intRateNum > 0 && (
                  <div className="flex justify-between text-xs text-neutral-600 font-normal font-sans">
                    <span>{t('transaction_detail_modal.total_interest')}:</span>
                    <span className="font-bold text-amber-700">{totalInterest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-neutral-200 flex justify-between items-center text-sm font-bold text-[#366945]">
                  <span>{t('transaction_detail_modal.per_installment')}:</span>
                  <span className="text-lg">{perInstallmentAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {splitRecurrence}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setIsSplitModalOpen(false)} 
                className="flex-1 py-3 border border-neutral-200 rounded-xl bg-white text-neutral-700 text-sm font-bold hover:bg-neutral-50 transition-all cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button 
                type="button" 
                disabled={splitLoading} 
                onClick={handleSplitTransactionConfirm} 
                className="flex-1 py-3 rounded-xl bg-[#366945] text-white text-sm font-bold hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer border-none font-sans shadow-sm"
              >
                {splitLoading ? <span>Processing...</span> : <span>{t('transaction_detail_modal.confirm_split')}</span>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};