import { Transaction } from '../components/Transactions';

export interface AccountTrend {
  direction: 'up' | 'down' | 'neutral';
  percentage: number;
  isNew?: boolean;
}

export const calculateAccountTrend = (
  accountId: string,
  currentBalance: number,
  transactions: any[],
  type?: string,
  loanDirection?: string,
  startingBalance: number = 0
): AccountTrend => {
  const isInvestment = type === 'investment' || type === 'Investment' || (type || '').toLowerCase() === 'investment';

  // 1. Isolated Investment Logic
  if (isInvestment) {
    const invested = Number(startingBalance || 0);
    const balance = Number(currentBalance || 0);

    if (invested <= 0) {
      return { direction: 'neutral', percentage: 0, isNew: false };
    }

    const netGain = balance - invested;
    const pct = (netGain / invested) * 100;

    if (Math.abs(pct) < 0.05) {
      return { direction: 'neutral', percentage: 0.0, isNew: false };
    }

    return {
      direction: pct > 0 ? 'up' : 'down',
      percentage: parseFloat(Math.abs(pct).toFixed(1)),
      isNew: false
    };
  }

  // 2. Standard Bank / Cash / Credit / Loan / Mortgage Logic
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const accountTxs = (transactions || []).filter(tx => 
    (tx.accountId === accountId || tx.toAccountId === accountId) &&
    tx.status !== 'draft' &&
    (tx.status as any) !== 'pending' &&
    (tx.status as any) !== 'upcoming' &&
    (tx.status as any) !== 'pending_confirmation' &&
    !tx.isUpcomingSalaryAllocation &&
    (tx as any).interval === undefined
  );

  const isLiability = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(type || '');

  const monthDelta = accountTxs.reduce((sum, tx) => {
    const txDate = new Date(tx.date);
    if (txDate >= startOfMonth && txDate <= todayEnd) {
      const amount = Number(tx.amount || 0);
      if (tx.type === 'transfer') {
        const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === accountId && !tx.transferSide);
        const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === accountId && !tx.transferSide && !tx.hasMirror);

        if (isReceiver && (tx.transferSide === 'receiver' ? String(tx.accountId) === accountId : String(tx.toAccountId) === accountId)) {
          return sum + amount;
        } else if (isSender && String(tx.accountId) === accountId) {
          return sum - amount;
        }
      } else if (tx.type === 'income' || tx.type === 'Inflow') {
        if (String(tx.accountId) === accountId) return sum + amount;
      } else if (tx.type === 'expense' || tx.type === 'Outflow') {
        if (String(tx.accountId) === accountId) return sum - amount;
      }
    }
    return sum;
  }, 0);

  let balanceThen = currentBalance - monthDelta;

  if ((balanceThen <= 0 || balanceThen < 50) && startingBalance && startingBalance > 0) {
    balanceThen = startingBalance;
  }

  if (accountTxs.length === 0 && (!startingBalance || startingBalance === 0)) {
    return { percentage: 0, direction: 'neutral', isNew: true };
  }

  if (balanceThen === 0) {
    const dir = isLiability ? (currentBalance > 0 ? 'down' : 'up') : (currentBalance > 0 ? 'up' : 'down');
    return { percentage: currentBalance !== 0 ? 100 : 0, direction: currentBalance === 0 ? 'neutral' : dir, isNew: false };
  }

  const percentage = (monthDelta / Math.abs(balanceThen)) * 100;
  let direction: 'up' | 'down' | 'neutral' = 'neutral';
  if (!isNaN(percentage) && Math.abs(percentage) > 0.05) {
    direction = percentage > 0 ? 'up' : 'down';
  }

  return {
    percentage: isNaN(percentage) ? 0 : parseFloat(Math.abs(percentage).toFixed(1)),
    direction,
    isNew: false
  };
};

export const calculateAccountBalances = (accounts: any[], transactions: any[]): Record<string, number> => {
  const balances: Record<string, number> = {};
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  (accounts || []).forEach(acc => {
    let total = Number(acc.startingBalance || 0);

    const relevantTxs = (transactions || []).filter(tx => 
      tx.status !== 'draft' && 
      (tx.accountId === acc.id || tx.toAccountId === acc.id) &&
      new Date(tx.date) <= todayEnd
    );

    relevantTxs.forEach(tx => {
      const amount = Number(tx.amount || 0);
      if (tx.type === 'transfer') {
        if (tx.toAccountId === acc.id) total += amount;
        if (tx.accountId === acc.id) total -= amount;
      } else if (tx.type === 'income' || tx.type === 'Inflow') {
        if (tx.accountId === acc.id) total += amount;
      } else if (tx.type === 'expense' || tx.type === 'Outflow') {
        if (tx.accountId === acc.id) total -= amount;
      }
    });

    balances[acc.id] = total;
  });

  return balances;
};

