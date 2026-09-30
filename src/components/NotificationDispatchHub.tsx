import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '@/lib/i18n';
import { 
  Bell, X, Check, Trash2, Calendar, Landmark, 
  AlertCircle, TrendingUp, Sparkles, AlertTriangle, 
  CheckSquare, Square, Plus, ShieldCheck, Coffee, Play,
  ChevronRight, ChevronDown
} from 'lucide-react';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, writeBatch, getDocs, getDoc, increment, runTransaction, setDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { getCurrentPeriodYearMonth, autoRolloverSalaryBreakdowns } from '../lib/salaryBreakdownUtils';
import { SalaryBreakdownVerificationModal } from './SalaryBreakdownVerificationModal';
import { ShoppingList } from './ShoppingList';
import { ConfirmRecurringTransactionModal } from './ConfirmRecurringTransactionModal';
import { processRecurringTransactions, handleApprovalAction } from '../services/recurringService';

interface NotificationDispatchHubProps {
  uid: string;
  accounts: any[];
  transactions: any[];
  accountBalances: Record<string, number>;
  onTransactionApproved?: () => void;
}

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  status?: 'active' | 'completed';
  scheduledAt?: string;
  notified?: boolean;
  date?: string;
  time?: string;
}

export interface BudgetAlertNode {
  id: string;
  budgetId: string;
  category: string;
  type: 'warning' | 'critical';
  title: string;
  spent: number;
  limit: number;
  currency: string;
  date: string;
  time: string;
  cleared: boolean;
  isDailySpends?: boolean;
}

