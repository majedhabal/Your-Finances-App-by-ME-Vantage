import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from '@/lib/i18n';
import { formatLabel, translateCategoryOrSubcategory } from '../lib/stringUtils';
import { AreaChart, Area, Tooltip, ResponsiveContainer, XAxis, PieChart, Pie, Cell } from 'recharts';
import { 
  ChevronLeft,
  MoreHorizontal,
  Home,
  Zap,
  Droplets,
  CreditCard,
  Tag,
  Layers,
  Activity,
} from 'lucide-react';
import { TransactionDetailModal } from './TransactionDetailModal';
import { ConfirmationModal } from './ConfirmationModal';
import { doc, deleteDoc, writeBatch, query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { isTxMatchingBudget, isTxMatchingBudgetOrUnallocated, getUnallocatedCategoriesAndSubcategories, isIgnoredForUnallocated, isTxCalculatedInOtherBudgets, getTransactionEffectiveAmount } from '../lib/transactionUtils';
import { MASTER_CATEGORIES } from '../lib/constants';

interface Transaction {
  id: string;
  amount: number;
  date: string;
  time?: string;
  category: string;
  subcategory?: string;
  subCategory?: string;
  isSplit?: boolean;
  splitGroupId?: string | null;
  accountId: string;
  type: string;
  status?: string;
  isUpcomingSalaryAllocation?: boolean;
  emoji?: string;
  notes?: string;
}

interface Budget {
  id: string;
  categoryTitle?: string;
  title?: string;
  name?: string;
  categories?: string[];
  subcategories?: string[];
  mappedCategories?: string[];
  mappedSubCategories?: string[];
  category?: string;
  subcategory?: string;
  limit: number;
  currency: string;
  period: string;
  allocatedAmount?: number;
  spentAmount?: number;
  iconAsset?: string;
  isArchived?: boolean;
  isUnallocated?: boolean;
}

interface BudgetDetailViewProps {
  budget: any;
  transactions: Transaction[];
  accounts: any[];
  uid: string;
  allBudgets?: any[];
  recurringTransactions?: any[];
  onBack: () => void;
  onEdit: () => void;
}

const getGraphData = (budget: any, transactions: any[], locale: string, allBudgets: any[], recurringTransactions: any[] = []) => {
  const data = [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const year = budget?.period ? Number(budget.period.split('-')[0]) : now.getFullYear();
  const month = budget?.period ? Number(budget.period.split('-')[1]) - 1 : now.getMonth();
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const periodStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  const activeRecurring = budget.isUnallocated ? [] : (recurringTransactions || []).filter(rec => {
    if (rec.isActive === false) return false;
    const isExp = rec.transactionType === 'expense' || rec.type === 'expense' || rec.transactionType === 'outflow' || rec.type === 'outflow' || rec.transactionType === 'debit' || rec.type === 'debit' || (!['income', 'inflow', 'deposit', 'credit', 'transfer', 'transfers'].includes((rec.transactionType || rec.type || '').toLowerCase()));
    if (!isExp) return false;
    return isTxMatchingBudget(rec, budget);
  });
  
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const dStr = d.toLocaleDateString('en-CA');
    
    const dayConfirmed = transactions
      .filter(tx => {
        const matches = isTxMatchingBudgetOrUnallocated(tx, budget, allBudgets);
        const isFuture = tx.date > todayStr || tx.isUpcoming || tx.status === 'upcoming' || tx.status === 'draft' || tx.isProjected;
        return matches && tx.date === dStr && !isFuture;
      })
      .reduce((sum, tx) => sum + Math.abs(getTransactionEffectiveAmount(tx)), 0);

    let dayFuture = transactions
      .filter(tx => {
        const matches = isTxMatchingBudgetOrUnallocated(tx, budget, allBudgets);
        const isFuture = tx.date > todayStr || tx.isUpcoming || tx.status === 'upcoming' || tx.status === 'draft' || tx.isProjected;
        return matches && tx.date === dStr && isFuture;
      })
      .reduce((sum, tx) => sum + Math.abs(getTransactionEffectiveAmount(tx)), 0);

    activeRecurring.forEach(rec => {
      let recDay = day;
      const recStart = rec.nextExecutionDate || rec.startDate;
      if (recStart) {
        let rDateStr = recStart;
        if (typeof recStart.toDate === 'function') rDateStr = recStart.toDate().toISOString().split('T')[0];
        else if (recStart instanceof Date) rDateStr = recStart.toISOString().split('T')[0];
        else if (typeof recStart === 'string' && recStart.includes('T')) rDateStr = recStart.split('T')[0];
        const parts = rDateStr.split('-');
        if (parts.length === 3) {
          recDay = Number(parts[2]);
        }
      } else if (rec.dayOption && typeof rec.dayOption === 'number') {
        recDay = rec.dayOption;
      }

      if (recDay === day) {
        const hasConfirmed = transactions.some(tx => {
          if (!isTxMatchingBudget(tx, budget)) return false;
          const amtMatch = Math.abs(Number(tx.amount || 0) - Number(rec.amount || 0)) < 1 || (rec.notes && tx.notes && tx.notes.toLowerCase().includes(rec.notes.toLowerCase()));
          return amtMatch && tx.date?.startsWith(periodStr);
        });

        if (!hasConfirmed) {
          const recAmt = (rec.periodOverrides && rec.periodOverrides[periodStr] !== undefined)
            ? Number(rec.periodOverrides[periodStr])
            : Number(rec.amount || 0);
          dayFuture += Math.abs(recAmt);
        }
      }
    });
      
    data.push({
      name: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      amount: dayConfirmed,
      futureAmount: dayFuture > 0 ? dayFuture : null
    });
  }
  return data;
};

const renderIcon = (asset: string | undefined) => {
  switch (asset) {
    case 'home': return <Home className="text-gray-800" size={24} />;
    case 'zap': return <Zap className="text-gray-800" size={24} />;
    case 'droplets': return <Droplets className="text-gray-800" size={24} />;
    default: return <CreditCard className="text-gray-800" size={24} />;
  }
};

export const BudgetDetailView: React.FC<BudgetDetailViewProps> = ({ 
  budget, 
  transactions, 
  accounts, 
  uid,
  allBudgets = [],
  recurringTransactions = [],
  onBack,
  onEdit
}) => {
  const { t, i18n } = useTranslation();
  const [selectedTx, setSelectedTx] = React.useState<Transaction | null>(null);
  const [txToDelete, setTxToDelete] = React.useState<any | null>(null);

  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent('budget-detail-toggled', { detail: { isOpen: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent('budget-detail-toggled', { detail: { isOpen: false } }));
    };
  }, []);

  const activeCurrency = budget.currency || 'AED';
  const graphData = useMemo(() => getGraphData(budget, transactions, i18n.language, allBudgets, recurringTransactions), [budget, transactions, i18n.language, allBudgets, recurringTransactions]);

  const rawTitle = budget.title 
    ? budget.title 
    : (budget.name 
        ? budget.name 
        : (budget.categoryTitle 
            ? (budget.categoryTitle.includes(' > ') ? budget.categoryTitle.split(' > ').pop()?.trim() : budget.categoryTitle)
            : (budget.subcategory || budget.category)));

  const translatedTitle = rawTitle 
    ? translateCategoryOrSubcategory(rawTitle, t) 
    : t('budget_card.allocation', 'Allocation');

  const dueDateText = useMemo(() => {
    if (budget.period) {
      const [year, month] = budget.period.split('-').map(Number);
      const date = new Date(year, month - 1, 1);
      return date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
    }
    return t('budget_detail.first_of_month', '1st of the month');
  }, [budget.period, i18n.language, t]);
  
  const filterBudgetTransactions = (txs: Transaction[]) => {
    const nowDate = new Date();

    return txs.filter(tx => {
      if (tx.status === 'draft' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
      if (new Date(tx.date) > nowDate) return false;
      
      return isTxMatchingBudgetOrUnallocated(tx, budget, allBudgets);
    });
  };

  const budgetTxs = useMemo(() => filterBudgetTransactions(transactions).sort((a,b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateB - dateA;
    
    const parseTime = (t: string | undefined) => {
      if (!t) return 0;
      if (t.includes('AM') || t.includes('PM')) {
        const [time, modifier] = t.split(' ');
        if (!time) return 0;
        let [hours, minutes] = time.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return 0;
        if (modifier === 'PM' && hours !== 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      } else {
        const [hours, minutes] = t.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return 0;
        return hours * 60 + minutes;
      }
    };
    return parseTime(b.time) - parseTime(a.time);
  }), [transactions, budget]);
  
  const now = new Date();
  const currentYear = budget?.period ? Number(budget.period.split('-')[0]) : now.getFullYear();
  const currentMonth = budget?.period ? Number(budget.period.split('-')[1]) - 1 : now.getMonth();
  const periodStr = budget?.period || `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const currentMonthTxs = budgetTxs.filter(tx => {
    const d = new Date(tx.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const spentThisMonth = useMemo(() => {
    if (budget.isUnallocated) {
      const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
      const totalSpendings = transactions
        .filter(tx => {
          if (!tx.date?.startsWith(currentMonthStr)) return false;
          if (tx.status === 'draft' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
          return !isIgnoredForUnallocated(tx, []);
        })
        .reduce((sum, tx) => sum + Math.abs(getTransactionEffectiveAmount(tx)), 0);

      const configuredBudgets = (allBudgets || []).filter(b => b.id !== 'unallocated-expenses' && !b.isUnallocated);
      const totalConfiguredSpent = configuredBudgets.reduce((sum, b) => {
        const bSpent = transactions
          .filter(tx => {
            if (!tx.date?.startsWith(currentMonthStr)) return false;
            return isTxMatchingBudget(tx, b);
          })
          .reduce((s, tx) => s + Math.abs(getTransactionEffectiveAmount(tx)), 0);
        return sum + bSpent;
      }, 0);

      return Math.max(0, totalSpendings - totalConfiguredSpent);
    }

    const confirmedSum = currentMonthTxs.reduce((sum, tx) => {
      const amt = getTransactionEffectiveAmount(tx);
      return sum + Math.abs(amt);
    }, 0);

    let recurringSum = 0;
    if (recurringTransactions && recurringTransactions.length > 0 && !budget.isUnallocated) {
      const activeRecurring = recurringTransactions.filter(rec => {
        if (rec.isActive === false) return false;
        const isExp = rec.transactionType === 'expense' || rec.type === 'expense' || rec.transactionType === 'outflow' || rec.type === 'outflow' || rec.transactionType === 'debit' || rec.type === 'debit' || (!['income', 'inflow', 'deposit', 'credit', 'transfer', 'transfers'].includes((rec.transactionType || rec.type || '').toLowerCase()));
        if (!isExp) return false;
        return isTxMatchingBudget(rec, budget);
      });

      activeRecurring.forEach(rec => {
        const hasConfirmed = transactions.some(tx => {
          if (!isTxMatchingBudget(tx, budget)) return false;
          const amtMatch = Math.abs(Number(tx.amount || 0) - Number(rec.amount || 0)) < 1 || (rec.notes && tx.notes && tx.notes.toLowerCase().includes(rec.notes.toLowerCase()));
          return amtMatch && tx.date?.startsWith(periodStr);
        });

        if (!hasConfirmed) {
          const recAmt = (rec.periodOverrides && rec.periodOverrides[periodStr] !== undefined)
            ? Number(rec.periodOverrides[periodStr])
            : Number(rec.amount || 0);
          recurringSum += Math.abs(recAmt);
        }
      });
    }

    return confirmedSum + recurringSum;
  }, [budget.isUnallocated, currentMonthTxs, transactions, currentYear, currentMonth, allBudgets, recurringTransactions]);
  const limit = budget.limit || budget.allocatedAmount || 0;
  const spentUsage = limit > 0 ? (spentThisMonth / limit) * 100 : 0;

  const unallocatedMapped = useMemo(() => {
    if (!budget.isUnallocated) return { mappedCategories: [], mappedSubCategories: [] };
    return getUnallocatedCategoriesAndSubcategories(allBudgets);
  }, [budget.isUnallocated, allBudgets]);

  const selectedCategories = budget.mappedCategories && budget.mappedCategories.length > 0
    ? budget.mappedCategories
    : (budget.isUnallocated && unallocatedMapped.mappedCategories.length > 0
        ? unallocatedMapped.mappedCategories
        : (budget.category ? [budget.category] : []));

  const selectedSubcategories = budget.mappedSubCategories && budget.mappedSubCategories.length > 0
    ? budget.mappedSubCategories
    : (budget.isUnallocated && unallocatedMapped.mappedSubCategories.length > 0
        ? unallocatedMapped.mappedSubCategories
        : (budget.subcategory ? [budget.subcategory] : []));

  const categoryDistributionData = useMemo(() => {
    const map: { [key: string]: number } = {};
    currentMonthTxs.forEach(tx => {
      const key = tx.subcategory || tx.category || 'General';
      const amt = budget.isUnallocated ? Math.abs(Number(tx.amount || 0)) : Number(tx.amount || 0);
      map[key] = (map[key] || 0) + amt;
    });
    return Object.keys(map).map(k => ({
      name: translateCategoryOrSubcategory(k, t),
      value: map[k]
    })).sort((a, b) => b.value - a.value);
  }, [currentMonthTxs, t, budget.isUnallocated]);

  const PIE_COLORS = ['#366945', '#A6DDB1', '#1E4327', '#4E9F3D', '#68B984', '#111C2D', '#78909C'];

  const unallocatedCategoriesList = useMemo(() => {
    if (!budget.isUnallocated) return [];
    const configuredBudgets = (allBudgets || []).filter(b => b.id !== 'unallocated-expenses' && !b.isUnallocated);
    
    const selectedCats = new Set<string>();
    const selectedSubs = new Set<string>();

    configuredBudgets.forEach(b => {
      const cats = b.mappedCategories || (b.category ? [b.category] : []);
      cats.forEach((c: string) => selectedCats.add(c.toLowerCase().trim()));
      
      const subs = b.mappedSubCategories || (b.subcategory && b.subcategory !== 'All' ? [b.subcategory] : []);
      subs.forEach((s: string) => selectedSubs.add(s.toLowerCase().trim()));
    });

    const result: { category: string; emoji: string; subcategories: string[] }[] = [];

    MASTER_CATEGORIES.forEach(catDef => {
      const catNameLower = catDef.name.toLowerCase().trim();
      if (catNameLower === 'starting balance' || catNameLower === 'income') return;
      const isCatSelected = selectedCats.has(catNameLower);
      
      const unassignedSubs = (catDef.subcategories || []).filter(sub => !selectedSubs.has(sub.toLowerCase().trim()));
      
      if (!isCatSelected) {
        result.push({
          category: catDef.name,
          emoji: catDef.emoji || '📦',
          subcategories: catDef.subcategories || []
        });
      } else if (unassignedSubs.length > 0) {
        result.push({
          category: catDef.name,
          emoji: catDef.emoji || '📦',
          subcategories: unassignedSubs
        });
      }
    });

    return result;
  }, [budget.isUnallocated, allBudgets]);

  return (
    <div className="bg-white w-full flex flex-col font-sans mt-0" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {/* Navigation Bar */}
      <div className="flex items-center justify-between px-6 py-4 sticky top-0 bg-white z-30 border-b border-neutral-100 shadow-2xs">
        <button type="button" onClick={onBack} aria-label="Go back" className="p-2 rounded-full hover:bg-black/5 transition-colors text-[#111c2d] cursor-pointer">
          <ChevronLeft size={24} />
        </button>
        {!budget.isUnallocated && (
          <button 
            type="button"
            onClick={onEdit}
            className="px-4 py-2 rounded-xl bg-[#366945] hover:bg-[#2e5a3b] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            style={{ fontFamily: "'Google Sans', sans-serif" }}
          >
            <span>{t('common.edit', 'Edit Budget')}</span>
          </button>
        )}
      </div>

      {/* Budget Header */}
      <header className="mt-[20px] px-0 py-0 flex items-center justify-center">
        <h1 className="text-[32px] font-bold text-[#111c2d]">
          {translatedTitle}
        </h1>
      </header>

      {/* Budget Summary Card */}
      <section className="mx-[15px] pb-md mt-4">
        <div className="bg-white py-[20px] px-[16px] rounded-[20px] border border-[#F2F4F7] shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-xs">
            <span className="font-bold text-[#5f5e5e] text-xs">
              {budget.isUnallocated ? t('budgets.total_expenses', 'Total Expenses') : t('budget_detail.total_spent')}
            </span>
            {!budget.isUnallocated && (
              <div className="bg-[#e6f7ef] text-[#366945] px-sm py-xs rounded-full text-xs font-bold">
                {Math.min(spentUsage, 100).toFixed(0)}% {t('budget_detail.used')}
              </div>
            )}
          </div>

          <h2 className="text-3xl font-extrabold text-[#111c2d] privacy-balance my-2">
            {activeCurrency} {spentThisMonth.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </h2>

          {!budget.isUnallocated && (
            <>
              <div className="flex justify-between text-xs mb-xs">
                <span className="text-[#5f5e5e] privacy-balance privacy-budget-total">{t('budget_detail.budget_limit')} {activeCurrency} {limit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                <span className="font-bold text-[#111c2d] privacy-balance privacy-budget-remaining">{activeCurrency} {Math.max(0, limit - spentThisMonth).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {t('budget_detail.remaining')}</span>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full bg-[#e6f7ef] h-3 rounded-full overflow-hidden mt-2">
                <div 
                  className="bg-[#a6ddb1] h-full rounded-full" 
                  style={{ width: `${Math.min(spentUsage, 100)}%` }}
                ></div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Spending Trend Chart Section */}
      {!budget.isUnallocated && (
        <section className="mx-[15px] pb-md">
          <div className="bg-white p-4 rounded-[20px] border border-[#F2F4F7] shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-neutral-600" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t('budget_section.spending_trend_full_month', 'Spending Trend (Full Month)')}</span>
                
              </div>
              <span className="text-[12px] font-bold text-[#366945]" style={{ fontFamily: "'Google Sans', sans-serif" }}>{activeCurrency}</span>
            </div>

            <div 
              className="h-36 w-full relative my-2"
              style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
            >
              <div 
                className="w-full h-full relative"
                style={{
                  transform: 'rotateX(15deg) rotateY(-4deg) rotateZ(0deg)',
                  transformStyle: 'preserve-3d',
                  filter: 'drop-shadow(0px 12px 16px rgba(17, 28, 45, 0.12))'
                }}
              >
                <div 
                  className="absolute inset-0 pointer-events-none rounded-xl border border-black/5"
                  style={{
                    background: 'linear-gradient(180deg, rgba(166, 221, 177, 0.08) 0%, rgba(255, 255, 255, 0) 100%)',
                    backgroundImage: 'radial-gradient(rgba(54, 105, 69, 0.15) 1px, transparent 1px)',
                    backgroundSize: '12px 12px',
                    transform: 'translateZ(-10px)'
                  }}
                />

                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={graphData} margin={{ top: 12, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id={`colorAmountDetail-${budget.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#366945" stopOpacity={0.65} />
                        <stop offset="30%" stopColor="#A6DDB1" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#A6DDB1" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id={`ridgeDetail-${budget.id}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#1E4327" />
                        <stop offset="50%" stopColor="#A6DDB1" />
                        <stop offset="100%" stopColor="#2E5A3B" />
                      </linearGradient>
                    </defs>

                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '12px', 
                        background: 'rgba(17, 28, 45, 0.92)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(166, 221, 177, 0.3)',
                        color: '#FFFFFF',
                        fontSize: '12px',
                        fontFamily: "'Google Sans', sans-serif"
                      }}
                      labelStyle={{ fontWeight: 700, color: '#A6DDB1', marginBottom: '2px' }}
                      itemStyle={{ color: '#FFFFFF', fontWeight: 600 }}
                      formatter={(value: any) => typeof value === 'number' ? Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}
                    />

                    <XAxis 
                      dataKey="name" 
                      hide={false} 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} 
                      interval="preserveStartEnd"
                      minTickGap={15}
                    />

                    <Area 
                      type="monotone" 
                      dataKey="amount" 
                      stroke={`url(#ridgeDetail-${budget.id})`} 
                      strokeWidth={4}
                      strokeLinecap="round"
                      fillOpacity={1} 
                      fill={`url(#colorAmountDetail-${budget.id})`} 
                      dot={{ r: 3, fill: '#A6DDB1', stroke: '#1E4327', strokeWidth: 1.5 }}
                      activeDot={{ r: 6, fill: '#A6DDB1', stroke: '#111C2D', strokeWidth: 2 }}
                    />

                    {/* Future Transactions Area in Yellow */}
                    <Area 
                      type="monotone" 
                      dataKey="futureAmount" 
                      stroke="#EAB308" 
                      strokeWidth={4}
                      strokeLinecap="round"
                      fillOpacity={0.6} 
                      fill="#FEF08A" 
                      dot={{ r: 4, fill: '#FACC15', stroke: '#CA8A04', strokeWidth: 1.5 }}
                      activeDot={{ r: 6, fill: '#FDE047', stroke: '#CA8A04', strokeWidth: 2, style: { filter: 'drop-shadow(0 0 8px #FACC15)' } }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Categories and Sub-categories Selected for this Budget */}
            <div className="mt-4 pt-3 border-t border-neutral-100">
              <h4 className="text-xs font-bold text-neutral-500 mb-2 uppercase tracking-wide">Selected Categories & Sub-Categories</h4>
              <div className="flex flex-wrap gap-2">
                {selectedCategories.length > 0 ? (
                  selectedCategories.map((cat: string, cIdx: number) => (
                    <div key={cIdx} className="flex items-center gap-1.5 bg-[#F8FAFC] border border-neutral-200/80 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#111c2d]">
                      <Tag size={13} className="text-[#366945]" />
                      <span>{translateCategoryOrSubcategory(cat, t)}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-neutral-400">All Categories</span>
                )}

                {selectedSubcategories.length > 0 && selectedSubcategories.map((sub: string, sIdx: number) => (
                  sub && sub !== 'All' ? (
                    <div key={`sub-${sIdx}`} className="flex items-center gap-1.5 bg-[#e6f7ef]/50 border border-[#a6ddb1]/40 px-2.5 py-1.5 rounded-xl text-xs font-medium text-[#1E4327]">
                      <Layers size={13} className="text-[#366945]" />
                      <span>{translateCategoryOrSubcategory(sub, t)}</span>
                    </div>
                  ) : null
                ))}
              </div>
            </div>

            {/* View Transactions Button */}
            <div className="mt-4 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => {
                  const cats = selectedCategories;
                  const subs = selectedSubcategories;

                  let bYear = new Date().getFullYear();
                  let bMonth = new Date().getMonth() + 1;
                  const periodToUse = (budget.period && typeof budget.period === 'string' && budget.period.includes('-')) ? budget.period : new Date().toISOString().substring(0, 7);
                  if (periodToUse && typeof periodToUse === 'string' && periodToUse.includes('-')) {
                    const parts = periodToUse.split('-').map(Number);
                    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                      bYear = parts[0];
                      bMonth = parts[1];
                    }
                  }
                  const startDateObj = new Date(bYear, bMonth - 1, 1);
                  const endDateObj = new Date(bYear, bMonth, 0);
                  const startStr = startDateObj.toLocaleDateString("en-CA");
                  const endStr = endDateObj.toLocaleDateString("en-CA");

                  if (cats.length > 0) {
                    localStorage.setItem('transactions_filter_categories', JSON.stringify(cats));
                    localStorage.setItem('transactions_filter_category', cats[0]);
                  }
                  if (subs.length > 0) {
                    localStorage.setItem('transactions_filter_subcategories', JSON.stringify(subs));
                  }
                  localStorage.setItem('transactions_filter_start_date', startStr);
                  localStorage.setItem('transactions_filter_end_date', endStr);

                  window.dispatchEvent(new CustomEvent('switch-tab', {
                    detail: {
                      tab: 'activity',
                      categories: cats.length > 0 ? cats : undefined,
                      subcategories: subs.length > 0 ? subs : undefined,
                      category: cats[0] || undefined,
                      startDate: startStr,
                      endDate: endStr
                    }
                  }));
                  onBack();
                }}
                className="w-full py-2.5 px-4 bg-[#366945] hover:bg-[#2e5a3b] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                style={{ fontFamily: "'Google Sans', sans-serif" }}
              >
                <Activity size={15} />
                <span>View transactions</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Category Spending Distribution Pie Chart Section */}
      {!budget.isUnallocated && (
        <section className="mx-[15px] pb-md">
          <div className="bg-white p-4 rounded-[20px] border border-[#F2F4F7] shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-neutral-600" style={{ fontFamily: "'Google Sans', sans-serif" }}>Category Distribution</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#366945]/10 text-[#366945] font-bold border border-[#366945]/20" style={{ fontFamily: "'Google Sans', sans-serif" }}>Spending Share</span>
              </div>
              <span className="text-[12px] font-bold text-[#366945]" style={{ fontFamily: "'Google Sans', sans-serif" }}>{activeCurrency}</span>
            </div>

            {categoryDistributionData.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="h-44 w-full sm:w-1/2 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip 
                        contentStyle={{ 
                          borderRadius: '12px', 
                          background: 'rgba(17, 28, 45, 0.92)',
                          backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(166, 221, 177, 0.3)',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          fontFamily: "'Google Sans', sans-serif"
                        }}
                        itemStyle={{ color: '#FFFFFF', fontWeight: 600 }}
                      />
                      <Pie
                        data={categoryDistributionData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={65}
                        paddingAngle={4}
                      >
                        {categoryDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="w-full sm:w-1/2 flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {categoryDistributionData.map((item, idx) => {
                    const totalSpent = spentThisMonth > 0 ? spentThisMonth : 1;
                    const pct = ((item.value / totalSpent) * 100).toFixed(0);
                    return (
                      <div key={idx} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-neutral-50/80 border border-neutral-100">
                        <div className="flex items-center gap-2 truncate">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                          <span className="font-semibold text-neutral-800 truncate">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2 font-bold text-neutral-700 shrink-0">
                          <span>{activeCurrency} {item.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          <span className="text-[10px] text-neutral-400 font-normal">({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-neutral-400">
                No spending data for this category breakdown yet.
              </div>
            )}
          </div>
        </section>
      )}

      {/* Unallocated Categories List */}
      {budget.isUnallocated && unallocatedCategoriesList.length > 0 && (
        <section className="mx-[15px] pb-md">
          <div className="bg-white p-5 rounded-[20px] border border-[#F2F4F7] shadow-sm">
            <h3 className="text-sm font-bold text-neutral-800 mb-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>
              {t('budget_detail.unallocated_categories', 'Unassigned Categories & Sub-Categories')}
            </h3>
            <p className="text-xs text-neutral-500 mb-4" style={{ fontFamily: "'Google Sans', sans-serif" }}>
              {t('budget_detail.unallocated_desc', 'Categories and sub-categories not assigned to any specific budget are automatically tracked here.')}
            </p>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {unallocatedCategoriesList.map((item, idx) => (
                <div key={`unalloc-cat-${idx}`} className="p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">{item.emoji}</span>
                    <span className="text-xs font-bold text-neutral-800" style={{ fontFamily: "'Google Sans', sans-serif" }}>{item.category}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-6">
                    {item.subcategories.map((sub, sIdx) => (
                      <span key={`unalloc-sub-${sIdx}`} className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-neutral-200 text-neutral-600 font-normal">
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Auto-Pay & Due Date Cards */}
      <section className="mx-[15px] pb-md grid grid-cols-2 gap-md">
        <div className="bg-white p-4 rounded-[20px] border border-[#F2F4F7] shadow-sm">
          <span className="font-label-md text-on-surface-variant text-xs">{t('budget_detail.auto_pay')}</span>
          <p className="text-base font-bold text-on-surface mt-1">{t('budget_detail.active')}</p>
        </div>
        <div className="bg-white p-4 rounded-[20px] border border-[#F2F4F7] shadow-sm">
          <span className="font-label-md text-on-surface-variant text-xs">{t('budget_detail.due_date')}</span>
          <p className="text-base font-bold text-on-surface mt-1">{dueDateText}</p>
        </div>
      </section>

      {/* Main Content List */}
      <main className="content-area flex-1 bg-surface-container-lowest mx-[15px] px-[12px] mb-6">
        <div className="flex justify-between items-center mb-md">
          <h3 className="text-base font-bold text-on-surface">{t('budget_detail.recent_transactions')}</h3>
          <span className="text-[#366945] font-bold text-sm cursor-pointer" onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: { tab: 'activity' } }))}>{t('budget_detail.view_all')}</span>
        </div>
        <div className="space-y-md">
          {currentMonthTxs.map((tx) => {
            const txSubcategory = tx.subcategory || tx.subCategory;
            const txSubcategoryText = txSubcategory ? t(`subcategories.${txSubcategory}`, formatLabel(txSubcategory)) : "";
            
            return (
              <div key={tx.id} className="flex items-center gap-md bg-white p-3 rounded-xl border border-neutral-100 shadow-2xs">
                <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center border border-outline-variant/20">
                  {renderIcon(tx.emoji)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-on-surface">{tx.notes || txSubcategoryText || t(`categories.${tx.category}`, formatLabel(tx.category))}</p>
                  <p className="text-xs text-on-surface-variant">
                    {new Date(tx.date).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}{txSubcategoryText ? ` • ${txSubcategoryText}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-on-surface">
                    -{activeCurrency} {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            );
          })}
          {currentMonthTxs.length === 0 && <p className="text-xs text-on-surface-variant py-2">{t('budget_detail.no_transactions')}</p>}
        </div>
      </main>
    </div>
  );
};

