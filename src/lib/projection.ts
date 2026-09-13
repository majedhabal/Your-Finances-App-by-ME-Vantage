import { Transaction } from '../components/Transactions';

export function projectRecurringTransactions(
  rules: any[],
  existingTransactions: any[],
  horizonDays: number = 90
): Transaction[] {
  const projected: Transaction[] = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Set end horizon date
  const endLimitDate = new Date();
  endLimitDate.setDate(endLimitDate.getDate() + horizonDays);

  // Set up lookup of existing transactions to prevent duplicates
  const existingSet = new Set<string>();
  existingTransactions.forEach(tx => {
    const rId = tx.recurringId || tx.protocolId;
    if (rId && tx.date) {
      existingSet.add(`${rId}_${tx.date}`);
      existingSet.add(`${rId}_${tx.date.substring(0, 7)}`);
    }
  });

  rules.forEach(rule => {
    // Only process active rules
    if (rule.isActive === false) return;

    const freq = (rule.recurrency || rule.frequency || 'monthly').toString().toLowerCase();
    const interval = Number(rule.interval) || 1;
    const selectedDayOption = rule.dayOption || 'sameDate';
    const currentStart = rule.nextExecutionDate || rule.nextGenerationDate || rule.lastGeneratedDate || todayStr;

    if (!currentStart) return;

    let dateStrStart = currentStart;
    if (typeof currentStart.toDate === 'function') {
      dateStrStart = currentStart.toDate().toISOString().split('T')[0];
    } else if (currentStart instanceof Date) {
      dateStrStart = currentStart.toISOString().split('T')[0];
    } else if (typeof currentStart === 'string' && currentStart.includes('T')) {
      dateStrStart = currentStart.split('T')[0];
    }

    const [year, month, day] = dateStrStart.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return;

    let d = new Date(year, month - 1, day, 12, 0, 0);
    const originalDay = d.getDate();
    const originalWeekday = d.getDay();

    // Fast-forward d if it's far in the past to avoid excessive iteration
    const todayDate = new Date(todayStr + 'T12:00:00');
    if (d < todayDate) {
      if (freq === 'daily') {
        const diffDays = Math.floor((todayDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        const steps = Math.floor(diffDays / interval);
        if (steps > 0) {
          d.setDate(d.getDate() + (steps * interval));
        }
      } else if (freq === 'weekly') {
        const diffDays = Math.floor((todayDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        const steps = Math.floor(diffDays / (interval * 7));
        if (steps > 0) {
          d.setDate(d.getDate() + (steps * interval * 7));
        }
      } else if (freq === 'monthly') {
        const diffMonths = (todayDate.getFullYear() - d.getFullYear()) * 12 + (todayDate.getMonth() - d.getMonth());
        const steps = Math.floor(diffMonths / interval);
        if (steps > 0) {
          d.setMonth(d.getMonth() + (steps * interval));
        }
      }
    }

    let loopCount = 0;
    while (d <= endLimitDate && loopCount < 300) {
      loopCount++;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      // Only project into the future (>= todayStr)
      if (dateStr >= todayStr) {
        const dupKeyExact = `${rule.id}_${dateStr}`;
        const dupKeyMonth = `${rule.id}_${dateStr.substring(0, 7)}`;
        const isDuplicate = (freq === 'daily' || freq === 'weekly')
          ? existingSet.has(dupKeyExact)
          : (existingSet.has(dupKeyMonth) || existingSet.has(dupKeyExact));

        if (!isDuplicate) {
          projected.push({
            id: `proj_${rule.id}_${dateStr}`,
            amount: Number(rule.amount) || 0,
            type: rule.transactionType || rule.type || 'expense',
            accountId: rule.sourceAccountId || rule.accountId,
            category: rule.category || 'Other',
            subcategory: rule.subcategory || rule.subCategory || '',
            notes: rule.title || rule.notes || 'Recurring Transaction',
            date: dateStr,
            status: 'draft',
            recurringId: rule.id,
            emoji: rule.emoji || ((rule.transactionType || rule.type) === 'income' ? '💰' : '💸'),
            isUpcoming: true
          });
        }
      }

      // Move d to next recurrence occurrence
      if (freq === 'daily') {
        d.setDate(d.getDate() + interval);
      } else if (freq === 'weekly') {
        d.setDate(d.getDate() + (interval * 7));
      } else if (freq === 'monthly') {
        if (selectedDayOption === 'sameDate') {
          d.setMonth(d.getMonth() + interval);
          if (d.getDate() < originalDay) {
            d.setDate(0);
          }
        } else {
          // sameDay: Find the same weekday in the target month
          const targetMonth = d.getMonth() + interval;
          d.setMonth(targetMonth);
          const diff = originalWeekday - d.getDay();
          d.setDate(d.getDate() + diff);
        }
      } else if (freq === 'yearly') {
        if (selectedDayOption === 'sameDate') {
          d.setFullYear(d.getFullYear() + interval);
        } else {
          d.setFullYear(d.getFullYear() + interval);
          const diff = originalWeekday - d.getDay();
          d.setDate(d.getDate() + diff);
        }
      } else {
        // Fallback progress
        d.setDate(d.getDate() + 30);
      }
    }
  });

  return projected;
}
