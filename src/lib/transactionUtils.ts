import { MASTER_CATEGORIES } from './constants';

export const isIgnoredForUnallocated = (tx: any, allBudgets: any[] = []) => {
  if (!tx) return true;

  const numericAmount = Number(tx.amount || 0);
  const category = (tx.category || '').toLowerCase().trim();
  const subcategory = (tx.subcategory || tx.subCategory || '').toLowerCase().trim();
  const type = (tx.type || '').toLowerCase().trim();
  const notes = (tx.notes || '').toLowerCase().trim();

  // 1. ABSOLUTE GUARD: Any positive amount or zero is an inflow, income, refund, or starting credit.
  if (numericAmount >= 0) return true;

  // 2. EXPLICITLY IGNORE OPENING / STARTING BALANCES
  if (
    category.includes('opening') ||
    subcategory.includes('opening') ||
    category.includes('starting') ||
    subcategory.includes('starting') ||
    category.includes('balance') ||
    subcategory.includes('balance') ||
    category === 'starting_balance' ||
    category === 'opening_balance' ||
    category === 'starting balance' ||
    category === 'opening balance' ||
    subcategory === 'opening balances' ||
    subcategory === 'opening balance' ||
    subcategory === 'starting balance' ||
    subcategory === 'starting balances'
  ) {
    return true;
  }

  // 3. EXPLICITLY IGNORE INTER-ACCOUNT TRANSFERS & TRANSFERS
  if (
    type === 'transfer' || 
    type === 'transfers' || 
    tx.transferSide || 
    tx.toAccountId || 
    category === 'transfer' || 
    category === 'transfers' ||
    subcategory.includes('inter-account') ||
    subcategory.includes('inter account') ||
    subcategory.includes('transfer') ||
    notes.includes('transfer')
  ) {
    return true;
  }

  // 4. EXPLICITLY IGNORE INCOME & INVESTMENTS
  if (
    type === 'income' ||
    type === 'deposit' ||
    type === 'inflow' ||
    type === 'credit' ||
    category === 'income' || 
    category === 'investments' || 
    category === 'investment'
  ) {
    return true;
  }

  // 5. STRICT EXPENSE TYPE FILTER (Reject anything that isn't an explicit expense/outflow/debit)
  if (type && type !== 'expense' && type !== 'outflow' && type !== 'debit') {
    return true;
  }

  return false;
};

export const isTxMatchingBudget = (tx: any, budget: any) => {
  if (!tx) return false;
  const txCat = (tx.category || '').toLowerCase().trim();
  const txSub = (tx.subcategory || tx.subCategory || '').toLowerCase().trim();

  if (budget.mappedCategories && budget.mappedCategories.length > 0) {
    const mapped = budget.mappedCategories.map((c: string) => (c || '').toLowerCase().trim());
    if (mapped.includes(txCat)) {
      if (budget.mappedSubCategories && budget.mappedSubCategories.length > 0) {
        const mappedSubs = budget.mappedSubCategories.map((s: string) => (s || '').toLowerCase().trim());
        return !txSub || mappedSubs.includes(txSub);
      }
      return true;
    }
  }

  const budgetCat = (budget.category || budget.categoryTitle || budget.title || '').toLowerCase().trim();
  if (budgetCat && txCat === budgetCat) {
    const budgetSub = (budget.subcategory || '').toLowerCase().trim();
    if (!budgetSub || budgetSub === 'all' || budgetSub === '') {
      return true;
    }
    return txSub === budgetSub;
  }

  return false;
};

