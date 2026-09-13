import { 
  collection, doc, getDoc, getDocs, setDoc, writeBatch, serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { formatLabel } from './stringUtils';

export const getCurrentPeriodYearMonth = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export const autoRolloverSalaryBreakdowns = async (uid: string): Promise<boolean> => {
  if (!uid) return false;
  try {
    const currentYearMonth = getCurrentPeriodYearMonth();
    
    // Check if breakdown for current month exists
    const currentSbRef = doc(db, `users/${uid}/salaryBreakdowns/${currentYearMonth}`);
    const currentSbSnap = await getDoc(currentSbRef);

    if (currentSbSnap.exists()) {
      return false; // Already exists
    }

    // Query existing breakdowns
    const sbColl = collection(db, `users/${uid}/salaryBreakdowns`);
    const sbSnap = await getDocs(sbColl);

    if (sbSnap.empty) {
      return false;
    }

    const previousDocs = sbSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .filter(d => d.id < currentYearMonth && d.isBreakdownConfigured !== false)
      .sort((a, b) => b.id.localeCompare(a.id));

    if (previousDocs.length === 0) {
      return false;
    }

    const mostRecent = previousDocs[0];
    const batch = writeBatch(db);

    // 1. Clone breakdown parameters into current month
    batch.set(currentSbRef, {
      baseSalary: mostRecent.baseSalary || 0,
      baseSalaryInput: mostRecent.baseSalaryInput || 0,
      payday: mostRecent.payday || 28,
      allocations: mostRecent.allocations || {},
      selectedIncomes: mostRecent.selectedIncomes || [],
      activeEnvelopes: mostRecent.activeEnvelopes || [],
      customAuxiliaries: mostRecent.customAuxiliaries || [],
      selectedDbRecurringIncomes: mostRecent.selectedDbRecurringIncomes || [],
      allAvailableEnvelopesCatalog: mostRecent.allAvailableEnvelopesCatalog || [],
      currency: mostRecent.currency || 'AED',
      isConfirmed: false,
      isBreakdownConfigured: true,
      confirmedAllocations: {},
      tier1Approved: false,
      yearMonth: currentYearMonth,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    // 2. Clone corresponding miniBudgets for current month
    const allocations = mostRecent.allocations || {};
    const catalog = mostRecent.allAvailableEnvelopesCatalog || [];

    for (const [envelopeKey, amount] of Object.entries(allocations)) {
      if (Number(amount) > 0) {
        let parent = envelopeKey;
        let leaf = 'General';

        if (envelopeKey.includes('__')) {
          const parts = envelopeKey.split('__');
          parent = parts[0];
          leaf = parts[1] || 'General';
        }

        const formattedCategory = parent.replace(/_/g, ' ');
        const formattedSubcategory = leaf.replace(/_/g, ' ');
        const categoryTitle = `${formatLabel(formattedCategory)} > ${formatLabel(formattedSubcategory)}`;

        const envelopeInfo = catalog.find((e: any) => e.key === envelopeKey);
        const nature = envelopeInfo?.nature || 'Want';
        const categoryGroup = nature.toLowerCase() === 'need' ? 'needs' : 
                            nature.toLowerCase() === 'saving' ? 'savings' : 'wants';

        const deterministicId = `${currentYearMonth}_${envelopeKey.replace(/\s+/g, '_').toLowerCase()}`;
        const budRef = doc(db, `users/${uid}/miniBudgets`, deterministicId);

        batch.set(budRef, {
          userId: uid,
          categoryTitle: categoryTitle,
          category: formatLabel(formattedCategory),
          subcategory: formatLabel(formattedSubcategory),
          allocatedAmount: Number(amount),
          spentAmount: 0,
          currency: mostRecent.currency || 'AED',
          period: currentYearMonth,
          categoryGroup: categoryGroup,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    }

    await batch.commit();
    console.log(`Successfully auto-rolled over salary breakdown from ${mostRecent.id} to ${currentYearMonth}`);
    return true;
  } catch (err) {
    console.warn("Auto rollover salary breakdown failed/deferred:", err);
    return false;
  }
};
