import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { normalizeCategory, parseLocalDate } from '../services/vantageAiContext';
import { useAuth } from '../context/AuthContext';

export interface Budget {
  id: string;
  category: string;
  allocatedAmount: number;
}

export interface BudgetStatus extends Budget {
  spent: number;
  remaining: number;
  percentageUsed: number;
}

export const useBudgetsWithSpending = (userId: string, currentMonth: Date) => {
  const { user, authReady } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!authReady || (!userId && !user?.uid)) return;
    const targetUid = userId || user?.uid;
    if (!targetUid) return;

    // 1. Listen to Budgets
    const budgetsQuery = collection(db, 'users', targetUid, 'budgets');
    const unsubBudgets = onSnapshot(budgetsQuery, (snapshot) => {
      setBudgets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Budget)));
    });

    // 2. Listen to Current Month's Transactions
    const transQuery = collection(db, 'users', targetUid, 'transactions');
    const unsubTrans = onSnapshot(transQuery, (snapshot) => {
      const transList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(transList);
    });

    return () => {
      unsubBudgets();
      unsubTrans();
    };
  }, [userId, user, authReady, currentMonth]);

  const budgetStatuses: BudgetStatus[] = useMemo(() => {
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);

    // Filter transactions to current month
    const monthlyTransactions = transactions.filter((t) => {
      const date = parseLocalDate(t.date);
      return date >= startOfMonth && date <= endOfMonth;
    });

    // Aggregate spending by normalized category
    const spendingMap: Record<string, number> = {};
    for (const t of monthlyTransactions) {
      const normCat = normalizeCategory(t.category).toLowerCase();
      const amount = Number(t.amount) || 0;
      spendingMap[normCat] = (spendingMap[normCat] || 0) + amount;
    }

    return budgets.map((b) => {
      const normBudgetCat = normalizeCategory(b.category).toLowerCase();
      const spent = spendingMap[normBudgetCat] || 0;
      const allocated = Number(b.allocatedAmount) || 0;
      const remaining = allocated - spent;
      const percentageUsed = allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : 0;

      return {
        ...b,
        spent,
        remaining,
        percentageUsed
      };
    });
  }, [budgets, transactions, currentMonth]);

  return budgetStatuses;
};

export default useBudgetsWithSpending;
