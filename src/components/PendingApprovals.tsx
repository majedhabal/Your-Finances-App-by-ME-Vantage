import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '@/lib/i18n';
import { Check, Trash2, Clock, RefreshCw, AlertCircle, ArrowUpRight, ArrowDownLeft, Landmark, Calendar, ShieldCheck } from 'lucide-react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp, getDocs, getDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { TransactionDetailModal } from './TransactionDetailModal';
import { ConfirmationModal } from './ConfirmationModal';
import { ConfirmRecurringTransactionModal } from './ConfirmRecurringTransactionModal';
import { getCachedAccessToken, connectGoogleWorkspace, createGoogleTask } from '../lib/googleAuth';
import { handleApprovalAction } from '../services/recurringService';
import { getCanonicalCategoryId } from '../services/vantageAiContext';

interface PendingApprovalsProps {
  uid: string;
  accounts: any[];
  onTransactionApproved?: () => void;
}

export const PendingApprovals: React.FC<PendingApprovalsProps> = ({ uid, accounts, onTransactionApproved }) => {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<any[]>([]);
  const [pendingApprovalsList, setPendingApprovalsList] = useState<any[]>([]);
  const [recurringTxs, setRecurringTxs] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [txToDelete, setTxToDelete] = useState<any | null>(null);
  const [confirmingTx, setConfirmingTx] = useState<any | null>(null);

  const handleToggleSyncToTasks = async (tx: any, acc: any) => {
    try {
      let token = getCachedAccessToken();
      if (!token) {
        token = await connectGoogleWorkspace();
      }
      if (!token) {
        alert(t('pending_approvals.google_auth_required', 'Google authorization is required to sync to Google Tasks.'));
        return;
      }

      const taskDetails = {
        title: tx.notes || 'Scheduled Transfer',
        amount: tx.amount,
        currency: acc?.currency || 'AED',
        accountName: acc?.name || 'Account',
        dueDate: tx.date || new Date().toISOString().split('T')[0]
      };

      const res = await createGoogleTask(token, taskDetails);
      if (res && res.id) {
        const txRef = doc(db, `users/${uid}/transactions`, tx.id);
        await updateDoc(txRef, {
          isSyncedToTasks: true,
          googleTaskId: res.id
        });
        alert(t('pending_approvals.sync_success', 'Successfully synced "{{notes}}" as a task in Google Tasks!', { notes: tx.notes }));
      }
    } catch (err: any) {
      console.error(err);
      alert(t('pending_approvals.sync_error', 'Error syncing to Google Tasks: {{message}}', { message: err.message }));
    }
  };

  const [allTxs, setAllTxs] = useState<any[]>([]);

  useEffect(() => {
    if (!uid) return;

    // Listen to Dedicated Pending Approvals collection
    const qPending = query(
      collection(db, `users/${uid}/pending_approvals`),
      where('status', '==', 'pending')
    );
    const unsubPending = onSnapshot(qPending, (snap) => {
      setPendingApprovalsList(snap.docs.map(docSnap => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          isPendingApprovalCol: true,
          notes: d.name,
          amount: Number(d.amount || 0),
          category: d.category,
          date: d.dueDate,
          ruleId: d.ruleId,
          status: d.status,
          type: d.category === 'Income' ? 'income' : 'expense',
          accountId: d.sourceAccountId || (accounts && accounts[0]?.id) || '',
          ...d
        };
      }));
    });

    // Listen to Draft Transactions
    const qDrafts = query(
      collection(db, `users/${uid}/transactions`),
      where('status', 'in', ['draft', 'pending_confirmation'])
    );
    const unsubDrafts = onSnapshot(qDrafts, (snap) => {
      setDrafts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to All Transactions
    const unsubAll = onSnapshot(collection(db, `users/${uid}/transactions`), (snap) => {
      setAllTxs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to Recurring Definitions
    const qRecurring = query(
      collection(db, `users/${uid}/recurringTransactions`),
      where('isActive', '==', true)
    );
    const unsubRecurring = onSnapshot(qRecurring, (snap) => {
      const recs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecurringTxs(recs);
    });

    return () => {
      unsubPending();
      unsubDrafts();
      unsubAll();
      unsubRecurring();
    };
  }, [uid, accounts]);

  const calculateNextDate = (baseDate: string, freq: string, interval: number, dayOption: 'sameDay' | 'sameDate' = 'sameDate') => {
    // Create date from YYYY-MM-DD at noon local time to avoid timezone shifts
    const [year, month, day] = baseDate.split('-').map(Number);
    const d = new Date(year, month - 1, day, 12, 0, 0);
    const originalDay = d.getDate();
    const originalWeekday = d.getDay();

    if (freq === 'daily') {
      d.setDate(d.getDate() + interval);
    } else if (freq === 'weekly') {
      d.setDate(d.getDate() + (interval * 7));
    } else if (freq === 'monthly') {
      if (dayOption === 'sameDate') {
        d.setMonth(d.getMonth() + interval);
        // Handle end of month slipping (e.g. Jan 31 -> Feb 28)
        if (d.getDate() < originalDay) {
           // We slipped to next month, go back to last day of intended month
           d.setDate(0);
        }
      } else {
        // sameDay: Find the same weekday in the target month
        d.setMonth(d.getMonth() + interval);
        const diff = originalWeekday - d.getDay();
        d.setDate(d.getDate() + diff);
      }
    } else if (freq === 'yearly') {
      if (dayOption === 'sameDate') {
        d.setFullYear(d.getFullYear() + interval);
      } else {
        d.setFullYear(d.getFullYear() + interval);
        const diff = originalWeekday - d.getDay();
        d.setDate(d.getDate() + diff);
      }
    }
    
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const checkAndGenerateDrafts = async (recs: any[]) => {
    // Use local YYYY-MM-DD for today to avoid UTC offset issues
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const today = `${yyyy}-${mm}-${dd}`;

    const batch = writeBatch(db);
    let hasChanges = false;

    for (const rec of recs) {
      let nextDate = rec.nextGenerationDate;
      
      // If today is past or equal to next generation date
      if (nextDate && nextDate <= today) {
        // Double check if we already generated a draft for this date to avoid duplicates 
        // (though in a real system we'd have a more robust way)
        
        const txRef = doc(collection(db, `users/${uid}/transactions`));
        const draftData = {
          id: txRef.id,
          userId: uid,
          type: rec.type,
          amount: rec.amount,
          accountId: rec.accountId,
          category: rec.category,
          categoryId: getCanonicalCategoryId(rec.category, rec.subcategory),
          subcategory: rec.subcategory || null,
          emoji: rec.emoji || null,
          notes: rec.notes ? `${rec.notes} (Recurring)` : t('pending_approvals.recurring_note', 'Recurring Transaction'),
          date: nextDate,
          status: 'draft',
          recurringId: rec.id,
          createdAt: serverTimestamp()
        };

        batch.set(txRef, draftData);
        
        // Update recurring definition
        const updatedNextDate = calculateNextDate(nextDate, rec.recurrency, rec.interval, rec.dayOption);
        const recRef = doc(db, `users/${uid}/recurringTransactions`, rec.id);
        
        // Check duration limit
        let isActive = true;
        let eventsRemaining = rec.eventsRemaining;

        if (rec.duration === 'untilDate' && rec.durationLimit && updatedNextDate > rec.durationLimit) {
            isActive = false;
        } else if ((rec.duration === 'numEvents' || typeof rec.installmentsTotal === 'number') && typeof eventsRemaining === 'number') {
            eventsRemaining -= 1;
            if (eventsRemaining <= 0) {
                isActive = false;
            }
        }
        
        batch.update(recRef, {
          lastGeneratedDate: nextDate,
          nextGenerationDate: updatedNextDate,
          eventsRemaining: eventsRemaining ?? null,
          isActive
        });
        
        hasChanges = true;
      }
    }

    if (hasChanges) {
      try {
        await batch.commit();
      } catch (err) {
        console.error("Error generating recurring drafts:", err);
      }
    }
  };

  const handleApprove = async (tx: any) => {
    setIsProcessing(true);
    try {
      if (tx.isPendingApprovalCol) {
        // 1. Decoupled Pending Approval: Use transactional handleApprovalAction
        await handleApprovalAction(uid, tx.id, 'confirm');

        // 2. Atomically update the target account balance & miniBudget
        const targetAccId = tx.accountId || tx.sourceAccountId || (accounts && accounts.length > 0 ? accounts[0].id : '');
        const amt = Number(tx.amount || 0);
        const txType = (tx.type || '').toLowerCase();
        const isIncome = txType === 'income' || txType === 'inflow';
        const amountChange = isIncome ? amt : -amt;

        const batch = writeBatch(db);
        let hasBatchWrites = false;

        if (targetAccId) {
          const accRef = doc(db, `users/${uid}/accounts`, targetAccId);
          const accSnap = await getDoc(accRef);
          if (accSnap.exists()) {
            batch.update(accRef, {
              currentBalance: increment(amountChange),
              updatedAt: serverTimestamp()
            });
            hasBatchWrites = true;
          }
        }

        if (!isIncome && tx.category) {
          const queryBudgets = query(
            collection(db, `users/${uid}/miniBudgets`),
            where('userId', '==', uid)
          );
          const querySnap = await getDocs(queryBudgets);
          const matchingBudgetDoc = querySnap.docs.find(docSnap => {
            const data = docSnap.data();
            return data.categoryTitle === tx.category || data.category === tx.category;
          });
          if (matchingBudgetDoc) {
            const budgetRef = doc(db, `users/${uid}/miniBudgets`, matchingBudgetDoc.id);
            batch.update(budgetRef, {
              spentAmount: increment(amt),
              updatedAt: serverTimestamp()
            });
            hasBatchWrites = true;
          }
        }

        if (hasBatchWrites) {
          await batch.commit();
        }
        onTransactionApproved?.();
        return;
      }

      // Legacy draft transactions approval fallback
      const batch = writeBatch(db);
      
      // 1. Update transaction status to confirmed
      const txId = tx.id;
      const txRef = doc(db, `users/${uid}/transactions`, txId);
      batch.update(txRef, {
        status: 'confirmed',
        updatedAt: serverTimestamp()
      });

      // 2. Calculate amount change based on transaction type
      const targetAccId = tx.accountId || tx.sourceAccountId || (accounts && accounts.length > 0 ? accounts[0].id : '');
      const amt = Number(tx.amount || 0);
      const txType = (tx.type || '').toLowerCase();
      const isIncome = txType === 'income' || txType === 'inflow';
      const amountChange = isIncome ? amt : -amt;

      // 3. Atomically update the target account balance
      if (targetAccId) {
        const accRef = doc(db, `users/${uid}/accounts`, targetAccId);
        const accSnap = await getDoc(accRef);
        if (accSnap.exists()) {
          batch.update(accRef, {
            currentBalance: increment(amountChange),
            updatedAt: serverTimestamp()
          });
        }
      }

      // 4. If it's an expense, atomically increment the matching miniBudget spentAmount
      if (!isIncome && tx.category) {
        const queryBudgets = query(
          collection(db, `users/${uid}/miniBudgets`),
          where('userId', '==', uid)
        );
        const querySnap = await getDocs(queryBudgets);
        const matchingBudgetDoc = querySnap.docs.find(docSnap => {
          const data = docSnap.data();
          return data.categoryTitle === tx.category || data.category === tx.category;
        });
        if (matchingBudgetDoc) {
          const budgetRef = doc(db, `users/${uid}/miniBudgets`, matchingBudgetDoc.id);
          batch.update(budgetRef, {
            spentAmount: increment(amt),
            updatedAt: serverTimestamp()
          });
        }
      }

      // Commit all operations together atomically
      await batch.commit();
      onTransactionApproved?.();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/transactions/${tx.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDeleteTx = async () => {
    if (!txToDelete) return;
    setIsProcessing(true);
    try {
      if (txToDelete.isPendingApprovalCol) {
        // Dedicated pending_approvals: Reject without deleting recurring rule
        await handleApprovalAction(uid, txToDelete.id, 'reject');
      } else {
        const txRef = doc(db, `users/${uid}/transactions`, txToDelete.id);
        await deleteDoc(txRef);
      }
      setTxToDelete(null);
    } catch (err: any) {
       handleFirestoreError(err, OperationType.DELETE, `users/${uid}/pending_approvals/${txToDelete.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const visibleDrafts = React.useMemo(() => {
    const legacyFiltered = drafts.filter(tx => {
      const txMonth = tx.date ? tx.date.substring(0, 7) : '';
      const recId = tx.recurringId;
      const txTitle = (tx.notes || tx.category || '').replace('(Recurring)', '').replace('(recurring)', '').trim().toLowerCase();

      const hasConfirmedForMonth = allTxs.some(cTx => {
        if (cTx.status !== 'confirmed') return false;
        if (cTx.id === tx.id) return false;
        const cMonth = cTx.date ? cTx.date.substring(0, 7) : '';
        if (cMonth !== txMonth) return false;

        if (recId && cTx.recurringId === recId) return true;
        if (txTitle) {
          const cTitle = (cTx.notes || cTx.category || '').replace('(Recurring)', '').replace('(recurring)', '').trim().toLowerCase();
          if (cTitle && txTitle && (cTitle.includes(txTitle) || txTitle.includes(cTitle))) {
            return true;
          }
        }
        return false;
      });

      return !hasConfirmedForMonth;
    });

    // Merge dedicated pending approvals and legacy drafts, avoiding duplicates
    const all = [...pendingApprovalsList, ...legacyFiltered];
    const seen = new Set<string>();
    return all.filter(item => {
      const key = `${item.ruleId || item.recurringId || item.notes}_${item.date}_${item.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [drafts, pendingApprovalsList, allTxs]);

  if (visibleDrafts.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
            <Clock size={12} className="text-gold animate-pulse" />
            <span className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.4em]">{t('pending_approvals.title', 'Pending Approvals')}</span>
        </div>
        <span className="bg-gold text-black text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">
            {t('pending_approvals.actions_required', { count: visibleDrafts.length })}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <AnimatePresence mode="popLayout">
          {visibleDrafts.map((tx, idx) => {
            const acc = accounts.find(a => a.id === tx.accountId);
            return (
              <motion.div
                key={`draft-tx-${tx.id}-${idx}`}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => setSelectedTx(tx)}
                className="p-4 bg-gold/5 border border-gold/20 rounded-[2rem] flex flex-col gap-4 shadow-xl shadow-gold/5 cursor-pointer hover:bg-gold/10 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${(tx.type === 'income' || tx.type === 'Inflow') ? 'bg-[#20C997]/10 text-[#20C997]' : 'bg-[#F43F5E]/10 text-[#F43F5E]'}`}>
                      {(tx.type === 'income' || tx.type === 'Inflow') ? <ArrowUpRight size={18} strokeWidth={3} /> : <ArrowDownLeft size={18} strokeWidth={3} />}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-white uppercase tracking-wider">{tx.notes}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <Landmark size={10} className="text-neutral-500" />
                        <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">{acc?.name} ({acc?.currency})</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-lg font-mono font-bold ${(tx.type === 'income' || tx.type === 'Inflow') ? 'text-[#20C997]' : 'text-[#F43F5E]'}`}>
                      {(tx.type === 'income' || tx.type === 'Inflow') ? '+' : '-'}{acc?.currency} {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[8px] font-black text-neutral-600 uppercase tracking-widest">{t('pending_approvals.scheduled_date', 'Scheduled Date: {{date}}', { date: new Date(tx.date).toLocaleDateString() })}</span>
                  </div>
                </div>

                {/* Google Tasks Sync Bar */}
                <div 
                  className="flex items-center justify-between p-2 rounded-xl bg-black/40 hover:bg-black/60 transition-colors border border-white/[0.02]"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <Calendar size={12} className={tx.isSyncedToTasks ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'} />
                    <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">{t('pending_approvals.sync_to_google', 'Sync to Google Tasks')}</span>
                  </div>
                  <button 
                    onClick={() => handleToggleSyncToTasks(tx, acc)}
                    className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                      tx.isSyncedToTasks 
                        ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-sm shadow-emerald-500/5' 
                        : 'text-neutral-400 border border-white/5 bg-[#0D0E12] hover:text-white hover:border-white/10'
                    }`}
                  >
                    {tx.isSyncedToTasks ? (
                      <>
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
                        {t('pending_approvals.synced', 'Synced')}
                      </>
                    ) : (
                      t('pending_approvals.toggle_sync', 'Toggle Sync')
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button 
                    disabled={isProcessing}
                    onClick={() => setConfirmingTx(tx)}
                    className="flex-1 py-3 bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    <Check size={14} /> {t('pending_approvals.approve_flow', 'Approve Flow')}
                  </button>
                  <button 
                    disabled={isProcessing}
                    onClick={() => setTxToDelete(tx)}
                    className="flex-none w-12 py-3 bg-neutral-900 border border-white/5 text-neutral-500 rounded-xl hover:text-[#F43F5E] transition-colors flex items-center justify-center active:scale-95 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <TransactionDetailModal 
        isOpen={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        tx={selectedTx}
        uid={uid}
      />

      <ConfirmationModal 
        isOpen={txToDelete !== null}
        onClose={() => setTxToDelete(null)}
        onConfirm={handleConfirmDeleteTx}
        title={t('pending_approvals.reject_draft', 'Reject Draft')}
        message={t('pending_approvals.reject_message', 'Are you sure you want to reject this draft transaction? It will be removed from your pending queue.')}
        confirmLabel={t('pending_approvals.reject_action', 'Reject Transaction')}
        isLoading={isProcessing}
      />

      <ConfirmRecurringTransactionModal
        isOpen={confirmingTx !== null}
        onClose={() => setConfirmingTx(null)}
        onConfirm={async () => {
          if (confirmingTx) {
            await handleApprove(confirmingTx);
          }
        }}
        transaction={confirmingTx}
        accounts={accounts}
      />
    </div>
  );
};
