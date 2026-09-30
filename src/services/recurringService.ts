// services/recurringService.ts
import { db } from '../firebase';
import { getCanonicalCategoryId } from './vantageAiContext';
import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  setDoc,
  updateDoc, 
  query, 
  where, 
  Timestamp, 
  runTransaction 
} from 'firebase/firestore';

export interface RecurringRule {
  id: string;
  userId: string;
  name: string;
  amount: number;
  category: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  nextDueDate: string; // YYYY-MM-DD
  autoRecord: boolean; // if false, requires manual confirmation
  sourceAccountId?: string;
  destinationAccountId?: string | null;
  notes?: string;
  emoji?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface PendingApproval {
  id?: string;
  ruleId: string;
  name: string;
  amount: number;
  category: string;
  dueDate: string; // YYYY-MM-DD
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: any;
  resolvedAt?: any;
  sourceAccountId?: string;
  destinationAccountId?: string | null;
}

export const commitTransaction = async (userId: string, rule: RecurringRule) => {
  const transRef = doc(collection(db, 'users', userId, 'transactions'));
  const categoryId = getCanonicalCategoryId(rule.category);
  await setDoc(transRef, {
    description: rule.name,
    amount: rule.amount,
    category: rule.category,
    categoryId,
    date: rule.nextDueDate,
    source: 'recurring',
    ruleId: rule.id,
    createdAt: Timestamp.now()
  });
  return transRef.id;
};

export const processRecurringTransactions = async (userId: string) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const recurringRef = collection(db, 'users', userId, 'recurring_rules');
  const q = query(recurringRef, where('nextDueDate', '<=', todayStr));
  const snapshot = await getDocs(q);

  for (const ruleDoc of snapshot.docs) {
    const rule = { id: ruleDoc.id, ...ruleDoc.data() } as RecurringRule;

    if (rule.autoRecord) {
      // Direct commit
      await commitTransaction(userId, rule);
    } else {
      // Create Pending Notification Hub Item
      const pendingRef = collection(db, 'users', userId, 'pending_approvals');
      
      // Ensure we don't duplicate pending requests for the same due date
      const existingQuery = query(
        pendingRef, 
        where('ruleId', '==', rule.id), 
        where('dueDate', '==', rule.nextDueDate)
      );
      const existing = await getDocs(existingQuery);

      if (existing.empty) {
        await addDoc(pendingRef, {
          ruleId: rule.id,
          name: rule.name,
          amount: rule.amount,
          category: rule.category,
          dueDate: rule.nextDueDate,
          status: 'pending', // 'pending' | 'confirmed' | 'rejected'
          createdAt: Timestamp.now()
        });
      }
    }

    // Advance the next due date WITHOUT deleting the recurring rule
    const nextDate = calculateNextDueDate(rule.nextDueDate, rule.frequency);
    await updateDoc(doc(db, 'users', userId, 'recurring_rules', rule.id), {
      nextDueDate: nextDate,
      updatedAt: Timestamp.now()
    });
  }
};

export const handleApprovalAction = async (
  userId: string, 
  approvalId: string, 
  action: 'confirm' | 'reject'
) => {
  const approvalRef = doc(db, 'users', userId, 'pending_approvals', approvalId);

  await runTransaction(db, async (tx) => {
    const approvalDoc = await tx.get(approvalRef);
    if (!approvalDoc.exists()) throw new Error("Approval record missing");

    const data = approvalDoc.data();
    if (data.status !== 'pending') return;

    if (action === 'confirm') {
      const transRef = doc(collection(db, 'users', userId, 'transactions'));
      const categoryId = getCanonicalCategoryId(data.category);
      tx.set(transRef, {
        description: data.name,
        amount: data.amount,
        category: data.category,
        categoryId,
        date: data.dueDate,
        source: 'recurring',
        ruleId: data.ruleId || null,
        createdAt: Timestamp.now()
      });
    }

    tx.update(approvalRef, {
      status: action === 'confirm' ? 'confirmed' : 'rejected',
      resolvedAt: Timestamp.now()
    });
  });
};

export function calculateNextDueDate(currentDateStr: string, frequency: string): string {
  const date = new Date(currentDateStr);
  if (frequency === 'daily') date.setDate(date.getDate() + 1);
  else if (frequency === 'weekly') date.setDate(date.getDate() + 7);
  else if (frequency === 'monthly') date.setMonth(date.getMonth() + 1);
  else if (frequency === 'yearly') date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().split('T')[0];
}