export const calculateAggregateTrend = (
  selectedAccIds: Set<string>,
  accounts: any[],
  transactions: Transaction[]
): AccountTrend => {
  if (selectedAccIds.size === 0) return { percentage: 0, direction: 'neutral', isNew: true };

  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const balances = calculateAccountBalances(accounts, transactions);
  const balanceNow = accounts
    .filter(acc => selectedAccIds.has(acc.id))
    .reduce((sum, acc) => {
      const bal = balances[acc.id] || 0;
      return sum + bal;
    }, 0);

  let balanceThen = 0;
  let totalOrganicDelta = 0;

  const selectedAccounts = accounts.filter(acc => selectedAccIds.has(acc.id));
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  selectedAccounts.forEach(acc => {
    const currentAccBal = balances[acc.id] || 0;
    const totalDelta = transactions.filter(tx => 
      (tx.status as any) !== 'draft' &&
      (tx.status as any) !== 'pending' &&
      (tx.status as any) !== 'upcoming' &&
      (tx.status as any) !== 'pending_confirmation' &&
      !tx.isUpcomingSalaryAllocation &&
      (tx as any).interval === undefined &&
      (tx.accountId === acc.id || tx.toAccountId === acc.id) &&
      new Date(tx.date) > thirtyDaysAgo &&
      new Date(tx.date) <= todayEnd
    ).reduce((sum, tx) => {
      const amount = tx.amount || 0;
      if (tx.type === 'transfer') {
        const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === acc.id && !tx.transferSide);
        const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === acc.id && !tx.transferSide && !tx.hasMirror);

        if (isReceiver && (tx.transferSide === 'receiver' ? String(tx.accountId) === acc.id : String(tx.toAccountId) === acc.id)) {
          return sum + amount; 
        } else if (isSender && String(tx.accountId) === acc.id) {
          return sum - amount;
        }
      } else if (tx.type === 'income' || tx.type === 'Inflow') {
        if (String(tx.accountId) === acc.id) {
          return sum + amount;
        }
      } else if (tx.type === 'expense' || tx.type === 'Outflow') {
        if (String(tx.accountId) === acc.id) {
          return sum - amount;
        }
      }
      return sum;
    }, 0);

    const organicDelta = transactions.filter(tx => 
      (tx.status as any) !== 'draft' &&
      (tx.status as any) !== 'pending' &&
      (tx.status as any) !== 'upcoming' &&
      (tx.status as any) !== 'pending_confirmation' &&
      !tx.isUpcomingSalaryAllocation &&
      (tx as any).interval === undefined &&
      tx.type !== 'transfer' &&
      (tx.accountId === acc.id || tx.toAccountId === acc.id) &&
      new Date(tx.date) > thirtyDaysAgo &&
      new Date(tx.date) <= todayEnd
    ).reduce((sum, tx) => {
      const amount = tx.amount || 0;
      if (tx.type === 'income' || tx.type === 'Inflow') {
        if (String(tx.accountId) === acc.id) {
           return sum + amount;
        }
      } else if (tx.type === 'expense' || tx.type === 'Outflow') {
        if (String(tx.accountId) === acc.id) {
           return sum - amount;
        }
      }
      return sum;
    }, 0);
    
    const pastAccBal = (currentAccBal - totalDelta);
    balanceThen += pastAccBal;
    totalOrganicDelta += organicDelta;
  });

  if (transactions.length === 0) {
    return { percentage: 0, direction: 'neutral', isNew: true };
  }

  if (balanceThen === 0) {
    return { percentage: balanceNow !== 0 ? 100 : 0, direction: balanceNow > 0 ? 'up' : balanceNow < 0 ? 'down' : 'neutral', isNew: false };
  }

  const percentage = balanceThen !== 0 ? (totalOrganicDelta / Math.abs(balanceThen)) * 100 : (totalOrganicDelta !== 0 ? 100 : 0);

  return {
    percentage: isNaN(percentage) ? 0 : parseFloat(percentage.toFixed(1)),
    direction: percentage > 0.05 ? 'up' : percentage < -0.05 ? 'down' : 'neutral',
    isNew: false
  };
};

export const getAccountEffectiveStartingBalance = (account: any, transactions: any[] = []): number => {
  const accId = account.id || account.accountId;
  const directStart = Math.abs(Number(account.startingBalance || account.initialStartingBalance || account.principleAmount || 0));
  if (directStart > 0) return directStart;

  const startTx = transactions.find(tx =>
    (tx.accountId === accId || tx.toAccountId === accId || tx.debtId === accId) &&
    (tx.subcategory === 'starting_balance' || tx.subcategory === 'Starting Balance' || tx.notes === 'Initial Balance Setup' || tx.notes === 'Starting Balance')
  );
  if (startTx && Number(startTx.amount) !== 0) {
    return Math.abs(Number(startTx.amount));
  }

  const absCurr = Math.abs(Number(account.currentBalance || 0));
  const paidToDate = transactions
    .filter(tx => tx.status !== 'draft' && (tx.accountId === accId || tx.toAccountId === accId || tx.debtId === accId))
    .reduce((sum, tx) => {
      const isRepayment = (tx.type === 'transfer' && tx.toAccountId === accId) || 
                          (tx.type === 'income') || 
                          (tx.type === 'Inflow') ||
                          (tx.category === 'Debt' && tx.type === 'expense');
      if (isRepayment) {
        return sum + Math.abs(Number(tx.amount || 0));
      }
      return sum;
    }, 0);

  if (paidToDate > 0) {
    return absCurr + paidToDate;
  }

  return absCurr > 0 ? absCurr : 0;
};