export const isTxMatchingBudgetOrUnallocated = (tx: any, budget: any, allBudgets: any[]) => {
  if (!tx) return false;
  const isUnallocated = budget.id === 'unallocated-expenses' || budget.isUnallocated;
  
  if (isUnallocated) {
    if (tx.status === 'draft' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
    
    // Pass through our strict ignore filter
    if (isIgnoredForUnallocated(tx, allBudgets)) return false;
    
    // Ensure it is not accounted for in any other explicit budget envelope
    return !isTxCalculatedInOtherBudgets(tx, allBudgets);
  }
  
  return isTxMatchingBudget(tx, budget);
};

export const isTxCalculatedInOtherBudgets = (tx: any, allBudgets: any[]) => {
  if (!tx) return false;
  return allBudgets.some(b => {
    if (b.isUnallocated || b.id === 'unallocated-expenses') return false;
    return isTxMatchingBudget(tx, b);
  });
};

export const getUnallocatedCategoriesAndSubcategories = (allBudgets: any[]) => {
  const coveredCategories = new Set<string>();
  const coveredSubcategories = new Set<string>();

  allBudgets.forEach(b => {
    if (b.isUnallocated || b.id === 'unallocated-expenses') return;
    if (b.category) coveredCategories.add(b.category.toLowerCase().trim());
    if (b.subcategory) coveredSubcategories.add(b.subcategory.toLowerCase().trim());
    if (b.mappedCategories) {
      b.mappedCategories.forEach((c: string) => coveredCategories.add(c.toLowerCase().trim()));
    }
  });

  const allCategories: string[] = [];
  const allSubCategories: string[] = [];

  MASTER_CATEGORIES.forEach(cat => {
    allCategories.push(cat.name);
    cat.subcategories.forEach(sub => {
      allSubCategories.push(sub);
    });
  });

  return { 
    coveredCategories, 
    coveredSubcategories,
    mappedCategories: allCategories,
    mappedSubCategories: allSubCategories
  };
};

export const calculateUnallocatedExpenses = (transactions: any[], allBudgets: any[], currentPeriod?: string, payday: number = 1) => {
  const monthStr = currentPeriod || new Date().toISOString().substring(0, 7);
  
  let startStr: string;
  let endStr: string;

  if (currentPeriod && currentPeriod.includes('-')) {
    const [year, month] = currentPeriod.split('-').map(Number);
    const startDate = new Date(year, month - 1, payday);
    const endDate = new Date(year, month, payday - 1, 23, 59, 59);
    startStr = startDate.toLocaleDateString('en-CA');
    endStr = endDate.toLocaleDateString('en-CA');
  } else {
    startStr = `${monthStr}-01`;
    endStr = `${monthStr}-31`;
  }

  const totalSpendings = transactions
    .filter(tx => {
      if (!tx.date) return false;
      const isInRange = currentPeriod ? (tx.date >= startStr && tx.date <= endStr) : tx.date.startsWith(monthStr);
      if (!isInRange) return false;
      if (tx.status === 'draft' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
      return !isIgnoredForUnallocated(tx, allBudgets);
    })
    .reduce((sum, tx) => sum + Math.abs(getTransactionEffectiveAmount(tx)), 0);

  const configuredBudgets = (allBudgets || []).filter(b => b.id !== 'unallocated-expenses' && !b.isUnallocated);
  const totalConfiguredSpent = configuredBudgets.reduce((sum, b) => {
    const bSpent = transactions
      .filter(tx => {
        if (!tx.date) return false;
        const isInRange = currentPeriod ? (tx.date >= startStr && tx.date <= endStr) : tx.date.startsWith(monthStr);
        if (!isInRange) return false;
        return isTxMatchingBudget(tx, b);
      })
      .reduce((s, tx) => s + Math.abs(getTransactionEffectiveAmount(tx)), 0);
    return sum + bSpent;
  }, 0);

  return Math.max(0, totalSpendings - totalConfiguredSpent);
};

export const getTransactionEffectiveAmount = (tx: any) => {
  if (!tx) return 0;
  const rawAmount = Number(tx.amount || 0);

  // 1. Check explicit installmentAmount
  if (tx.installmentAmount !== undefined && tx.installmentAmount !== null) {
    const instAmt = Number(tx.installmentAmount);
    if (!isNaN(instAmt) && instAmt > 0) {
      return rawAmount < 0 ? -Math.abs(instAmt) : Math.abs(instAmt);
    }
  }

  // 2. Check installmentsTotal and totalAmount
  if (tx.installmentsTotal && Number(tx.installmentsTotal) > 1) {
    const total = tx.totalAmount !== undefined ? Number(tx.totalAmount) : Math.abs(rawAmount);
    const count = Number(tx.installmentsTotal);
    const perInst = total / count;
    return rawAmount < 0 ? -Math.abs(perInst) : Math.abs(perInst);
  }

  // 3. Check notes for split pattern e.g. "(Split into 24 installments)" or "installments"
  if (tx.notes && typeof tx.notes === 'string') {
    const match = tx.notes.match(/split into (\d+) installments/i) || tx.notes.match(/(\d+)\s*installments/i);
    if (match && match[1]) {
      const count = Number(match[1]);
      if (count > 1) {
        const perInst = Math.abs(rawAmount) / count;
        return rawAmount < 0 ? -Math.abs(perInst) : Math.abs(perInst);
      }
    }
  }

  return rawAmount;
};


