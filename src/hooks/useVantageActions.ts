import { collection, addDoc, updateDoc, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { deleteUser } from 'firebase/auth';

export function useVantageActions(uid?: string) {
  const getUid = () => {
    if (!uid) {
      throw new Error("Vantage identity verification missing. Try logging in again.");
    }
    return uid;
  };

  const createAccount = async (accountData: any) => {
    const userId = getUid();
    const typeLower = (accountData.type || '').toLowerCase();
    
    const initialFunds = Number(accountData.initialStartingBalance ?? accountData.startingBalance ?? 0);

    const accColRef = collection(db, 'users', userId, 'accounts');
    
    // Rule 17: Zero-Sum Initialization
    const accountDoc = {
      ...accountData,
      startingBalance: 0,
      currentBalance: 0,
      createdAt: new Date().toISOString()
    };
    
    const newDocRef = await addDoc(accColRef, accountDoc);
    
    // Rule 17: Generate starting balance transaction
    if (initialFunds !== 0) {
      const txColRef = collection(db, 'users', userId, 'transactions');
      await addDoc(txColRef, {
        userId,
        accountId: newDocRef.id,
        amount: Math.abs(initialFunds),
        type: initialFunds > 0 ? 'income' : 'expense',
        category: 'Others',
        subcategory: 'Starting Balance',
        notes: 'Initial Balance Setup',
        date: new Date().toISOString().split('T')[0],
        status: 'confirmed',
        createdAt: new Date().toISOString()
      });
      
      // Sync balance to account document
      const accountRef = doc(db, 'users', userId, 'accounts', newDocRef.id);
      await updateDoc(accountRef, {
        currentBalance: initialFunds
      });
    }

    return { id: newDocRef.id, ...accountDoc, currentBalance: initialFunds };
  };

  const updateTransaction = async (transactionId: string, updates: any) => {
    const userId = getUid();
    const transactionRef = doc(db, 'users', userId, 'transactions', transactionId);
    await updateDoc(transactionRef, updates);
  };

  const deleteTransaction = async (transactionId: string) => {
    const userId = getUid();
    const transactionRef = doc(db, 'users', userId, 'transactions', transactionId);
    await deleteDoc(transactionRef);
  };

  const deleteProfile = async () => {
    const userId = getUid();

    // 1. Primary: Server-side account wipe (uses Admin Auth & Admin Firestore, bypassing client token age constraints)
    let serverSuccess = false;
    try {
      if (auth.currentUser) {
        const idToken = await auth.currentUser.getIdToken(true);
        const response = await fetch('/api/delete-account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          }
        });
        if (response.ok) {
          serverSuccess = true;
        }
      }
    } catch (err) {
      console.warn("Server-side delete-account request error, attempting client-side fallback wipe:", err);
    }

    // 2. Secondary: Client-side fallback wipe for all known user subcollections
    const subcollections = [
      'transactions',
      'accounts',
      'miniBudgets',
      'recurringTransactions',
      'goals',
      'milestones',
      'debtMilestones',
      'coolOffItems',
      'homescreenWidgets',
      'custom_categories',
      'salaryBreakdowns',
      'userLogins',
      'shoppingList',
      'checklist'
    ];

    for (const sub of subcollections) {
      try {
        const colRef = collection(db, 'users', userId, sub);
        const snap = await getDocs(colRef);
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
        }
      } catch (e) {
        console.warn(`Error wiping subcollection ${sub}:`, e);
      }
    }

    try {
      const userRef = doc(db, 'users', userId);
      await deleteDoc(userRef);
    } catch (e) {
      console.warn("Error wiping root user document:", e);
    }

    // 3. Client Auth deletion attempt (safe ignore if already deleted or requires re-authentication)
    if (auth.currentUser && auth.currentUser.uid === userId) {
      try {
        await deleteUser(auth.currentUser);
      } catch (authErr: any) {
        console.warn("Client deleteUser notice (account may already be deleted on server or requires signout):", authErr);
      }
    }

    // 4. Force local signout and session purge
    try {
      localStorage.clear();
      sessionStorage.clear();
      await auth.signOut();
    } catch (soErr) {
      console.warn("Signout error during profile deletion:", soErr);
    }
  };

  return {
    createAccount,
    updateTransaction,
    deleteTransaction,
    deleteProfile
  };
}