export const NotificationDispatchHub: React.FC<NotificationDispatchHubProps> = ({
  uid,
  accounts,
  transactions,
  accountBalances,
  onTransactionApproved
}) => {
  const { t, i18n } = useTranslation();
  const getChecklistText = (item: ChecklistItem) => {
    if (item.id === 'itm-1') {
      return t('notification_dispatch_hub.seed_verify_daily', item.text);
    }
    if (item.id === 'itm-2') {
      return t('notification_dispatch_hub.seed_audit_sub', item.text);
    }
    if (item.id === 'itm-3') {
      return t('notification_dispatch_hub.seed_optimize_invest', item.text);
    }
    return item.text;
  };
  const [isOpen, setIsOpen] = useState(false);
  const [openTime, setOpenTime] = useState(0);
  const [foregroundQuietIncrement, setForegroundQuietIncrement] = useState(0);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('dispatch-hub-toggled', { detail: { isOpen } }));
  }, [isOpen]);

  // Automatically open the notification drawer if the deep link parameters indicate a lock screen click
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('openDispatch') === 'true') {
        setIsOpen(true);
      }
    } catch (e) {
      console.warn("Deep route gateway fail:", e);
    }
  }, []);

  // Listen for quiet foreground messages from sw.js and update badge counts quietly
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handleQuietPayload = (event: MessageEvent) => {
        if (event.data && event.data.type === 'VANTAGE_FOREGROUND_ALERT') {
          setForegroundQuietIncrement(prev => prev + 1);
        }
      };
      navigator.serviceWorker.addEventListener('message', handleQuietPayload);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleQuietPayload);
      };
    }
  }, []);

  // Reset the quiet background increment counter when the drawer is opened/dismissed
  useEffect(() => {
    if (isOpen) {
      setForegroundQuietIncrement(0);
    }
  }, [isOpen]);

  // 7:00 AM Morning Financial Espresso Scheduler & Trigger
  useEffect(() => {
    if (!uid) return;

    const checkMorningEspresso = () => {
      try {
        const now = new Date();
        const hour = now.getHours();
        const dateStr = now.toISOString().split('T')[0];
        const lockKey = `vantage_espresso_brief_${uid}_${dateStr}`;

        if (hour === 7) {
          const alreadySeen = localStorage.getItem(lockKey);
          if (!alreadySeen) {
            localStorage.setItem(lockKey, 'true');

            playNotificationSound();
            sendDeviceNotification(
              "☕ Morning Financial Espresso - 7:00 AM Briefing",
              "Your 20-second daily audio summary is ready: Balances, budget runway, payments & streaks.",
              () => {
                window.dispatchEvent(new CustomEvent('espresso-modal-toggled', { detail: { isOpen: true } }));
              }
            );

            window.dispatchEvent(new CustomEvent('espresso-modal-toggled', { detail: { isOpen: true } }));
          }
        }
      } catch (e) {
        console.warn("Morning Espresso scheduler error:", e);
      }
    };

    checkMorningEspresso();
    const timer = setInterval(checkMorningEspresso, 60000);
    return () => clearInterval(timer);
  }, [uid]);
  
  // Real-time Firestore streams
  const [drafts, setDrafts] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [miniBudgets, setMiniBudgets] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [userBroadcasts, setUserBroadcasts] = useState<any[]>([]);
  const [activeRewardPopup, setActiveRewardPopup] = useState<{ id: string; title: string; message: string } | null>(null);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const isNotifInitializedRef = useRef<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // Financial Checklist State (persisted inside localStorage)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  
  // Real-time Budget alarm/warnings stream logs state
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlertNode[]>([]);

  // Schedulers State
  const [showScheduler, setShowScheduler] = useState(false);
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(true);
  const [salaryBreakdowns, setSalaryBreakdowns] = useState<any[]>([]);
  const [isProcessingConfirmSb, setIsProcessingConfirmSb] = useState<string | null>(null);
  const [verifyingSb, setVerifyingSb] = useState<any | null>(null);
  const [confirmingTx, setConfirmingTx] = useState<any | null>(null);

  const [dbPayday, setDbPayday] = useState<number>(28);
  const [dbSalary, setDbSalary] = useState<number>(0);
  const [activeHubTab, setActiveHubTab] = useState<'notifications' | 'shopping'>('notifications');
  const [expandedReminders, setExpandedReminders] = useState<Record<number, boolean>>({});
  const [expandedChecklists, setExpandedChecklists] = useState<Record<string, boolean>>({});
  const [dismissedReminders, setDismissedReminders] = useState<Record<string, boolean>>(() => {
    try {
      const ym = new Date().toISOString().substring(0, 7);
      const saved = localStorage.getItem(`vantage_dismissed_reminders_${ym}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleDismissReminder = (reminderId: string) => {
    const ym = new Date().toISOString().substring(0, 7);
    const updated = { ...dismissedReminders, [reminderId]: true };
    setDismissedReminders(updated);
    try {
      localStorage.setItem(`vantage_dismissed_reminders_${ym}`, JSON.stringify(updated));
    } catch (e) {
      console.warn("Failed to save dismissed reminder:", e);
    }
  };

 useEffect(() => {
    // 🛡️ CRITICAL GUARD: Abort if Firebase Auth is not active
    if (!uid || !auth.currentUser) return;
    const userId = auth.currentUser.uid;

    const q = query(
      collection(db, `users/${userId}/recurringTransactions`)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() as any }))
        .filter((item) => {
          const isIncome = (item.transactionType === 'income' || item.type === 'income' || item.transactionType === 'inflow' || item.type === 'inflow') &&
            item.transactionType !== 'expense' && item.transactionType !== 'outflow' && item.transactionType !== 'transfer' &&
            item.type !== 'expense' && item.type !== 'outflow' && item.type !== 'transfer';
          return isIncome && item.isActive !== false;
        });

      const computedSalary = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      setDbSalary(computedSalary);

      const payItem = items.find(item => item.category === 'Salary' && item.dayOption) || items.find(item => item.dayOption);
      if (payItem) {
        setDbPayday(Number(payItem.dayOption));
      } else {
        setDbPayday(28);
      }
    }, (err) => {
      console.warn("Could not read recurring transactions in hub:", err);
    });
    return () => unsub();
  }, [uid]);

  const calculateNextDate = (baseDate: string, freq: string, interval: number = 1, dayOption: any = 'sameDate') => {
    if (!baseDate) return new Date().toISOString().split('T')[0];
    const [year, month, day] = baseDate.split('-').map(Number);
    const d = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0);
    const originalDay = d.getDate();
    const originalWeekday = d.getDay();
    const lowerFreq = (freq || 'monthly').toLowerCase();

    if (lowerFreq === 'daily') {
      d.setDate(d.getDate() + interval);
    } else if (lowerFreq === 'weekly') {
      d.setDate(d.getDate() + (interval * 7));
    } else if (lowerFreq === 'monthly') {
      if (dayOption === 'sameDay') {
        d.setMonth(d.getMonth() + interval);
        const diff = originalWeekday - d.getDay();
        d.setDate(d.getDate() + diff);
      } else {
        d.setMonth(d.getMonth() + interval);
        if (d.getDate() < originalDay) {
          d.setDate(0);
        }
      }
    } else if (lowerFreq === 'yearly' || lowerFreq === 'annual') {
      d.setFullYear(d.getFullYear() + interval);
    }

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const checkAndGenerateRecurringDrafts = React.useCallback(async (recs: any[]) => {
    if (!uid || !recs || recs.length === 0) return;

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    try {
      const txSnap = await getDocs(collection(db, `users/${uid}/transactions`));
      const existingTxs = txSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      const batch = writeBatch(db);
      let hasWrites = false;

      // Clean up any unconfirmed draft/pending transactions if a confirmed transaction already exists for that month & recurring rule
      for (const tx of existingTxs) {
        if (tx.status === 'pending_confirmation' || tx.status === 'draft') {
          const txMonth = tx.date ? tx.date.substring(0, 7) : '';
          const recId = tx.recurringId;
          const txTitle = (tx.notes || tx.category || '').replace('(Recurring)', '').replace('(recurring)', '').trim().toLowerCase();

          const hasConfirmed = existingTxs.some(cTx => {
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

          if (hasConfirmed) {
            batch.delete(doc(db, `users/${uid}/transactions`, tx.id));
            hasWrites = true;
          }
        }
      }

      for (const rec of recs) {
        let dueDate = rec.nextExecutionDate || rec.nextGenerationDate || rec.startDate;
        if (!dueDate) continue;

        let currentDueDate = dueDate;
        let iterations = 0;
        const maxIterations = 12;

        while (currentDueDate && currentDueDate <= todayStr && iterations < maxIterations) {
          iterations++;

          const recId = rec.id || rec.recurringId;
          const recTitle = (rec.title || rec.notes || '').replace('(Recurring)', '').replace('(recurring)', '').trim().toLowerCase();
          const dueMonth = currentDueDate.substring(0, 7);
          const lowerFreq = (rec.frequency || rec.recurrency || 'monthly').toLowerCase();

          const alreadyExists = existingTxs.some(tx => {
            const sameRec = (tx.recurringId && (tx.recurringId === recId || tx.id === recId)) ||
              (recTitle && tx.notes && tx.notes.toLowerCase().includes(recTitle));
            if (!sameRec) return false;

            if (lowerFreq === 'monthly' || lowerFreq === 'yearly' || lowerFreq === 'annual' || lowerFreq === 'payroll') {
              return tx.date && tx.date.substring(0, 7) === dueMonth;
            }
            return tx.date === currentDueDate;
          });

          if (!alreadyExists) {
            const txRef = doc(collection(db, `users/${uid}/transactions`));
            const recType = (rec.transactionType || rec.type || 'expense').toLowerCase();
            const targetAccId = rec.sourceAccountId || rec.accountId || (accounts[0]?.id || '');

            const isWageOrSalary = 
              (rec.title || '').toLowerCase().includes('salary') || 
              (rec.notes || '').toLowerCase().includes('salary') || 
              (rec.title || '').toLowerCase().includes('wage') || 
              (rec.notes || '').toLowerCase().includes('wage') ||
              (rec.title || '').toLowerCase().includes('pay') ||
              (rec.category || '').toLowerCase().includes('salary') ||
              (rec.category || '').toLowerCase().includes('wage') ||
              recType === 'income' || recType === 'inflow';

            const draftPayload = {
              id: txRef.id,
              userId: uid,
              type: recType === 'income' || recType === 'inflow' || isWageOrSalary ? 'income' : (recType === 'transfer' ? 'transfer' : 'expense'),
              amount: Number(rec.amount || 0),
              accountId: targetAccId,
              destinationAccountId: rec.destinationAccountId || null,
              category: isWageOrSalary ? 'Income' : (rec.category && rec.category !== 'Savings' && rec.category !== 'General' && rec.category !== 'Recurring' ? rec.category : 'Income'),
              subcategory: isWageOrSalary ? 'Wage' : (rec.subcategory || 'Wages'),
              emoji: rec.emoji || '📁',
              notes: rec.notes || rec.title ? `${rec.notes || rec.title} (Recurring)` : 'Recurring Transaction',
              date: currentDueDate,
              status: 'pending_confirmation',
              recurringId: rec.id || rec.recurringId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            };

            batch.set(txRef, draftPayload);
            hasWrites = true;

            existingTxs.push(draftPayload);
          }

          const nextDate = calculateNextDate(
            currentDueDate, 
            rec.frequency || rec.recurrency || 'monthly', 
            Number(rec.interval || 1), 
            rec.dayOption
          );

          const recRef = doc(db, `users/${uid}/recurringTransactions`, rec.id || rec.recurringId);
          
          let isActive = rec.isActive !== false;
          let eventsRemaining = rec.eventsRemaining;

          if (rec.duration === 'untilDate' && rec.durationLimit && nextDate > rec.durationLimit) {
            isActive = false;
          } else if ((rec.duration === 'numEvents' || typeof rec.installmentsTotal === 'number') && typeof eventsRemaining === 'number') {
            eventsRemaining -= 1;
            if (eventsRemaining <= 0) {
              isActive = false;
            }
          }

          batch.update(recRef, {
            lastGeneratedDate: currentDueDate,
            nextExecutionDate: nextDate,
            nextGenerationDate: nextDate,
            eventsRemaining: eventsRemaining ?? null,
            isActive,
            updatedAt: serverTimestamp()
          });
          hasWrites = true;

          currentDueDate = nextDate;
        }
      }

      if (hasWrites) {
        await batch.commit();
      }
    } catch (err) {
      console.warn("Failed to generate recurring drafts in NotificationDispatchHub:", err);
    }
  }, [uid, accounts]);

  useEffect(() => {
    if (!uid) return;
    processRecurringTransactions(uid).catch(err => {
      console.warn("Automated recurring processing:", err);
    });

    const qAllRec = query(
      collection(db, `users/${uid}/recurringTransactions`),
      where('isActive', '!=', false)
    );
    const unsubAllRec = onSnapshot(qAllRec, (snap) => {
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      checkAndGenerateRecurringDrafts(recs);
    }, (err) => {
      console.warn("Could not stream recurring transactions for draft generator:", err);
    });
    return () => unsubAllRec();
  }, [uid, checkAndGenerateRecurringDrafts]);

  useEffect(() => {
    if (uid) {
      autoRolloverSalaryBreakdowns(uid);
    }
  }, [uid]);

  const isPrePaydayApproaching = React.useMemo(() => {
    if (!dbPayday || !dbSalary) return false;
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const targetPaydayThisMonth = new Date(curYear, curMonth, dbPayday);
    const diffTime = targetPaydayThisMonth.getTime() - now.getTime();
    const daysRemaining = diffTime / (1000 * 60 * 60 * 24);
    if (daysRemaining >= 0 && daysRemaining <= 7) {
      return true;
    }
    if (daysRemaining < 0) {
      const targetPaydayNextMonth = new Date(curYear, curMonth + 1, dbPayday);
      const diffTimeNext = targetPaydayNextMonth.getTime() - now.getTime();
      const daysRemainingNext = diffTimeNext / (1000 * 60 * 60 * 24);
      if (daysRemainingNext >= 0 && daysRemainingNext <= 7) {
        return true;
      }
    }
    return false;
  }, [dbPayday, dbSalary]);

  const activeYearMonth = getCurrentPeriodYearMonth();
  const activeBreakdown = salaryBreakdowns.find(sb => sb.id === activeYearMonth);
  const lacksBreakdownConfig = !activeBreakdown || activeBreakdown.isBreakdownConfigured !== true;
  const showMissingSalaryAlert = isPrePaydayApproaching && lacksBreakdownConfig;

  const maturedPendingSalaryBreakdowns = React.useMemo(() => {
    return [];
  }, [salaryBreakdowns]);

  const [notifiedMaturedIds, setNotifiedMaturedIds] = React.useState<string[]>(() => {
    try {
      const cached = localStorage.getItem(`vantage_notified_matured_sb_${uid}`);
      return cached ? JSON.parse(cached) : [];
    } catch (_) {
      return [];
    }
  });

  const saveNotifiedMaturedIds = (ids: string[]) => {
    setNotifiedMaturedIds(ids);
    localStorage.setItem(`vantage_notified_matured_sb_${uid}`, JSON.stringify(ids));
  };

  React.useEffect(() => {
    if (!uid || maturedPendingSalaryBreakdowns.length === 0) return;

    maturedPendingSalaryBreakdowns.forEach(sb => {
      if (!notifiedMaturedIds.includes(sb.id)) {
        const updated = [...notifiedMaturedIds, sb.id];
        saveNotifiedMaturedIds(updated);
      }
    });
  }, [uid, maturedPendingSalaryBreakdowns, notifiedMaturedIds]);

  const handleConfirmTier1 = async (sb: any, checkingAccId: string) => {
    if (!uid) return;
    try {
      const batch = writeBatch(db);

      // 1. Update break down tier1Approved
      const sbRef = doc(db, `users/${uid}/salaryBreakdowns/${sb.id}`);
      batch.update(sbRef, {
        tier1Approved: true,
        updatedAt: serverTimestamp()
      });

      // 2. Mutate targeted checking bank account balance
      if (checkingAccId) {
        const targetAcc = accounts.find(a => a.id === checkingAccId);
        if (targetAcc) {
          const accRef = doc(db, `users/${uid}/accounts/${checkingAccId}`);
          batch.update(accRef, {
            startingBalance: Number(targetAcc.startingBalance || 0) + Number(sb.baseSalaryInput || 0),
            updatedAt: serverTimestamp()
          });
        }
      }

      // 3. Write primary incoming payroll record safely to historical ledger
      const txRef = doc(collection(db, `users/${uid}/transactions`));
      batch.set(txRef, {
        id: txRef.id,
        userId: uid,
        type: 'income',
        amount: Number(sb.baseSalaryInput || 0),
        accountId: checkingAccId || '',
        category: 'Salary',
        subcategory: 'Wages',
        notes: 'Salary receipt',
        date: new Date().toISOString().split('T')[0],
        status: 'confirmed',
        salaryBreakdownPeriod: sb.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await batch.commit();

      if (onTransactionApproved) {
        onTransactionApproved();
      }

      // Voice trigger push feedback
      sendDeviceNotification(
        '💵 Salary receipt confirmed',
        `Successfully added deposit of ${sb.currency || 'AED'} ${Number(sb.baseSalaryInput).toLocaleString()}`
      );
      playNotificationSound();

    } catch (err) {
      console.error("Failed to confirm Tier 1 salary receipt:", err);
    }
  };

  const handleConfirmAllocationLine = async (
    sb: any, 
    key: string, 
    allocatedAmt: number, 
    isTransfer: boolean,
    category: string,
    subcategory: string,
    label: string,
    checkingAccId: string
  ) => {
    if (!uid) return;
    try {
      const batch = writeBatch(db);

      // Updates database documents depending on line type
      if (isTransfer) {
        // If the row is a transfer: subtract checkings balance, add destination asset balance
        const destAccId = key.replace('transfer__', '');
        const srcAcc = accounts.find(a => a.id === checkingAccId);
        const destAcc = accounts.find(a => a.id === destAccId);

        if (srcAcc) {
          const srcRef = doc(db, `users/${uid}/accounts/${checkingAccId}`);
          batch.update(srcRef, {
            startingBalance: Number(srcAcc.startingBalance || 0) - allocatedAmt,
            updatedAt: serverTimestamp()
          });
        }
        if (destAcc) {
          const destRef = doc(db, `users/${uid}/accounts/${destAccId}`);
          batch.update(destRef, {
            startingBalance: Number(destAcc.startingBalance || 0) + allocatedAmt,
            updatedAt: serverTimestamp()
          });
        }
      } else {
        // If row is a spending category: subtract from active miniBudgets document, write to transactions ledger
        const matchedBudget = miniBudgets.find(b => b.category === category && b.subcategory === subcategory);
        if (matchedBudget) {
          const budRef = doc(db, `users/${uid}/miniBudgets`, matchedBudget.id);
          batch.update(budRef, {
            maxBudget: Number(matchedBudget.maxBudget || 0) - allocatedAmt,
            updatedAt: serverTimestamp()
          });
        }

        const txRef = doc(collection(db, `users/${uid}/transactions`));
        batch.set(txRef, {
          id: txRef.id,
          userId: uid,
          type: 'expense',
          amount: allocatedAmt,
          accountId: checkingAccId || '',
          category,
          subcategory,
          notes: `Allocation: ${label}`,
          date: new Date().toISOString().split('T')[0],
          status: 'confirmed',
          salaryBreakdownPeriod: sb.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // Mark this specific allocation key as confirmed
      const sbRef = doc(db, `users/${uid}/salaryBreakdowns/${sb.id}`);
      batch.update(sbRef, {
        [`confirmedAllocations.${key}`]: true,
        updatedAt: serverTimestamp()
      });

      // Optimistic check: if all active allocations are confirmed, we mark the whole breakdown confirmed
      const activeAllocableKeys = (sb.activeEnvelopes || []).filter((k: string) => Number(sb.allocations?.[k] || 0) > 0);
      const nextConfirmedMap = { ...(sb.confirmedAllocations || {}), [key]: true };
      const isAllDone = activeAllocableKeys.every((k: string) => nextConfirmedMap[k] === true);

      if (isAllDone) {
        batch.update(sbRef, {
          isConfirmed: true,
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();

      if (onTransactionApproved) {
        onTransactionApproved();
      }

      playNotificationSound();

    } catch (err) {
      console.error("Failed to commit independent line allocation:", err);
    }
  };

  // Initialize date/time with local timezone safe default
  useEffect(() => {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISO = new Date(d.getTime() - tzOffset).toISOString();
    setSchedDate(localISO.split('T')[0]);
    setSchedTime(d.toTimeString().slice(0, 5));
  }, []);

  const handleToggleScheduler = () => {
    const nextState = !showScheduler;
    setShowScheduler(nextState);
    if (nextState && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  };

  const handleTestNotification = async () => {
    if ('Notification' in window) {
      if (Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          alert('Notification permission was not granted. Please enable notifications in your device settings.');
          return;
        }
      }
    }
    sendDeviceNotification(
      "🔔 Test Reminder Notification",
      "Notifications are active and working successfully!"
    );
    playNotificationSound();

    const toastId = `vantage-toast-${Date.now()}`;
    const toastEl = document.createElement('div');
    toastEl.id = toastId;
    toastEl.className = "fixed top-6 left-1/2 -translate-x-1/2 z-[300] bg-[#1E293B] border-2 border-[#A6DDB1] text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce";
    toastEl.style.fontFamily = "'Google Sans', sans-serif";
    toastEl.innerHTML = `
      <div class="text-[#A6DDB1] text-lg font-bold">🔔</div>
      <div class="flex flex-col text-left">
        <span class="text-[12px] font-bold text-[#A6DDB1]">Test Notification Sent</span>
        <span class="text-xs font-normal text-neutral-100 mt-0.5">Notifications are working properly!</span>
      </div>
    `;
    document.body.appendChild(toastEl);
    setTimeout(() => {
      toastEl.remove();
    }, 4000);
  };

  // Two-step confirmation state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => {}
  });

  // Load and seed budget alerts
  useEffect(() => {
    if (!uid) return;

    // Load budget alerts
    const cacheKeyAlerts = `vantage_budget_alerts_log_${uid}`;
    const cachedAlerts = localStorage.getItem(cacheKeyAlerts);
    if (cachedAlerts) {
      try {
        setBudgetAlerts(JSON.parse(cachedAlerts));
      } catch (_) {}
    }
  }, [uid]);

  const saveBudgetAlerts = (newAlerts: BudgetAlertNode[]) => {
    setBudgetAlerts(newAlerts);
    localStorage.setItem(`vantage_budget_alerts_log_${uid}`, JSON.stringify(newAlerts));
  };

  // Real-time Firestore Sync Streams
  useEffect(() => {
    if (!uid) return;

    // 1. Listen to Drafts
    const qDrafts = query(
      collection(db, `users/${uid}/transactions`),
      where('status', 'in', ['draft', 'pending_confirmation'])
    );
    const unsubDrafts = onSnapshot(qDrafts, (snap) => {
      setDrafts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Dispatched approvals offline fallback:", err);
    });

    // 1a. Listen to Dedicated pending_approvals collection
    const qPendingApprovals = query(
      collection(db, `users/${uid}/pending_approvals`),
      where('status', '==', 'pending')
    );
    const unsubPendingApprovals = onSnapshot(qPendingApprovals, (snap) => {
      setPendingApprovals(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          isPendingApprovalCol: true,
          notes: data.name,
          amount: Number(data.amount || 0),
          category: data.category,
          date: data.dueDate,
          ruleId: data.ruleId,
          status: data.status,
          type: data.category === 'Income' ? 'income' : 'expense',
          accountId: data.sourceAccountId || (accounts && accounts[0]?.id) || '',
          ...data
        };
      }));
    }, (err) => {
      console.warn("Dispatched pending approvals error:", err);
    });

    // 1b. Listen to All Transactions
    const unsubAllTxs = onSnapshot(collection(db, `users/${uid}/transactions`), (snap) => {
      setAllTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Dispatched all transactions fallback:", err);
    });

    // 2. Listen to miniBudgets
    const unsubBudgets = onSnapshot(collection(db, `users/${uid}/miniBudgets`), (snap) => {
      setMiniBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Dispatched budgets offline fallback:", err);
    });

    // 3. Listen to Goals
    const unsubGoals = onSnapshot(collection(db, `users/${uid}/goals`), (snap) => {
      setMilestones(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((item: any) => item.type === 'savings'));
    }, (err) => {
      console.warn("Dispatched goals offline fallback:", err);
    });

    // 4. Listen to Salary Breakdowns
    const unsubSalary = onSnapshot(collection(db, `users/${uid}/salaryBreakdowns`), (snap) => {
      setSalaryBreakdowns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Dispatched salary breakdowns offline fallback:", err);
    });

    // 5. Listen to Checklist items
    const unsubChecklist = onSnapshot(collection(db, `users/${uid}/checklist`), (snap) => {
      const seededKey = `vantage_checklist_seeded_${uid}`;
      const isSeeded = localStorage.getItem(seededKey) === 'true';

      if (snap.empty) {
        if (!isSeeded) {
          localStorage.setItem(seededKey, 'true');
          // If empty, check if we can migrate from localStorage, or seed defaults
          const cacheKey = `vantage_dispatch_checklist_${uid}`;
          const cached = localStorage.getItem(cacheKey);
          let itemsToSet: ChecklistItem[] = [];
          if (cached) {
            try {
              itemsToSet = JSON.parse(cached);
            } catch (_) {}
          }
          if (itemsToSet.length === 0) {
            itemsToSet = [
              { id: 'itm-1', text: 'Verify daily spending budgets', completed: false, status: 'active' },
              { id: 'itm-2', text: 'Audit subscription schedules', completed: false, status: 'active' },
              { id: 'itm-3', text: 'Optimize active investment tiers', completed: false, status: 'active' }
            ];
          }

          // Write to Firestore
          const batch = writeBatch(db);
          itemsToSet.forEach(item => {
            const docRef = doc(db, `users/${uid}/checklist/${item.id}`);
            batch.set(docRef, {
              id: item.id,
              text: item.text,
              completed: !!item.completed,
              status: item.status || (item.completed ? 'completed' : 'active'),
              scheduledAt: item.scheduledAt || null,
              notified: !!item.notified,
              date: item.date || null,
              time: item.time || null,
              createdAt: serverTimestamp()
            });
          });
          batch.commit().catch(err => console.warn("Failed to seed/migrate checklist:", err));
        } else {
          setChecklist([]);
        }
      } else {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        // Ensure status field is normalized
        const normalized = items.map(item => ({
          ...item,
          status: item.status || (item.completed ? 'completed' : 'active')
        }));
        setChecklist(normalized);
      }
    }, (err) => {
      console.warn("Dispatched checklist offline fallback:", err);
    });

    // 6. Listen to User Notifications / Broadcasts
    const unsubUserNotifs = onSnapshot(collection(db, `users/${uid}/notifications`), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((n: any) => !n.isRead);
      setUserBroadcasts(items);

      if (!isNotifInitializedRef.current) {
        snap.docs.forEach(d => seenNotifIdsRef.current.add(d.id));
        isNotifInitializedRef.current = true;
      } else {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data() as any;
            const docId = change.doc.id;
            if (!seenNotifIdsRef.current.has(docId)) {
              seenNotifIdsRef.current.add(docId);
              if (!data.isRead) {
                const title = data.title || '🎁 Congratulations! Reward Unlocked';
                const message = data.message || data.body || 'You have received a new reward or gift from YOUR FINANCES.';
                sendDeviceNotification(title, message);
                playNotificationSound();
                setActiveRewardPopup({
                  id: docId,
                  title,
                  message
                });
              }
            }
          }
        });
      }
    }, (err) => {
      console.warn("User notifications fallback:", err);
    });

    return () => {
      unsubDrafts();
      unsubPendingApprovals();
      unsubAllTxs();
      unsubBudgets();
      unsubGoals();
      unsubSalary();
      unsubChecklist();
      unsubUserNotifs();
    };
  }, [uid]);

  const handleToggleChecklist = async (id: string) => {
    if (!uid) return;
    const item = checklist.find(c => c.id === id);
    if (!item) return;

    try {
      const nextCompleted = !item.completed;
      const itemRef = doc(db, `users/${uid}/checklist/${id}`);
      await updateDoc(itemRef, {
        completed: nextCompleted,
        status: nextCompleted ? 'completed' : 'active',
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to toggle checklist item:", err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/checklist/${id}`);
    }
  };

  // Browser Notification native broadcast
  const sendDeviceNotification = (title: string, body: string, onClick?: () => void) => {
    if (!title || title.trim() === '') title = 'Your Finances';
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        const canUseSW = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
        if (canUseSW) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(title, {
              body: body,
              icon: '/icons/Your_Finances_Logo_192x192.png',
              badge: '/icons/Your_Finances_Logo_192x192.png',
              tag: 'vantage-push-notification',
              data: {
                url: '/?tab=daily_log&subTab=daily'
              }
            }).catch(() => {
              const n = new Notification(title, {
                body: body,
                icon: '/icons/Your_Finances_Logo_192x192.png'
              });
              if (onClick) {
                n.onclick = () => {
                  window.focus();
                  onClick();
                };
              }
            });
          }).catch(() => {
            const n = new Notification(title, {
              body: body,
              icon: '/icons/Your_Finances_Logo_192x192.png'
            });
            if (onClick) {
              n.onclick = () => {
                window.focus();
                onClick();
              };
            }
          });
        } else {
          try {
            const n = new Notification(title, {
              body: body,
              icon: '/icons/Your_Finances_Logo_192x192.png'
            });
            if (onClick) {
              n.onclick = () => {
                window.focus();
                onClick();
              };
            }
          } catch (e) {
            console.warn("Desktop notification instantiation error:", e);
          }
        }
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            try {
              const n = new Notification(title, { body: body, icon: '/icons/Your_Finances_Logo_192x192.png' });
              if (onClick) {
                n.onclick = () => {
                  window.focus();
                  onClick();
                };
              }
            } catch (e) {}
          }
        });
      }
    }
  };

  // Web Audio synthetic vintage alert chimes
  const playNotificationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        
        osc.start(start);
        osc.stop(start + duration);
      };
      
      const now = audioCtx.currentTime;
      // Precision vintage dual chime tones
      playTone(523.25, now, 0.4); 
      playTone(659.25, now + 0.15, 0.5); 
    } catch (err) {
      console.warn("Audio playback not supported or user interaction required:", err);
    }
  };

  // Background clock check poller for match precise scheduled timestamp
  useEffect(() => {
    if (!uid || checklist.length === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      
      // Find all overdue, not notified, not completed
      const pendingItems = checklist.filter(item => 
        item.scheduledAt && !item.notified && !item.completed && new Date(item.scheduledAt) <= now
      );

      if (pendingItems.length > 0) {
        // Sort by scheduledAt to handle oldest first
        pendingItems.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
        
        const item = pendingItems[0];
        
        // Native lock screen push simulation via HTML5 Web notification
        sendDeviceNotification(
          '', 
          `${getChecklistText(item)}`
        );
        // Alert chime playing
        playNotificationSound();
        
        // Pop an attractive HTML5 feedback toast in viewport if iframe sandbox rejects Notifications
        const toastId = `vantage-toast-${Date.now()}`;
        const toastEl = document.createElement('div');
        toastEl.id = toastId;
        toastEl.className = "fixed top-6 left-1/2 -translate-x-1/2 z-[300] bg-[#1E293B] border-2 border-[#A6DDB1] text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce";
        toastEl.style.fontFamily = "'Google Sans', sans-serif";
        toastEl.innerHTML = `
          <div class="text-[#A6DDB1] text-lg font-bold">🔔</div>
          <div class="flex flex-col text-left">
            <span class="text-[12px] font-bold text-[#A6DDB1]">Dispatch Live Alert</span>
            <span class="text-xs font-normal text-neutral-100 mt-0.5">${getChecklistText(item)}</span>
          </div>
        `;
        document.body.appendChild(toastEl);
        setTimeout(() => {
          toastEl.remove();
        }, 6000);

        try {
          const itemRef = doc(db, `users/${uid}/checklist/${item.id}`);
          updateDoc(itemRef, {
            notified: true,
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          console.warn("Failed to set checklist notification status:", err);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [uid, checklist]);

  const handleCreateChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim() || !uid) return;

    let scheduledAtStr: string | undefined = undefined;
    if (showScheduler && schedDate && schedTime) {
      try {
        const datetimeStr = `${schedDate}T${schedTime}`;
        const parsedDate = new Date(datetimeStr);
        if (!isNaN(parsedDate.getTime())) {
          scheduledAtStr = parsedDate.toISOString();
        }
      } catch (err) {
        console.warn("Error parsing scheduled reminder timestamp:", err);
      }
    }

    const itemId = `itm-custom-${Date.now()}`;
    const newItem = {
      id: itemId,
      text: newItemText.trim(),
      completed: false,
      status: 'active',
      scheduledAt: scheduledAtStr || null,
      notified: false,
      date: showScheduler ? schedDate : null,
      time: showScheduler ? schedTime : null,
      createdAt: serverTimestamp()
    };

    try {
      const itemRef = doc(db, `users/${uid}/checklist/${itemId}`);
      await setDoc(itemRef, newItem);
      setNewItemText('');
      setShowScheduler(false);

      if (scheduledAtStr && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (err) {
      console.error("Failed to add checklist item:", err);
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}/checklist/${itemId}`);
    }
  };

  const handleDeleteChecklistItemWithConfirm = (id: string) => {
    setConfirmModal({
      isOpen: true,
      message: t('notification_dispatch_hub.delete_chk_confirm'),
      onConfirm: async () => {
        if (!uid) return;
        try {
          const itemRef = doc(db, `users/${uid}/checklist/${id}`);
          await deleteDoc(itemRef);
        } catch (err) {
          console.error("Failed to delete checklist item:", err);
          handleFirestoreError(err, OperationType.DELETE, `users/${uid}/checklist/${id}`);
        }
      }
    });
  };

  // Firestore transaction approvals
  const handleApproveDraft = async (tx: any) => {
    console.log("🟢 [DEBUG] handleApproveDraft triggered with tx:", tx);
    console.log("🟢 [DEBUG] Current uid:", uid, "accounts count:", accounts?.length);
    setIsProcessing(tx.id || 'draft');
    try {
      if (tx.isPendingApprovalCol) {
        // 1. Dedicated pending_approvals: Execute transactional handleApprovalAction
        await handleApprovalAction(uid, tx.id, 'confirm');

        // 2. Atomically update target account balance and miniBudgets
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

      const batch = writeBatch(db);

      // 1. Update transaction status to confirmed
      const txId = tx.id;
      if (!txId) {
        console.warn("⚠️ [DEBUG] Transaction id is missing or empty! tx:", tx);
      }
      const txRef = doc(db, `users/${uid}/transactions`, txId);
      console.log("🟢 [DEBUG] Preparing batch update for transaction reference:", `users/${uid}/transactions/${txId}`);
      batch.update(txRef, {
        status: 'confirmed',
        updatedAt: serverTimestamp()
      });

      // 2. Calculate amount changes and identify target account
      const targetAccId = tx.accountId || tx.sourceAccountId || (accounts && accounts.length > 0 ? accounts[0].id : '');
      const amt = Number(tx.amount || 0);
      const txType = (tx.type || '').toLowerCase();
      const isIncome = txType === 'income' || txType === 'inflow';
      const amountChange = isIncome ? amt : -amt;

      console.log("🟢 [DEBUG] Target Account ID:", targetAccId, "Amount:", amt, "Type:", txType, "IsIncome:", isIncome, "AmountChange:", amountChange);

      // 3. Atomically update the target account balance
      if (targetAccId) {
        const accRef = doc(db, `users/${uid}/accounts`, targetAccId);
        const accSnap = await getDoc(accRef);
        console.log("🟢 [DEBUG] Account document snapshot exists?", accSnap.exists(), "at path:", `users/${uid}/accounts/${targetAccId}`);
        if (accSnap.exists()) {
          batch.update(accRef, {
            currentBalance: increment(amountChange),
            updatedAt: serverTimestamp()
          });
        } else {
          console.warn("⚠️ [DEBUG] Account document does not exist for targetAccId:", targetAccId);
        }
      } else {
        console.warn("⚠️ [DEBUG] No target account ID found for approval!");
      }

      // 4. If it's an expense, atomically increment the matching miniBudget spentAmount
      if (!isIncome && tx.category) {
        console.log("🟢 [DEBUG] Querying miniBudgets for category:", tx.category);
        const queryBudgets = query(
          collection(db, `users/${uid}/miniBudgets`),
          where('userId', '==', uid)
        );
        const querySnap = await getDocs(queryBudgets);
        console.log("🟢 [DEBUG] Found miniBudgets count:", querySnap.docs.length);
        const matchingBudgetDoc = querySnap.docs.find(docSnap => {
          const data = docSnap.data();
          return data.categoryTitle === tx.category || data.category === tx.category;
        });

        if (matchingBudgetDoc) {
          console.log("🟢 [DEBUG] Found matching miniBudget doc ID:", matchingBudgetDoc.id);
          const budgetRef = doc(db, `users/${uid}/miniBudgets`, matchingBudgetDoc.id);
          batch.update(budgetRef, {
            spentAmount: increment(amt),
            updatedAt: serverTimestamp()
          });
        } else {
          console.log("ℹ️ [DEBUG] No matching miniBudget found for category:", tx.category);
        }
      }

      // Commit all operations together atomically
      console.log("🟢 [DEBUG] Committing batch for transaction approval...");
      await batch.commit();
      console.log("✅ [DEBUG] Batch committed successfully for transaction approval!");
      onTransactionApproved?.();
    } catch (err) {
      console.error("❌ [DEBUG] Failed to approve transaction draft:", err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/transactions/${tx.id}`);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDismissDraftWithConfirm = (tx: any) => {
    setConfirmModal({
      isOpen: true,
      message: t('notification_dispatch_hub.reject_tx_confirm'),
      onConfirm: async () => {
        setIsProcessing(tx.id);
        try {
          if (tx.isPendingApprovalCol) {
            await handleApprovalAction(uid, tx.id, 'reject');
          } else {
            const txRef = doc(db, `users/${uid}/transactions`, tx.id);
            await deleteDoc(txRef);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `users/${uid}/pending_approvals/${tx.id}`);
        } finally {
          setIsProcessing(null);
        }
      }
    });
  };

  // Multi-theme Dynamic Calculations
  // 1. Budget Overruns
  const calculateBudgetSpent = (budget: any) => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    
    const period = budget.period || 'daily';
    if (period === 'monthly') {
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      const curDay = now.getDate();

      let initYear = curYear;
      let initMonth = curMonth;

      if (curDay < dbPayday) {
        const prevMonthDate = new Date(curYear, curMonth - 1, 1);
        initYear = prevMonthDate.getFullYear();
        initMonth = prevMonthDate.getMonth();
      }

      start = new Date(initYear, initMonth, dbPayday);
      end = new Date(initYear, initMonth + 1, dbPayday - 1, 23, 59, 59);
    } else if (period === 'weekly') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      monday.setHours(0,0,0,0);
      start = monday;
      end = new Date(monday);
      end.setDate(end.getDate() + 7);
    } else {
      // daily
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    }

    return transactions.reduce((total, tx) => {
      if (tx.status === 'draft') return total;
      const txType = (tx.type || '').toLowerCase();
      if (txType !== 'expense' && txType !== 'outflow') return total;
      
      const txDate = new Date(tx.date);
      if (txDate >= start && txDate <= end) {
        if (tx.budgetId === budget.id) return total + Number(tx.amount || 0);
        if (tx.category === budget.category) {
          if (!budget.subcategory || budget.subcategory === 'All' || budget.subcategory === '') {
            return total + Number(tx.amount || 0);
          }
          if (tx.subcategory === budget.subcategory) {
            return total + Number(tx.amount || 0);
          }
        }
      }
      return total;
    }, 0);
  };

  // Helper to show dynamic browser-like banner style viewport toast if iframe blocks permissions
  const showViewportToast = (emoji: string, header: string, body: string) => {
    const toastId = `vantage-toast-${Date.now()}`;
    const toastEl = document.createElement('div');
    toastEl.id = toastId;
    toastEl.className = "fixed top-6 left-1/2 -translate-x-1/2 z-[300] bg-[#1E293B] border-2 border-[#A6DDB1] text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce";
    toastEl.style.fontFamily = "'Google Sans', sans-serif";
    toastEl.innerHTML = `
      <div class="text-[#A6DDB1] text-lg font-bold">${emoji}</div>
      <div class="flex flex-col text-left">
        <span class="text-[12px] font-bold text-[#A6DDB1]">${header}</span>
        <span class="text-xs font-normal text-neutral-100 mt-0.5">${body}</span>
      </div>
    `;
    document.body.appendChild(toastEl);
    setTimeout(() => {
      toastEl.remove();
    }, 6000);
  };

  // Real-time limit threshold listeners and locks monitoring
  useEffect(() => {
    if (!uid || miniBudgets.length === 0) return;

    // Load active alert locks to prevent repetitive notifications
    const lockKey = `vantage_locked_budget_alerts_${uid}`;
    let locks: Record<string, { warningFired?: boolean; criticalFired?: boolean; lastLimit?: number; monthKey?: string }> = {};
    try {
      const cachedLocks = localStorage.getItem(lockKey);
      if (cachedLocks) {
        locks = JSON.parse(cachedLocks);
      }
    } catch (_) {}

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let alarmsChanged = false;
    let locksChanged = false;
    const newAlertsLog = [...budgetAlerts];

    miniBudgets.forEach(b => {
      const spent = calculateBudgetSpent(b);
      const limit = Number(b.maxBudget || b.limit || 0);
      if (limit <= 0) return;

      const ratio = spent / limit;
      const percentage = Math.round(ratio * 100);
      const remainingBytes = limit - spent;
      const remainingAmountFormatted = Math.max(0, remainingBytes).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Daily Spends identification: b.period is daily or contains "daily"
      const isDailySpends = b.period === 'daily' || b.category?.toLowerCase().includes('daily') || b.title?.toLowerCase().includes('daily');
      const todayDateStr = now.toISOString().split('T')[0];
      
      // Strict daily key for daily limits vs monthly key for rest
      const dateLockKey = isDailySpends ? todayDateStr : currentMonthKey;

      // Clean or initialize lock key
      if (!locks[b.id]) {
        locks[b.id] = { lastLimit: limit, monthKey: dateLockKey };
        locksChanged = true;
      }

      // If allocation (limit) changes, or if tracking date lock key changes, reset locks
      if (locks[b.id].lastLimit !== limit || locks[b.id].monthKey !== dateLockKey) {
        locks[b.id].warningFired = false;
        locks[b.id].criticalFired = false;
        locks[b.id].lastLimit = limit;
        locks[b.id].monthKey = dateLockKey;
        locksChanged = true;
      }

      // If budget spent drops below 80% (e.g., transaction deleted), clear warning lock (ONLY for non-daily budgets)
      if (ratio < 0.80 && locks[b.id].warningFired) {
        if (!isDailySpends) {
          locks[b.id].warningFired = false;
          locksChanged = true;
        }
      }
      if (ratio < 1.0 && locks[b.id].criticalFired) {
        locks[b.id].criticalFired = false;
        locksChanged = true;
      }

      // 1. Warning State: spent reaches EXACTLY >= 80% and < 100% of allocation cap
      if (ratio >= 0.80 && ratio < 1.0) {
        if (!locks[b.id].warningFired) {
          locks[b.id].warningFired = true;
          locksChanged = true;

          const translatedCategory = t(`categories.${b.category}`, { defaultValue: t(`subcategories.${b.category}`, { defaultValue: b.category }) }) as string;
          const alertId = `budget-warning-${b.id}-${limit}-${Date.now()}`;
          const titleText = isDailySpends
            ? t('notification_dispatch_hub.daily_warning_title', { remaining: remainingAmountFormatted, currency: b.currency || 'AED' })
            : t('notification_dispatch_hub.category_warning_title', { percent: percentage, category: translatedCategory, remaining: remainingAmountFormatted, currency: b.currency || 'AED' });
          
          const alertNode: BudgetAlertNode = {
            id: alertId,
            budgetId: b.id,
            category: b.category,
            type: 'warning',
            title: titleText,
            spent,
            limit,
            currency: b.currency || 'AED',
            date: todayDateStr,
            time: now.toTimeString().slice(0, 5),
            cleared: false,
            isDailySpends: isDailySpends
          };

          newAlertsLog.push(alertNode);
          alarmsChanged = true;

          // Dispatch notifications with lock screen click navigations
          sendDeviceNotification(
            isDailySpends ? '⚠️ DAILY SPENDS OVERVIEW' : '⚠️ VANTAGE BUDGET WARNING', 
            titleText, 
            () => handleAlertClicked(b.id)
          );
          playNotificationSound();
          showViewportToast('⚠️', isDailySpends ? 'DAILY SPENDS NEAR LIMIT' : 'BUDGET NEAR CONSUMED', titleText);
        }
      }

      // 2. Critical State: expenses cross or touch 100% (ratio >= 1.0)
      if (ratio >= 1.0) {
        if (!locks[b.id].criticalFired) {
          locks[b.id].warningFired = true; // also prevent duplicate warning
          locks[b.id].criticalFired = true;
          locksChanged = true;

          const translatedCategory = t(`categories.${b.category}`, { defaultValue: t(`subcategories.${b.category}`, { defaultValue: b.category }) }) as string;
          const alertId = `budget-critical-${b.id}-${limit}-${Date.now()}`;
          const titleText = isDailySpends
            ? t('notification_dispatch_hub.daily_critical_title', { percent: percentage })
            : t('notification_dispatch_hub.category_critical_title', { category: translatedCategory, percent: percentage });
          
          const alertNode: BudgetAlertNode = {
            id: alertId,
            budgetId: b.id,
            category: b.category,
            type: 'critical',
            title: titleText,
            spent,
            limit,
            currency: b.currency || 'AED',
            date: todayDateStr,
            time: now.toTimeString().slice(0, 5),
            cleared: false,
            isDailySpends: isDailySpends
          };

          newAlertsLog.push(alertNode);
          alarmsChanged = true;

          // Dispatch notifications with lock screen click navigations
          sendDeviceNotification(
            isDailySpends ? '🚨 DAILY SPENDS BREACHED' : '🚨 VANTAGE BUDGET EXHAUSTED', 
            titleText, 
            () => handleAlertClicked(b.id)
          );
          playNotificationSound();
          showViewportToast('🚨', isDailySpends ? 'DAILY LIMIT EXHAUSTED' : 'LIMIT OVERAGE VIOLATION', titleText);
        }
      }
    });

    if (alarmsChanged) {
      saveBudgetAlerts(newAlertsLog);
    }
    if (locksChanged) {
      localStorage.setItem(lockKey, JSON.stringify(locks));
    }
  }, [miniBudgets, transactions, uid]);

  const handleClearBudgetAlert = (alertId: string) => {
    const updated = budgetAlerts.map(a => a.id === alertId ? { ...a, cleared: true } : a);
    saveBudgetAlerts(updated);
  };

  const handleAlertClicked = (bId: string) => {
    // Navigate to Budgets tab
    window.dispatchEvent(new CustomEvent('vantage-navigate-tab', { detail: { tab: 'budgets' } }));
    setIsOpen(false);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open-vantage-budget', { detail: { budgetId: bId } }));
    }, 200);
  };

  const computedBudgetReminders: any[] = [];
  miniBudgets.forEach(b => {
    const spent = calculateBudgetSpent(b);
    const limit = Number(b.maxBudget || b.limit || 0);
    if (limit > 0) {
      if (spent > limit) {
        computedBudgetReminders.push({
          id: `budget_${b.id || b.category}_overrun`,
          type: 'overrun',
          title: `🚨 BUDGET OVERRUN: ${b.title || b.category}`,
          text: `You have spent ${b.currency || 'AED'} ${spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} of ${b.currency || 'AED'} ${limit.toLocaleString()}, exceeding limit by ${b.currency || 'AED'} ${(spent - limit).toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
          isOverrun: true
        });
      } else if (spent >= limit * 0.8) {
        const percentage = Math.round((spent / limit) * 100);
        computedBudgetReminders.push({
          id: `budget_${b.id || b.category}_warning`,
          type: 'warning',
          title: `⚠️ BUDGET APPROACHING LIMIT: ${b.title || b.category}`,
          text: `You have spent ${percentage}% (${b.currency || 'AED'} ${spent.toLocaleString()} of ${limit.toLocaleString()}) on this cycle. Keep margins tight.`,
          isOverrun: false
        });
      }
    }
  });

  // 2. Past due / Due liability accounts
  const computedLiabilityReminders: any[] = [];
  const todayStr = new Date().toISOString().split('T')[0];

  accounts.forEach(acc => {
    const isLiability = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(acc.type);
    if (isLiability) {
      const balanceVal = accountBalances[acc.id] ?? 0;
      // Outstanding balance is negative in Vantage (e.g. -AED 5,000)
      if (balanceVal < 0 && acc.paymentDueDate) {
        const isPastDue = acc.paymentDueDate < todayStr;
        const dueAbs = Math.abs(balanceVal);
        
        computedLiabilityReminders.push({
          id: `liability_${acc.id}`,
          type: isPastDue ? 'past-due' : 'due',
          title: isPastDue ? `⚠️ ${t('morning_espresso.past_due_outstanding')}: ${acc.name}` : `⚡ ${t('morning_espresso.upcoming_due_date')}: ${acc.name}`,
          text: `${acc.currency || 'AED'} ${t('morning_espresso.due_on', { amount: dueAbs.toLocaleString(undefined, { minimumFractionDigits: 2 }), date: acc.paymentDueDate })}. ${t('morning_espresso.liabilities_reduce_liquidity')}`,
          isPastDue
        });
      }
    }
  });

  // 3. Milestone Updates
  const computedMilestoneReminders: any[] = [];
  milestones.forEach((m, mIdx) => {
    const target = Number(m.targetAmount || 0);
    const saved = Number(m.currentSavings || 0);
    if (target > 0) {
      const pct = (saved / target) * 100;
      if (pct >= 100) {
        computedMilestoneReminders.push({
          id: `milestone_${m.id || mIdx}_achieved`,
          type: 'milestone',
          title: `🏆 SAVINGS GOAL ACHIEVED: ${m.title}`,
          text: `Congratulations! Your milestone target of ${m.currency || 'AED'} ${target.toLocaleString()} has been fully accumulated.`
        });
      } else if (pct >= 80) {
        computedMilestoneReminders.push({
          id: `milestone_${m.id || mIdx}_aligned`,
          type: 'milestone',
          title: `📈 MILESTONE ALIGNED: ${m.title}`,
          text: `Your goal is ${pct.toFixed(0)}% complete (${m.currency || 'AED'} ${saved.toLocaleString()} accumulated). Almost there!`
        });
      }
    }
  });

  // Combine reminders and milestones, filtering out dismissed ones
  const allRemindersAndMilestones = [
    ...computedLiabilityReminders,
    ...computedBudgetReminders,
    ...computedMilestoneReminders
  ].filter(r => !dismissedReminders[r.id]);

  // Define eligibleDrafts (excluding pending_confirmation that have not yet reached today's date), deduplicated by recurringId/date
  const eligibleDrafts = React.useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const rawEligible = drafts.filter(tx => {
      if (tx.status === 'draft') return true;
      if (tx.status === 'pending_confirmation') {
        return tx.date <= todayStr;
      }
      return false;
    });

    const unconfirmedForMonth = rawEligible.filter(tx => {
      const txMonth = tx.date ? tx.date.substring(0, 7) : '';
      const recId = tx.recurringId;
      const txTitle = (tx.notes || tx.category || '').replace('(Recurring)', '').replace('(recurring)', '').trim().toLowerCase();

      const hasConfirmedForMonth = allTransactions.some(cTx => {
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

    const seen = new Set<string>();
    const unique: any[] = [];
    const combined = [...pendingApprovals, ...unconfirmedForMonth];
    for (const tx of combined) {
      const recKey = tx.ruleId || tx.recurringId 
        ? `${tx.ruleId || tx.recurringId}_${tx.date ? tx.date.substring(0, 7) : tx.date}` 
        : `${(tx.notes || tx.category || '').replace('(Recurring)', '').trim()}_${tx.amount}_${tx.date ? tx.date.substring(0, 7) : tx.date}`;
      if (!seen.has(recKey)) {
        seen.add(recKey);
        unique.push(tx);
      }
    }
    return unique;
  }, [drafts, pendingApprovals, allTransactions]);

  // Alert/notify the user about newly matured transactions requiring confirmation
  useEffect(() => {
    if (!uid || eligibleDrafts.length === 0) return;
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Find unconfirmed items whose date is today (or past) and are eligible to confirm
    const matureTx = eligibleDrafts.filter(tx => (tx.status === 'pending_confirmation' || tx.status === 'draft') && tx.date <= todayStr);
    
    if (matureTx.length > 0) {
      const sessionKey = `vantage_notified_txs_${uid}`;
      const notifiedIds: string[] = JSON.parse(sessionStorage.getItem(sessionKey) || '[]');
      
      const newToNotify = matureTx.filter(tx => {
        const dedupKey = tx.recurringId ? `${tx.recurringId}_${tx.date}` : tx.id;
        return !notifiedIds.includes(tx.id) && !notifiedIds.includes(dedupKey);
      });
      
      if (newToNotify.length > 0) {
        newToNotify.forEach(tx => {
          const amtFormatted = Number(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
          const text = `Unconfirmed transaction "${tx.notes || tx.category}" for ${tx.currency || 'AED'} ${amtFormatted} requires confirmation today.`;
          
          sendDeviceNotification(
            '⏳ Transaction Confirmation Required',
            text,
            () => setIsOpen(true)
          );
          showViewportToast('⏳', 'CONFIRMATION REQUIRED', text);
          notifiedIds.push(tx.id);
          if (tx.recurringId) {
            notifiedIds.push(`${tx.recurringId}_${tx.date}`);
          }
        });
        
        sessionStorage.setItem(sessionKey, JSON.stringify(notifiedIds));
      }
    }
  }, [eligibleDrafts, uid]);

  // Aggregated Counter logic
  const activeNotifications = checklist.filter(item => item.scheduledAt && item.notified && !item.completed && item.status !== 'completed');
  const activeNotificationsCount = activeNotifications.length;
  const activeBudgetAlerts = budgetAlerts.filter(a => !a.cleared);
  const activeBudgetAlertsCount = activeBudgetAlerts.length;
  const userBroadcastsCount = userBroadcasts.length;
  const pendingChecklistsCount = checklist.filter(item => !item.scheduledAt && !item.completed && item.status !== 'completed').length;
  const completedReminders = checklist.filter(item => item.completed || item.status === 'completed');
  const totalCount = eligibleDrafts.length + allRemindersAndMilestones.length + pendingChecklistsCount + activeNotificationsCount + activeBudgetAlertsCount + foregroundQuietIncrement + maturedPendingSalaryBreakdowns.length + (showMissingSalaryAlert ? 1 : 0) + userBroadcastsCount;
  const hasBadge = totalCount > 0;

  // Broadcast totalCount of active tasks and notifications
  useEffect(() => {
    const ev = new CustomEvent('vantage-notifications-count-update', { detail: { count: totalCount } });
    window.dispatchEvent(ev);
    (window as any).__vantageNotificationsCount = totalCount;
  }, [totalCount]);

  useEffect(() => {
    const handleToggle = () => {
      setIsOpen(prev => !prev);
    };
    window.addEventListener('vantage-toggle-notifications', handleToggle);
    return () => window.removeEventListener('vantage-toggle-notifications', handleToggle);
  }, []);

  return (
    <React.Fragment>
      <style>{`
        /* Hide Targeted Elements in Notification Dispatch Hub */
        div#root:nth-of-type(1) > div:nth-of-type(1) > header:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div#dispatch-hub-overlay-drawer:nth-of-type(3) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) {
          display: none !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > header:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div#dispatch-hub-overlay-drawer:nth-of-type(3) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1) {
          display: none !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > header:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div#dispatch-hub-overlay-drawer:nth-of-type(3) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(2) {
          display: none !important;
        }
        /* Style for Quick Append Input */
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(1) > input:nth-of-type(1) {
          width: 150px;
        }
      `}</style>
      {/* Floating Action Bell Button Node */}

      <motion.button
         id="tour-notification-bell"
         key="dispatch-fab-bell"
         initial={{ opacity: 0, scale: 0.8 }}
         animate={{ opacity: 1, scale: 1 }}
         exit={{ opacity: 0, scale: 0.8 }}
         transition={{ duration: 0.15 }}
         whileHover={{ scale: 1.05 }}
         whileTap={{ scale: 0.95 }}
         onClick={(e) => {
           e.stopPropagation();
           e.preventDefault();
           if (!isOpen) {
             setOpenTime(Date.now());
             setTimeout(() => {
               setIsOpen(true);
             }, 40);
           } else {
             setIsOpen(false);
           }
         }}
         style={{ fontFamily: "'Google Sans', sans-serif" }}
         className="w-[30px] h-[30px] bg-[#FFFFFF] border-0 rounded-full shadow-2xl flex items-center justify-center text-neutral-800 hover:text-[#A6DDB1] relative cursor-pointer"
      >
        <Bell size={18} className={eligibleDrafts.length > 0 ? "animate-bounce" : ""} />
        
        {/* Dynamic High-Contrast Warning Count Badge */}
        <AnimatePresence>
          {hasBadge && (
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              id="dispatch-badge-counter"
              className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full text-[12px] font-bold h-5 w-5 flex items-center justify-center border-2 border-[#FFFFFF] shadow-md px-1"
            >
              <span className="font-sans font-bold leading-none">{totalCount}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Drawer Overlay Panel */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <React.Fragment>
              {/* Backdrop layer */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.35 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  if (Date.now() - openTime > 300) {
                    setIsOpen(false);
                  }
                }}
                className="fixed inset-0 bg-[#0E1111]/60 z-[99999] pointer-events-auto dispatch-hub-backdrop"
                id="dispatch-hub-backdrop"
              />

              {/* Panel Sheet */}
              <motion.div
                initial={{ y: -20, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -20, opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                style={{ fontFamily: "'Google Sans', sans-serif" }}
                className="fixed top-16 right-4 md:right-6 w-[calc(100%-2rem)] max-w-[380px] max-h-[85vh] bg-[#FFFFFF] border border-neutral-200 rounded-2xl shadow-2xl z-[100000] flex flex-col overflow-hidden text-neutral-800 dispatch-hub-drawer"
                id="dispatch-hub-overlay-drawer"
                onClick={(e) => e.stopPropagation()}
              >
              {/* Header section with Google Sans font weight: 700 */}
              <div className="p-4 border-b border-neutral-150 flex items-center justify-between bg-neutral-50/50">
                <div className="flex flex-col">
                  <span 
                    className="text-neutral-900 text-sm font-bold"
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  >
                    {t('notification_dispatch_hub.your_finances_hub')}
                  </span>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 transition-colors flex items-center justify-center text-neutral-500 hover:text-neutral-800"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-neutral-150 px-4 gap-4">
                <button 
                  onClick={() => setActiveHubTab('notifications')} 
                  className={`py-2 text-[12px] font-bold ${activeHubTab === 'notifications' ? 'text-[#A6DDB1] border-b-2 border-[#A6DDB1]' : 'text-neutral-500'}`} 
                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                >
                  {t('notification_dispatch_hub.notifications_tab')}
                </button>
                <button 
                  onClick={() => setActiveHubTab('shopping')} 
                  className={`py-2 text-[12px] font-bold ${activeHubTab === 'shopping' ? 'text-[#A6DDB1] border-b-2 border-[#A6DDB1]' : 'text-neutral-500'}`} 
                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                >
                  {t('notification_dispatch_hub.shopping_cart_tab')}
                </button>
              </div>

              {/* Scrollable list content */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 [WebkitOverflowScrolling:touch]">
                <div style={{ display: activeHubTab === 'shopping' ? 'block' : 'none' }}>
                  <div className="flex flex-col gap-2">
                    <ShoppingList uid={uid} />
                  </div>
                </div>
                <div style={{ display: activeHubTab === 'notifications' ? 'block' : 'none' }}>
                  <div className="flex flex-col gap-4">

                  {/* MORNING FINANCIAL ESPRESSO AUDIO BRIEF FEATURED CARD */}
                  <div className="p-4 bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#111C2D] text-white rounded-2xl flex flex-col gap-3 shadow-md border border-white/10 relative overflow-hidden text-left" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                    <div className="absolute top-[-20px] right-[-20px] w-32 h-32 rounded-full bg-amber-500/15 blur-2xl pointer-events-none" />
                    <div className="flex items-start justify-between relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center shrink-0 text-white shadow-md shadow-amber-500/20">
                          <Coffee size={20} className="animate-pulse" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-normal text-amber-300 bg-white/10 px-2 py-0.5 rounded-full border border-white/10">
                              7:00 AM Daily Briefing
                            </span>
                            <span className="text-[10px] text-neutral-400 font-normal">20s Audio</span>
                          </div>
                          <h4 className="text-sm font-bold text-white mt-1">
                            Morning Financial Espresso
                          </h4>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-neutral-300 font-normal leading-relaxed relative z-10">
                      {t('notification_dispatch_hub.audio_briefing_desc')}
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-white/10 relative z-10">
                      <button
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('espresso-modal-toggled', { detail: { isOpen: true } }));
                          setIsOpen(false);
                        }}
                        className="px-4 py-2 bg-[#A6DDB1] hover:bg-[#96cdb1] text-[#0F172A] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                      >
                        <Play size={14} className="fill-[#0F172A]" />
                        <span>{t('notification_dispatch_hub.listen_audio_brief')}</span>
                      </button>

                      <button
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('espresso-modal-toggled', { detail: { isOpen: true } }));
                        }}
                        className="text-[11px] font-normal text-neutral-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {t('notification_dispatch_hub.preview_7am')}
                      </button>
                    </div>
                  </div>
                 {/* UPCOMING PAYDAY ALERT & CONFIG SETUP */}
                 {showMissingSalaryAlert && (
                   <div className="flex flex-col gap-2">
                     <div className="flex items-center justify-between">
                       <span 
                         className="text-[12px] text-neutral-500 font-bold tracking-wide animate-pulse"
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                       >
                         {t('notification_dispatch_hub.upcoming_payday')}
                       </span>
                     </div>
                     <div 
                       className="p-4 bg-[#FFFFFF] border border-neutral-150 rounded-2xl flex flex-col gap-3.5 shadow-sm"
                       style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                     >
                       <div className="flex items-start gap-3">
                         <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                           <Calendar size={18} className="text-amber-505 text-amber-600" />
                         </div>
                         <div className="flex-1 min-w-0 text-left">
                           <h4 className="text-neutral-800 text-sm font-normal tracking-tight" style={{ fontWeight: 400 }}>
                             {t('notification_dispatch_hub.upcoming_payday')}
                           </h4>
                           <p className="text-xs text-neutral-500 mt-1 leading-relaxed" style={{ fontWeight: 400 }}>
                             {t('notification_dispatch_hub.payday_alert_desc', { day: dbPayday })}
                           </p>
                         </div>
                       </div>
                       <div className="flex items-center justify-end gap-2.5 pt-1">
                         <button
                           onClick={() => {
                             window.dispatchEvent(new CustomEvent('open-salary-breakdown-modal'));
                             setIsOpen(false);
                           }}
                           className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-[#FFFFFF] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-md"
                           style={{ fontWeight: 700 }}
                         >
                           {t('notification_dispatch_hub.configure_breakdown')}
                         </button>
                       </div>
                     </div>
                   </div>
                 )}

                 {/* SALARY BREAKDOWN CONVERSION ACTION ALERTS */}
                 {maturedPendingSalaryBreakdowns.length > 0 && (
                   <div className="flex flex-col gap-2">
                     <div className="flex items-center justify-between">
                       <span 
                         className="text-[12px] text-neutral-500 font-bold tracking-wide"
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                       >
                         {t('notification_dispatch_hub.upcoming_allocations')}
                       </span>
                       <span className="text-[12px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-650 border border-indigo-100 font-bold">
                         {t('notification_dispatch_hub.pending_count', { count: maturedPendingSalaryBreakdowns.length })}
                       </span>
                     </div>
  
                     <div className="flex flex-col gap-2.5">
                       {maturedPendingSalaryBreakdowns.map((sb, sbIdx) => {
                         const yearMonthStr = sb.id;
                         const [year, month] = yearMonthStr.split('-');
                         const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString(i18n.language || 'default', { month: 'long' });
                         const activeAllocableKeys = (sb.activeEnvelopes || []).filter((k: string) => {
                           const val = Number(sb.allocations?.[k] || 0);
                           return val > 0;
                         });
                         
                         return (
                           <div
                             key={`hub-sb-alert-${sb.id}-${sbIdx}`}
                             className="p-4 bg-[#FFFFFF] border border-neutral-150 rounded-2xl flex flex-col gap-3.5 shadow-sm transition-all"
                             style={{ fontFamily: "'Google Sans', sans-serif" }}

                           >
                             <div className="flex items-start gap-3">
                               <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                                 <Sparkles size={18} className="text-indigo-600" />
                               </div>
                               <div className="flex-1 min-w-0">
                                 <div className="flex items-center justify-between gap-1">
                                   <h4 className="text-neutral-800 text-sm font-bold tracking-wide" style={{ fontWeight: 700 }}>
                                      <span 
                                        className="cursor-pointer hover:text-indigo-600 transition-colors"
                                        onClick={() => {
                                          window.dispatchEvent(new CustomEvent('breakdown-modal-toggled', { detail: { isOpen: true, sb } }));
                                        }}
                                      >
                                        {t('notification_dispatch_hub.salary_distribution', { month: monthName, year })}
                                      </span>
                                   </h4>
                                   <span className="text-neutral-900 text-sm font-bold tracking-tight shrink-0" style={{ fontWeight: 700 }}>
                                     {sb.baseSalaryInput?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                   </span>
                                 </div>
                                 <p className="text-xs text-neutral-500 mt-1 leading-relaxed" style={{ fontWeight: 400 }}>
                                   {t('notification_dispatch_hub.allocations_mature_desc')}
                                 </p>
                               </div>
                             </div>
                             
                             <div className="flex items-center justify-end gap-2.5 pt-1">
                               <div className="w-full" style={{ color: '#000000', backgroundColor: '#ffffff' }}>
                                 {!sb.tier1Approved ? (
                                   <button
                                     onClick={() => handleConfirmTier1(sb, sb.selectedDbRecurringIncomes?.[0]?.accountId || sb.selectedIncomes?.[0] || accounts[0]?.id || '')}
                                     className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-[#FFFFFF] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-md"
                                     style={{ 
                                       fontWeight: 700,
                                       backgroundColor: '#A6DDB1',
                                       color: '#000000',
                                       fontSize: '14px'
                                     }}
                                   >
                                     {t('notification_dispatch_hub.verify_salary_receipt')}
                                   </button>
                                 ) : (
                                   <div className="w-full text-left mt-2 border-t border-neutral-100 pt-3 animate-fade-in">
                                     <div className="flex items-center justify-between mb-2">
                                       <span className="text-[12px] text-neutral-500 font-bold" style={{ fontWeight: 700 }}>
                                         {t('notification_dispatch_hub.allocation_checklist')}
                                       </span>
                                       <span className="text-[12px] text-indigo-600 font-bold" style={{ fontWeight: 700 }}>
                                         {t('notification_dispatch_hub.allocations_done', { count: activeAllocableKeys.filter(k => sb.confirmedAllocations?.[k] === true).length, total: activeAllocableKeys.length })}
                                       </span>
                                     </div>
                                     <div className="divide-y divide-neutral-100 max-h-[160px] overflow-y-auto pr-1">
                                       {activeAllocableKeys.map((key: string, allocIdx: number) => {
                                         const isLineConfirmed = sb.confirmedAllocations?.[key] === true;
                                         const allocatedAmt = Number(sb.allocations?.[key] || 0);
                                         
                                         let label = key;
                                         let isTransfer = key.startsWith('transfer__');
                                         let category = '';
                                         let subcategory = '';

                                         if (isTransfer) {
                                           const destId = key.replace('transfer__', '');
                                           const destAcc = accounts.find(a => a.id === destId);
                                           label = t('notification_dispatch_hub.transfer_to', { name: destAcc?.name || destId });
                                         } else {
                                           const parts = key.split('__');
                                           const cat = parts[0] || '';
                                           const sub = parts[1] || '';
                                           const translatedCategory = t('categories.' + cat, cat) as string;
                                           const translatedSubcategory = sub ? (t('subcategories.' + sub, sub) as string) : '';
                                           label = sub ? `${translatedCategory} > ${translatedSubcategory}` : translatedCategory;
                                         }

                                         return (
                                           <div key={`sb-alloc-key-${key}-${allocIdx}`} className="py-2 flex items-center justify-between gap-3 text-left animate-fade-in">
                                             <div className="flex flex-col min-w-0">
                                               <span className="text-xs text-neutral-700 truncate font-normal" style={{ fontWeight: 400 }}>
                                                 {label}
                                               </span>
                                               <span style={{ fontWeight: 700 }} className="text-xs text-neutral-900 mt-0.5">
                                                 {sb.currency || 'AED'} {allocatedAmt.toLocaleString()}
                                               </span>
                                             </div>

                                             {isLineConfirmed ? (
                                               <span className="text-[12px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-normal flex items-center gap-0.5" style={{ fontWeight: 400 }}>
                                                 <Check size={10} className="stroke-[3]" />
                                                 {t('notification_dispatch_hub.confirmed')}
                                               </span>
                                             ) : (
                                               <button
                                                 onClick={() => handleConfirmAllocationLine(
                                                   sb, 
                                                   key, 
                                                   allocatedAmt, 
                                                   isTransfer, 
                                                   category, 
                                                   subcategory, 
                                                   label, 
                                                   sb.selectedDbRecurringIncomes?.[0]?.accountId || sb.selectedIncomes?.[0] || accounts[0]?.id || ''
                                                 )}
                                                 className="text-[12px] text-indigo-650 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer font-bold"
                                                 style={{ fontWeight: 700 }}
                                               >
                                                 {t('notification_dispatch_hub.confirm_btn')}
                                               </button>
                                             )}
                                           </div>
                                         );
                                       })}
                                     </div>
                                   </div>
                                 )}
                               </div>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   </div>
                 )}

                {/* 1. SECTION: Pending Approvals Stream */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span 
                      className="text-[12px] text-neutral-500 font-bold"
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                    >
                      {t('notification_dispatch_hub.pending_approvals')}
                    </span>
                    <span className="text-[12px] font-mono px-2 py-0.5 rounded-full bg-rose-50 text-rose-650 border border-rose-100 font-bold font-sans">
                      {t('notification_dispatch_hub.actions_count', { count: eligibleDrafts.length })}
                    </span>
                  </div>

                  {eligibleDrafts.length === 0 ? (
                    <div className="py-5 px-3 bg-neutral-50/70 rounded-xl border border-neutral-200/80 text-center flex flex-col items-center justify-center gap-1.5">
                      <ShieldCheck size={18} className="text-[#A6DDB1] dark:text-emerald-600 opacity-80" />
                      <span className="text-[12px] text-neutral-500 leading-relaxed font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>{t('notification_dispatch_hub.approval_queue_empty')}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <AnimatePresence mode="popLayout">
                        {eligibleDrafts.map((tx, txIdx) => {
                          const associatedAccount = accounts.find(a => a.id === tx.accountId);
                          return (
                            <motion.div
                              key={`hub-tx-card-${tx.id || txIdx}-${txIdx}`}
                              layout
                              initial={{ transform: 'scale(0.95)', opacity: 0 }}
                              animate={{ transform: 'scale(1)', opacity: 1 }}
                              exit={{ transform: 'scale(0.9)', x: 50, opacity: 0 }}
                              className="p-3 bg-neutral-50 border border-neutral-200 hover:border-neutral-300 rounded-xl flex flex-col gap-2.5 transition-colors shadow-xs"
                            >
                              <div className="flex items-start justify-between gap-2.5 min-w-0">
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tx.type === 'income' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-605 border border-rose-100'}`}>
                                    <span className="text-sm font-bold">{tx.emoji || (tx.type === 'income' ? '📈' : '📉')}</span>
                                  </div>
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span 
                                      className="text-neutral-800 leading-tight truncate font-sans"
                                      style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(12px, 2.8vw, 13px)", fontWeight: 400 }}
                                    >
                                      {tx.notes || t('notification_dispatch_hub.scheduled_tx')}
                                    </span>
                                    <span className="text-[12px] text-neutral-500 mt-0.5 font-bold">
                                      {associatedAccount?.name || t('notification_dispatch_hub.vantage_account')} ({associatedAccount?.currency || 'AED'})
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end shrink-0">
                                  <span 
                                    className="text-xs font-bold text-neutral-900 font-mono"
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                                  >
                                    {tx.type === 'income' ? '+' : '-'}{associatedAccount?.currency || 'AED'} {Number(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[12px] text-neutral-400 mt-0.5" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                                    {t('notification_dispatch_hub.sched_label', { date: tx.date || '07/05/2026' })}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 mt-0.5 text-[12px]">
                                <button
                                  type="button"
                                  disabled={isProcessing === tx.id}
                                  onClick={() => {
                                    console.log("🟢 [DEBUG] Direct Approve button clicked for tx:", tx);
                                    handleApproveDraft(tx);
                                  }}
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                                  className="flex-1 h-[32px] bg-[#A6DDB1] text-neutral-900 rounded-lg text-[12px] hover:bg-[#A6DDB1]/90 hover:brightness-105 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                                >
                                  {isProcessing === tx.id ? t('notification_dispatch_hub.processing') : t('notification_dispatch_hub.approve')}
                                </button>
                                <button
                                  type="button"
                                  disabled={isProcessing === tx.id}
                                  onClick={() => handleDismissDraftWithConfirm(tx)}
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                  className="px-3 h-[32px] bg-transparent border border-rose-250 hover:bg-rose-50 hover:text-rose-700 text-rose-600 rounded-lg text-[12px] active:scale-95 transition-all flex items-center justify-center cursor-pointer disabled:opacity-40"
                                >
                                  {t('notification_dispatch_hub.dismiss')}
                                </button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {/* 1.5 SECTION: ACTIVE NOTIFICATION LOG VIEW */}
                {(activeNotifications.length > 0 || activeBudgetAlerts.length > 0 || userBroadcasts.length > 0) && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span 
                        className="text-[12px] font-bold text-[#A6DDB1] dark:text-emerald-700"
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                      >
                        {t('notification_dispatch_hub.dispatch_push_logs')}
                      </span>
                      <span className="text-[12px] font-mono px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100 font-bold animate-pulse">
                        {t('notification_dispatch_hub.active_alerts_count', { count: activeNotifications.length + activeBudgetAlerts.length + userBroadcasts.length })}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      {/* Budget alerts */}
                      {activeBudgetAlerts.map((node, nodeIdx) => {
                        const isWarning = node.type === 'warning';
                        const isDailySpendsAlert = node.isDailySpends || node.category?.toLowerCase().includes('daily') || node.budgetId?.toLowerCase().includes('daily');
                        const categoryName = node.category || '';
                        const displayName = isDailySpendsAlert 
                          ? t('notification_dispatch_hub.daily_spends_overview') 
                          : (t(`categories.${categoryName}`, { defaultValue: t(`subcategories.${categoryName}`, { defaultValue: categoryName }) }) as string);

                        return (
                          <div 
                            key={`logged-budget-alert-${node.id || nodeIdx}-${nodeIdx}`}
                            onClick={() => handleAlertClicked(node.budgetId)}
                            className={`p-3 bg-[#F8FAFC] dark:bg-neutral-800/40 border ${
                              isDailySpendsAlert || isWarning ? 'border-amber-300 bg-amber-500/5' : 'border-rose-300 bg-rose-500/5'
                            } rounded-xl flex items-center justify-between gap-3 shadow-xs cursor-pointer transition-all hover:bg-neutral-50 dark:hover:bg-neutral-800`}
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isDailySpendsAlert || isWarning ? 'bg-amber-100 text-amber-500 border border-amber-200/30' : 'bg-rose-100 text-rose-700 border border-rose-200/30'
                              }`}>
                                <AlertCircle size={15} />
                              </div>
                              <div className="flex flex-col min-w-0 text-left">
                                <span 
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "12px", fontWeight: 700 }}
                                  className={`leading-tight break-words ${
                                    isDailySpendsAlert || isWarning ? 'text-amber-600 font-bold' : 'text-rose-600 font-bold'
                                  }`}
                                >
                                  {displayName}
                                </span>
                                <span className="text-[12px] text-neutral-500 dark:text-neutral-400 mt-1 font-sans" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                                  {isDailySpendsAlert 
                                    ? t('notification_dispatch_hub.daily_warning_desc') 
                                    : (isWarning ? t('notification_dispatch_hub.warning_desc') : t('notification_dispatch_hub.critical_desc'))}
                                  <span className="font-sans" style={{ fontWeight: 700, color: '#000000' }}>
                                    {node.currency} {node.spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>{' '}
                                  {t('notification_dispatch_hub.of_total_budget')}{' '}
                                  <span className="font-sans" style={{ fontWeight: 700, color: '#000000' }}>
                                    {node.currency} {node.limit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </span>
                                <span className={`text-[12px] mt-0.5 font-sans font-normal ${
                                  isDailySpendsAlert || isWarning ? 'text-amber-500' : 'text-rose-500'
                                }`}>
                                  {t('notification_dispatch_hub.fired_label', { date: node.date, time: node.time })}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleClearBudgetAlert(node.id)}
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, backgroundColor: '#A6DDB1', color: '#1E293B' }}
                                className="h-[28px] px-2.5 rounded-lg text-[12px] transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0 active:scale-95 hover:opacity-90 border border-[#A6DDB1]/10 font-sans"
                              >
                                {t('notification_dispatch_hub.clear')}
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Checklist alarms */}
                      {userBroadcasts.map((noti, notiIdx) => (
                        <div 
                          key={`user-broadcast-${noti.id || notiIdx}-${notiIdx}`}
                          className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200/35 flex items-center justify-center shrink-0 text-emerald-700">
                              <Bell size={15} />
                            </div>
                            <div className="flex flex-col min-w-0 text-left">
                              <span 
                                className="text-neutral-900 font-bold leading-tight truncate"
                                style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "13px" }}
                              >
                                {noti.title || 'Platform Announcement'}
                              </span>
                              <span 
                                className="text-neutral-700 mt-0.5 leading-relaxed"
                                style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "12px", fontWeight: 400 }}
                              >
                                {noti.message || noti.body}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await updateDoc(doc(db, `users/${uid}/notifications`, noti.id), { isRead: true });
                              } catch (err) {
                                console.warn("Failed to mark notification read:", err);
                              }
                            }}
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            className="h-[28px] px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[12px] transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
                          >
                            <Check size={11} strokeWidth={3} /> {t('notification_dispatch_hub.clear')}
                          </button>
                        </div>
                      ))}

                      {activeNotifications.map((noti, notiIdx) => (
                        <div 
                          key={`logged-alert-${noti.id || notiIdx}-${notiIdx}`}
                          className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-rose-100 border border-rose-200/35 flex items-center justify-center shrink-0 text-rose-650">
                              <Bell size={15} />
                            </div>
                            <div className="flex flex-col min-w-0 text-left">
                              <span 
                                className="text-neutral-800 leading-tight truncate"
                                style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(12px, 2.8vw, 13px)", fontWeight: 405 }}
                              >
                                {noti.text}
                              </span>
                              <span className="text-[12px] text-neutral-500 mt-1" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                                {t('notification_dispatch_hub.fired_label', { date: noti.date, time: noti.time })}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleChecklist(noti.id)}
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            className="h-[28px] px-3 bg-neutral-100 hover:bg-neutral-200 border border-neutral-250 text-neutral-850 rounded-lg text-[12px] transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
                          >
                            <Check size={11} strokeWidth={3} /> {t('notification_dispatch_hub.clear')}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. SECTION: Reminders & Milestones */}
                <div className="flex flex-col gap-2">
                  <span 
                    className="text-[12px] font-bold text-[#A6DDB1] dark:text-emerald-700"
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  >
                    {t('notification_dispatch_hub.reminders_milestones')}
                  </span>

                  {allRemindersAndMilestones.length === 0 ? (
                    <div className="py-5 px-3 bg-neutral-50 rounded-xl border border-neutral-200/60 text-center flex flex-col items-center justify-center gap-1.5">
                      <TrendingUp size={18} className="text-[#A6DDB1] dark:text-emerald-600 opacity-80" />
                      <span className="text-[12px] text-neutral-500 leading-relaxed font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>{t('notification_dispatch_hub.no_active_milestones')}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {allRemindersAndMilestones.map((reminder, rIdx) => {
                        const isHighPriority = reminder.type === 'past-due' || reminder.type === 'overrun';
                        const isExpanded = !!expandedReminders[rIdx];
                        return (
                          <div 
                            key={`hub-reminder-${rIdx}`}
                            className={`p-3 rounded-xl border flex flex-col gap-1.5 shadow-xs leading-relaxed ${
                              isHighPriority 
                                ? 'bg-rose-50/50 border-rose-250' 
                                : 'bg-neutral-50 border-neutral-200'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span 
                                className={`text-[9.5px] font-bold ${
                                  isHighPriority ? 'text-rose-600' : 'text-[#A6DDB1] dark:text-emerald-700'
                                }`}
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                              >
                                {reminder.title}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedReminders(prev => ({
                                    ...prev,
                                    [rIdx]: !prev[rIdx]
                                  }));
                                }}
                                className="w-6 h-6 rounded-md hover:bg-neutral-200/60 flex items-center justify-center text-neutral-500 transition-colors cursor-pointer shrink-0"
                                title={isExpanded ? "Hide full details" : "Show full reminder details"}
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            </div>
                            <p 
                              className={`text-neutral-600 mt-0.5 leading-relaxed font-normal ${
                                isExpanded ? '' : 'line-clamp-2'
                              }`}
                              style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(12px, 2.8vw, 13px)", fontWeight: 400 }}
                            >
                              {reminder.text}
                            </p>
                            {isExpanded && (
                              <div className="mt-2 pt-2 border-t border-neutral-200/60 flex flex-col gap-1.5 text-[11px] text-neutral-500 animate-fade-in">
                                {reminder.type && (
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-neutral-600">Reminder Type:</span>
                                    <span className="capitalize">{reminder.type}</span>
                                  </div>
                                )}
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-neutral-600">Status:</span>
                                  <span className="text-emerald-600 font-medium">Active & Monitored</span>
                                </div>
                                <div className="flex justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDismissReminder(reminder.id)}
                                    className="px-3 py-1.5 bg-neutral-200/80 hover:bg-rose-100 hover:text-rose-700 text-neutral-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                                  >
                                    <Trash2 size={12} />
                                    Dismiss for this month
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}                 {/* 3. SECTION: Financial Checklist */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span 
                      className="text-[12px] font-bold text-[#A6DDB1] dark:text-emerald-700"
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                    >
                      {t('notification_dispatch_hub.personal_checklist')}
                    </span>
                    <span className="text-[12px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-650 border border-neutral-200 font-bold">
                      {t('notification_dispatch_hub.checklist_pending', { count: pendingChecklistsCount })}
                    </span>
                  </div>

                  {/* Checklist entry list */}
                  <div className="flex flex-col gap-2">
                    {checklist
                      .filter(item => !item.notified && item.status !== 'completed' && !item.completed)
                      .map((item, idx) => {
                        const isScheduled = !!item.scheduledAt;
                        const itemId = item.id || `todo-${idx}`;
                        const isExpanded = !!expandedChecklists[itemId];
                        return (
                          <div 
                            key={`todo-${itemId}-${idx}`} 
                            className={`p-3 bg-neutral-50/60 border border-neutral-200/80 rounded-xl transition-all hover:bg-neutral-100/70 group/chk flex flex-col gap-1.5 ${
                              isExpanded ? 'bg-neutral-50' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleChecklist(item.id)}
                                className="flex items-center gap-2.5 text-left min-w-0 cursor-pointer flex-1"
                              >
                                <div className="shrink-0 text-neutral-400 hover:text-[#A6DDB1]">
                                  <Square size={16} className="text-neutral-400 hover:text-[#A6DDB1]" />
                                </div>
                                <span 
                                  style={{ 
                                    fontFamily: "'Google Sans', sans-serif", 
                                    fontSize: "clamp(12px, 2.8vw, 13px)",
                                    fontWeight: 400 
                                  }}
                                  className={`text-neutral-800 ${isExpanded ? '' : 'truncate'}`}
                                >
                                  {getChecklistText(item)}
                                </span>
                              </button>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedChecklists(prev => ({
                                      ...prev,
                                      [itemId]: !prev[itemId]
                                    }));
                                  }}
                                  className="w-6 h-6 rounded-md hover:bg-neutral-200/60 flex items-center justify-center text-neutral-500 transition-colors cursor-pointer shrink-0"
                                  title={isExpanded ? "Hide full details" : "Show full reminder details"}
                                >
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => handleDeleteChecklistItemWithConfirm(item.id)}
                                  className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-rose-600 opacity-0 group-hover/chk:opacity-100 transition-opacity cursor-pointer shrink-0"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {isScheduled && !isExpanded && (
                              <span className="text-[12px] text-[#A6DDB1]/80 dark:text-emerald-700 font-bold ml-6 mt-0.5 flex items-center gap-1">
                                <span>{t('notification_dispatch_hub.scheduled_at', { date: item.date, time: item.time })}</span>
                              </span>
                            )}

                            {isExpanded && (
                              <div className="mt-2 pt-2 border-t border-neutral-200/60 flex flex-col gap-1.5 text-[11px] text-neutral-500 animate-fade-in pl-6">
                                {isScheduled && (
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-neutral-600">Scheduled At:</span>
                                    <span className="text-emerald-600 font-medium">{item.date} at {item.time}</span>
                                  </div>
                                )}
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-neutral-600">Checklist Status:</span>
                                  <span className="text-emerald-600 font-medium">Pending Checklist Item</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>

                  {/* Quick Append form with Scheduling Picker */}
                  <form onSubmit={handleCreateChecklistItem} className="flex flex-col gap-2 mt-1" id="dispatch-chk-append-form">
                    <div className="flex gap-1.5">
                      <input 
                        type="text"
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                        placeholder={t('notification_dispatch_hub.append_quick_action')}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        className="flex-grow h-[38px] bg-white border border-neutral-250 rounded-xl px-3 text-xs text-neutral-800 placeholder-neutral-450 outline-none focus:border-[#A6DDB1] transition-colors leading-tight"
                      />
                      
                      <button
                        type="button"
                        onClick={handleToggleScheduler}
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                        className={`w-[38px] h-[38px] rounded-xl flex items-center justify-center border transition-all cursor-pointer ${showScheduler ? 'bg-[#A6DDB1]/20 border-[#A6DDB1] text-[#A6DDB1]' : 'bg-white border-neutral-250 text-neutral-450 hover:text-neutral-800 hover:border-neutral-300'}`}
                        title={t('notification_dispatch_hub.schedule_alarm')}
                      >
                        <Calendar size={15} />
                      </button>

                      <button
                        type="submit"
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                        className="w-[38px] h-[38px] rounded-xl bg-[#A6DDB1] text-neutral-900 flex items-center justify-center hover:brightness-105 active:scale-95 transition-all cursor-pointer shrink-0"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    {showScheduler && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="flex flex-col gap-2 p-3 bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden text-left"
                      >
                        <div className="flex items-center justify-between">
                          <span 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                            className="text-[12px] text-[#A6DDB1] dark:text-emerald-700 font-bold"
                          >
                            {t('notification_dispatch_hub.automated_dispatch_time')}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[7.5px] text-[#57606F] font-bold px-1">{t('notification_dispatch_hub.date')}</label>
                            <input 
                              type="date"
                              value={schedDate}
                              onChange={(e) => setSchedDate(e.target.value)}
                              required={showScheduler}
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                              className="w-full h-[32px] bg-white border border-neutral-200 rounded-lg px-2 text-[12px] text-neutral-800 outline-none focus:border-[#A6DDB1] transition-colors text-center font-sans select-none"
                            />
                          </div>
                          
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[7.5px] text-[#57606F] font-bold px-1">{t('notification_dispatch_hub.time')}</label>
                            <input 
                              type="time"
                              value={schedTime}
                              onChange={(e) => setSchedTime(e.target.value)}
                              required={showScheduler}
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                              className="w-full h-[32px] bg-white border border-neutral-200 rounded-lg px-2 text-[12px] text-neutral-800 outline-none focus:border-[#A6DDB1] transition-colors text-center font-sans select-none"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleTestNotification}
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                          className="mt-1 w-full h-[32px] bg-neutral-900 text-white rounded-lg text-[11px] hover:bg-neutral-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span>🔔 Test Device Notification Now</span>
                        </button>
                      </motion.div>
                    )}
                  </form>
                </div>

                {/* 4. SECTION: COMPLETED REMINDERS (COLLAPSIBLE ARCHIVAL LIST) */}
                {completedReminders.length > 0 && (
                  <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-neutral-150 text-left">
                    <button
                      type="button"
                      onClick={() => setIsCompletedExpanded(!isCompletedExpanded)}
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                      className="flex items-center justify-between w-full text-[12px] font-bold text-neutral-500 hover:text-neutral-800 transition-colors cursor-pointer outline-none"
                    >
                      <span className="flex items-center gap-1.5 font-sans" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
                        🗄️ {t('notification_dispatch_hub.completed_reminders')}
                      </span>
                      <span className="text-[12px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 font-bold flex items-center gap-1">
                        {t('notification_dispatch_hub.completed_count', { count: completedReminders.length })} {isCompletedExpanded ? '▲' : '▼'}
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isCompletedExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex flex-col gap-2 overflow-hidden mt-1"
                        >
                          <div className="flex flex-col gap-2">
                            {completedReminders.map((item, idx) => {
                              const isScheduled = !!item.scheduledAt;
                              return (
                                <motion.div 
                                  key={`completed-${item.id || 'fallback'}-${idx}`}
                                  layout
                                  initial={{ opacity: 0, y: -4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="flex items-center justify-between h-[50px] px-3 bg-neutral-50/50 border border-neutral-200/50 rounded-xl opacity-60 hover:opacity-100 transition-opacity group/comp"
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleToggleChecklist(item.id)}
                                    className="flex-1 flex items-center gap-2.5 text-left min-w-0 h-full cursor-pointer"
                                  >
                                    <div className="shrink-0 text-[#A6DDB1]">
                                      <CheckSquare size={16} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span 
                                        style={{ 
                                          fontFamily: "'Google Sans', sans-serif", 
                                          fontSize: "clamp(12px, 2.8vw, 13px)",
                                          fontWeight: 400,
                                          textDecoration: 'line-through' 
                                        }}
                                        className="truncate text-neutral-400 line-through"
                                      >
                                        {getChecklistText(item)}
                                      </span>
                                      {isScheduled && (
                                        <span className="text-[8px] text-neutral-400 font-bold mt-0.5 line-through decoration-neutral-300">
                                          {t('notification_dispatch_hub.was_scheduled', { date: item.date, time: item.time })}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                  
                                  <div className="flex items-center gap-1.5 shrink-0 select-none font-sans">
                                    {/* Uncheck / Restore button */}
                                    <button
                                      type="button"
                                      onClick={() => handleToggleChecklist(item.id)}
                                      title={t('notification_dispatch_hub.restore_tooltip')}
                                      className="px-2 h-7 rounded-md hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-[#A6DDB1] opacity-0 group-hover/comp:opacity-100 transition-opacity cursor-pointer text-[12px]"
                                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                    >
                                      {t('notification_dispatch_hub.restore')}
                                    </button>

                                    {/* Delete button */}
                                    <button 
                                      type="button"
                                      onClick={() => handleDeleteChecklistItemWithConfirm(item.id)}
                                      title={t('notification_dispatch_hub.remove_tooltip')}
                                      className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-405 hover:text-rose-500 opacity-0 group-hover/comp:opacity-100 transition-opacity cursor-pointer"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>


              
              {/* Dispatch body close */}
            </motion.div>
          </React.Fragment>
          )}
        </AnimatePresence>
      , document.body)}

      {/* Two-step Confirmation Safeguard Modal Modal Popup */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Dark modal background blur */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-black/80 backdrop-blur-xs"
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              className="bg-[#1E293B] border border-[#2F3542] rounded-2xl p-5 max-w-sm w-full shadow-2xl relative z-10 flex flex-col items-center text-center gap-4 text-white"
              id="dispatch-confirm-[safeguard]"
            >
              <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/25 shrink-0 text-rose-500">
                <AlertTriangle size={22} />
              </div>

              <div className="flex flex-col gap-1">
                <h4 
                  className="text-sm font-bold text-rose-400"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                >
                  {t('notification_dispatch_hub.confirm_proceeding')}
                </h4>
                <p 
                  className="text-xs text-neutral-300 mt-1 leading-relaxed"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                >
                  {confirmModal.message}
                </p>
              </div>

              <div className="flex items-center gap-2 w-full mt-1">
                <button
                  onClick={async () => {
                    const confirmFn = confirmModal.onConfirm;
                    await confirmFn();
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                  }}
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  className="flex-1 h-[38px] bg-rose-500 hover:bg-rose-600 transition-colors text-white text-[12px] rounded-xl hover:brightness-105 active:scale-95 cursor-pointer"
                >
                  {t('notification_dispatch_hub.proceed')}
                </button>
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  className="flex-1 h-[38px] bg-transparent hover:bg-neutral-800 transition-all border border-[#2F3542] text-neutral-300 text-[12px] rounded-xl cursor-pointer"
                >
                  {t('notification_dispatch_hub.cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reward & Gift Popup Modal */}
      <AnimatePresence>
        {activeRewardPopup && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveRewardPopup(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-xs"
            />
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              className="bg-white border border-neutral-200 rounded-3xl p-6 max-w-md w-full shadow-2xl relative z-10 flex flex-col items-center text-center gap-5 text-neutral-900"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm text-2xl">
                🎁
              </div>

              <div className="flex flex-col gap-2">
                <h3 
                  className="text-lg font-bold text-neutral-900"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                >
                  {activeRewardPopup.title}
                </h3>
                <p 
                  className="text-sm text-neutral-600 leading-relaxed px-2"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                >
                  {activeRewardPopup.message}
                </p>
              </div>

              <button
                type="button"
                onClick={async () => {
                  try {
                    await updateDoc(doc(db, `users/${uid}/notifications`, activeRewardPopup.id), { isRead: true });
                  } catch (err) {
                    console.warn("Failed to mark notification read:", err);
                  }
                  setActiveRewardPopup(null);
                }}
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                className="w-full h-[44px] bg-[#111c2d] hover:bg-black transition-colors text-white text-[13px] rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                Awesome, Claim Reward!
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <SalaryBreakdownVerificationModal
        isOpen={verifyingSb !== null}
        onClose={() => setVerifyingSb(null)}
        sb={verifyingSb}
        accounts={accounts}
        miniBudgets={miniBudgets}
        uid={uid}
        onTransactionApproved={onTransactionApproved}
      />

      <ConfirmRecurringTransactionModal
        isOpen={confirmingTx !== null}
        onClose={() => setConfirmingTx(null)}
        onConfirm={async () => {
          console.log("🟢 [DEBUG] ConfirmRecurringTransactionModal confirmed for tx:", confirmingTx);
          if (confirmingTx) {
            await handleApproveDraft(confirmingTx);
          }
        }}
        transaction={confirmingTx}
        accounts={accounts}
      />

    </React.Fragment>
  );
};
