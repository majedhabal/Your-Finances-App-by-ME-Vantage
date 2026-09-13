import React, { useState, useRef, useEffect } from 'react';
import { Wallet, ShoppingBag, CreditCard, Home, Utensils, Trash2, Plus, Calendar, ChevronLeft, ChevronRight, GripVertical, Activity } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, Tooltip, ResponsiveContainer, XAxis, CartesianGrid } from 'recharts';
import { BudgetCard } from './BudgetCard';
import { SalaryOverviewSection } from './SalaryOverviewSection';
import { isTxMatchingBudget, isTxMatchingBudgetOrUnallocated, isTxCalculatedInOtherBudgets, getUnallocatedCategoriesAndSubcategories, isIgnoredForUnallocated, calculateUnallocatedExpenses, getTransactionEffectiveAmount } from '../lib/transactionUtils';
import { triggerHaptic, hapticPresets } from '../lib/haptics';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const getGraphData = (budget: any, transactions: any[], locale: string, period?: string, recurringTransactions: any[] = []) => {
  const data = [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const p = period || budget?.period;
  const year = p ? Number(p.split('-')[0]) : now.getFullYear();
  const month = p ? Number(p.split('-')[1]) - 1 : now.getMonth();
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const periodStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  const activeRecurring = (recurringTransactions || []).filter(rec => {
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
        const matches = isTxMatchingBudget(tx, budget);
        const isFuture = tx.date > todayStr || tx.isUpcoming || tx.status === 'upcoming' || tx.status === 'draft' || tx.isProjected;
        return matches && tx.date === dStr && !isFuture;
      })
      .reduce((sum, tx) => sum + Math.abs(getTransactionEffectiveAmount(tx)), 0);

    let dayFuture = transactions
      .filter(tx => {
        const matches = isTxMatchingBudget(tx, budget);
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

export const BudgetSection: React.FC<{ 
  budgets: any[], 
  accounts: any[], 
  transactions: any[], 
  onDelete: (budget: any) => void, 
  onBudgetClick: (budget: any) => void, 
  onAddExpense: (budget: any) => void,
  baseCurrency?: string,
  currentPeriod?: string,
  payday?: number,
  onPeriodChange?: (period: string) => void,
  isCurrentPeriod?: boolean,
  onAddManualBudget?: () => void,
  onEditBudget?: (budget: any) => void,
  salary?: number,
  onOpenBreakdown?: () => void,
  onEditPayroll?: () => void,
  recurringTransactions?: any[],
}> = ({ budgets, accounts, transactions, onDelete, onBudgetClick, onAddExpense, baseCurrency = 'AED', currentPeriod, payday = 28, onPeriodChange, isCurrentPeriod = true, onAddManualBudget, onEditBudget, salary = 0, onOpenBreakdown, onEditPayroll, recurringTransactions = [] }) => {
  const { t, i18n } = useTranslation();
  const [expandedBudgetId, setExpandedBudgetId] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [localBudgets, setLocalBudgets] = useState<any[]>(() => {
    try {
      const savedOrder = localStorage.getItem('vantage_budget_order');
      if (savedOrder) {
        const orderIds = JSON.parse(savedOrder);
        const sorted = [...budgets].sort((a, b) => {
          const idxA = orderIds.indexOf(a.id);
          const idxB = orderIds.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
        return sorted;
      }
    } catch (e) {
      // ignore
    }
    return budgets;
  });

  useEffect(() => {
    setLocalBudgets(prev => {
      const prevMap = new Map(prev.map(b => [b.id, b]));
      return budgets.map(b => prevMap.get(b.id) || b);
    });
  }, [budgets]);

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;
    if (sourceIndex === destinationIndex) return;

    const updated = [...localBudgets];
    const [movedItem] = updated.splice(sourceIndex, 1);
    updated.splice(destinationIndex, 0, movedItem);

    setLocalBudgets(updated);

    try {
      localStorage.setItem('vantage_budget_order', JSON.stringify(updated.map(b => b.id)));
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    };
    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTooltip]);

  const getSalaryBreakdownTitle = (yrMo: string) => {
    const [year, month] = yrMo.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const monthName = date.toLocaleDateString(i18n.language, { month: 'long' });
    return `${monthName}`;
  };

  const calculateSpentForBudget = (budget: any) => {
    const periodToUse = currentPeriod || new Date().toISOString().substring(0, 7);
    let confirmedSpent = 0;

    if (!currentPeriod) {
      const currentMonthStr = new Date().toISOString().substring(0, 7);
      confirmedSpent = transactions
        .filter(tx => isTxMatchingBudget(tx, budget) && tx.date?.startsWith(currentMonthStr))
        .reduce((sum, tx) => sum + Math.abs(getTransactionEffectiveAmount(tx)), 0);
    } else {
      const [year, month] = currentPeriod.split('-').map(Number);
      const startDate = new Date(year, month - 1, payday);
      const endDate = new Date(year, month, payday - 1, 23, 59, 59);

      const startStr = startDate.toLocaleDateString('en-CA');
      const endStr = endDate.toLocaleDateString('en-CA');

      confirmedSpent = transactions
        .filter(tx => {
          const matches = isTxMatchingBudget(tx, budget);
          const isInRange = tx.date && tx.date >= startStr && tx.date <= endStr;
          return matches && isInRange;
        })
        .reduce((sum, tx) => sum + Math.abs(getTransactionEffectiveAmount(tx)), 0);
    }

    let recurringSpent = 0;
    if (recurringTransactions && recurringTransactions.length > 0) {
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
          const isInPeriod = currentPeriod ? (tx.date && tx.date.startsWith(currentPeriod)) : tx.date?.startsWith(new Date().toISOString().substring(0, 7));
          return amtMatch && isInPeriod;
        });

        if (!hasConfirmed) {
          const recAmt = (rec.periodOverrides && rec.periodOverrides[periodToUse] !== undefined)
            ? Number(rec.periodOverrides[periodToUse])
            : Number(rec.amount || 0);
          recurringSpent += Math.abs(recAmt);
        }
      });
    }

    return confirmedSpent + recurringSpent;
  };

  const filteredBudgets = currentPeriod 
    ? localBudgets.filter(b => b.period === currentPeriod || !b.period || ['daily', 'weekly', 'monthly'].includes(b.period))
    : localBudgets;

  const budgetsWithDynamicSpent = filteredBudgets.map(b => ({
    ...b,
    spentAmount: calculateSpentForBudget(b)
  }));





  const groupedBudgets = {
    needs: budgetsWithDynamicSpent.filter(b => b.categoryGroup === 'needs'),
    wants: budgetsWithDynamicSpent.filter(b => b.categoryGroup === 'wants'),
    savings: budgetsWithDynamicSpent.filter(b => b.categoryGroup === 'savings')
  };

  const totalBudgeted = budgetsWithDynamicSpent.reduce((sum, b) => sum + (b.allocatedAmount || 0), 0);
  const totalSpent = budgetsWithDynamicSpent.reduce((sum, b) => sum + (b.spentAmount || 0), 0);
  const spentPercentage = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  const getSubLabel = (title: string, group: string) => {
    const tLabel = title.toLowerCase();
    if (tLabel.includes('rent') || tLabel.includes('util') || tLabel.includes('hous') || tLabel === 'housing') return 'budget_section.rent_and_utilities';
    if (tLabel.includes('grocer') || tLabel.includes('dine') || tLabel.includes('food') || tLabel === 'groceries') return 'budget_section.food_and_dining';
    if (tLabel.includes('fuel') || tLabel.includes('car') || tLabel.includes('transport') || tLabel === 'fuel') return 'budget_section.travel_and_fuel';
    if (tLabel.includes('gym') || tLabel.includes('fitness') || tLabel.includes('sport') || tLabel.includes('clothes') || tLabel.includes('shop') || tLabel === 'fitness') return 'budget_section.shopping_and_lifestyle';
    if (tLabel.includes('saving') || tLabel.includes('invest') || tLabel.includes('estate') || tLabel === 'savings') return 'budget_section.savings_and_growth';
    if (group) {
        // Simple map for now based on group
        if (group === 'needs') return 'budget_section.essential_needs';
        if (group === 'wants') return 'budget_section.personal_wants';
        return `budget_section.${group.toLowerCase()}`;
    }
    return 'budget_section.allocated_budget';
  };

  const renderIcon = (iconAsset: string | undefined, categoryTitle?: string) => {
    const asset = iconAsset || '';
    const title = (categoryTitle || '').toLowerCase();
    
    if (asset === 'shopping-bag' || title.includes('want') || title.includes('shop') || title.includes('clothes') || title.includes('gym')) {
      return <ShoppingBag size={22} className="text-[#134E35]" />;
    }
    if (asset === 'credit-card' || title.includes('debt') || title.includes('credit')) {
      return <CreditCard size={22} className="text-[#134E35]" />;
    }
    if (asset === 'home' || title.includes('rent') || title.includes('util') || title.includes('hous')) {
      return <Home size={22} className="text-[#134E35]" />;
    }
    if (asset === 'food' || title.includes('grocer') || title.includes('dine') || title.includes('food') || title.includes('coffe')) {
      return <Utensils size={22} className="text-[#134E35]" />;
    }
    return <Wallet size={22} className="text-[#134E35]" />;
  };

  const renderBudgetCard = (b: any, bIdx?: number, dragHandleProps?: any) => {
    const isExpanded = expandedBudgetId === b.id;
    const graphData = isExpanded ? getGraphData(b, transactions, i18n.language, currentPeriod, recurringTransactions) : [];

    return (
      <div 
        key={`${b.id || 'b'}-${bIdx || 0}`} 
        className="flex flex-col gap-2"
      >
        <BudgetCard 
          budget={b}
          showDragHandle={true}
          dragHandleProps={dragHandleProps}
          onCardClick={() => {
            setExpandedBudgetId(isExpanded ? null : b.id);
          }}
          onPlusClick={isCurrentPeriod ? (e) => { e.stopPropagation(); onAddExpense(b); } : undefined}
          onDeleteClick={(e) => { e.stopPropagation(); onDelete(b); }}
          uiOverrides={{
            container: `p-4 bg-white rounded-xl border transition-all cursor-pointer ${isExpanded ? 'border-[#A6DDB1] shadow-md' : 'border-[#E1E8ED]'}`,
            headerContainer: "flex items-center justify-between mb-2",
            iconContainer: "w-10 h-10 rounded-lg bg-[#F0F3FF] flex items-center justify-center text-[#366945]",
            title: "text-sm font-bold text-[#111C2D]",
            category: "text-xs text-neutral-500",
            valuesContainer: "text-right flex items-center gap-2",
            amount: "text-sm font-bold text-[#111C2D]",
            usage: "text-xs text-neutral-400",
            actionButtons: "flex flex-col gap-1",
            progressBarContainer: "w-full bg-neutral-100 rounded-full h-1",
          }}
        />
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden bg-neutral-50 rounded-xl border border-neutral-100 p-4"
              >
               <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-neutral-400 tracking-wider" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t('budget_section.spending_trend_full_month', 'Spending Trend (Full Month)')}</span>
                    
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-[#366945]" style={{ fontFamily: "'Google Sans', sans-serif" }}>{b.currency || 'AED'}</span>
                    {onEditBudget && !b.isUnallocated && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditBudget(b);
                        }}
                        className="px-3 py-1 rounded-lg bg-[#366945] hover:bg-[#2e5a3b] text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                      >
                        <span>{t('common.edit', 'Edit')}</span>
                      </button>
                    )}
                  </div>
               </div>
               
               {/* 3D Line Chart Stage */}
               <div 
                 className="h-36 w-full privacy-balance privacy-budget-chart relative my-2"
                 style={{
                   perspective: '1000px',
                   transformStyle: 'preserve-3d'
                 }}
               >
                 <div 
                   className="w-full h-full relative transition-transform duration-500 hover:rotate-x-[15deg] hover:rotate-y-[-2deg]"
                   style={{
                     transform: 'rotateX(22deg) rotateY(-6deg) rotateZ(1deg) translateZ(10px)',
                     transformStyle: 'preserve-3d',
                     filter: 'drop-shadow(0px 18px 22px rgba(17, 28, 45, 0.15))'
                   }}
                 >
                   {/* 3D Floor Grid Plane */}
                   <div 
                     className="absolute inset-0 pointer-events-none rounded-xl border border-black/5"
                     style={{
                       background: 'linear-gradient(180deg, rgba(166, 221, 177, 0.08) 0%, rgba(255, 255, 255, 0) 100%)',
                       backgroundImage: 'radial-gradient(rgba(54, 105, 69, 0.15) 1px, transparent 1px)',
                       backgroundSize: '12px 12px',
                       transform: 'translateZ(-15px)'
                     }}
                   />

                   <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={graphData} margin={{ top: 12, right: 10, left: 10, bottom: 5 }}>
                       <defs>
                         {/* 3D Drop Shadow Filter for Floor Projection */}
                         <filter id={`shadow3D-${b.id}`} x="-20%" y="-20%" width="150%" height="150%">
                           <feDropShadow dx="0" dy="10" stdDeviation="6" floodColor="#111C2D" floodOpacity="0.25" />
                         </filter>

                         {/* 3D Extruded Ribbon Wall Gradient */}
                         <linearGradient id={`colorAmount3D-${b.id}`} x1="0" y1="0" x2="0" y2="1">
                           <stop offset="0%" stopColor="#366945" stopOpacity={0.65} />
                           <stop offset="30%" stopColor="#A6DDB1" stopOpacity={0.45} />
                           <stop offset="100%" stopColor="#A6DDB1" stopOpacity={0.02} />
                         </linearGradient>

                         {/* 3D Metallic Top Ridge Tube Gradient */}
                         <linearGradient id={`ridge3D-${b.id}`} x1="0" y1="0" x2="1" y2="0">
                           <stop offset="0%" stopColor="#1E4327" />
                           <stop offset="50%" stopColor="#A6DDB1" />
                           <stop offset="100%" stopColor="#2E5A3B" />
                         </linearGradient>

                         {/* 3D Node Sphere Highlight */}
                         <radialGradient id={`nodeSphere-${b.id}`} cx="35%" cy="35%" r="65%">
                           <stop offset="0%" stopColor="#FFFFFF" />
                           <stop offset="40%" stopColor="#A6DDB1" />
                           <stop offset="100%" stopColor="#1E4327" />
                         </radialGradient>
                       </defs>

                       <Tooltip 
                         contentStyle={{ 
                           borderRadius: '12px', 
                           background: 'rgba(17, 28, 45, 0.92)',
                           backdropFilter: 'blur(12px)',
                           border: '1px solid rgba(166, 221, 177, 0.3)',
                           color: '#FFFFFF',
                           boxShadow: '0 12px 24px -6px rgba(0,0,0,0.3)',
                           fontFamily: "'Google Sans', sans-serif",
                           fontSize: '12px',
                           transform: 'translateZ(25px)'
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
                         tick={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }} 
                         interval="preserveStartEnd"
                         minTickGap={15}
                       />

                       {/* 3D Floor Shadow Projection Path */}
                       <Area 
                         type="monotone" 
                         dataKey="amount" 
                         stroke="rgba(0,0,0,0.18)" 
                         strokeWidth={5}
                         fill="none" 
                         className="opacity-40"
                         style={{ transform: 'translateY(10px)', filter: 'blur(3px)' }}
                       />

                       {/* 3D Wall Ribbon Extrusion */}
                       <Area 
                         type="monotone" 
                         dataKey="amount" 
                         stroke={`url(#ridge3D-${b.id})`} 
                         strokeWidth={4.5}
                         strokeLinecap="round"
                         fillOpacity={1} 
                         fill={`url(#colorAmount3D-${b.id})`} 
                         filter={`url(#shadow3D-${b.id})`}
                         dot={{
                           r: 3.5,
                           fill: `url(#nodeSphere-${b.id})`,
                           stroke: '#1E4327',
                           strokeWidth: 1.5
                         }}
                         activeDot={{
                           r: 6,
                           fill: '#A6DDB1',
                           stroke: '#111C2D',
                           strokeWidth: 2,
                           style: { filter: 'drop-shadow(0 0 8px #A6DDB1)' }
                         }}
                       />

                       {/* Future Transactions in Yellow */}
                       <Area 
                         type="monotone" 
                         dataKey="futureAmount" 
                         stroke="#EAB308" 
                         strokeWidth={4.5}
                         strokeLinecap="round"
                         fillOpacity={0.6} 
                         fill="#FEF08A" 
                         dot={{
                           r: 4,
                           fill: "#FACC15",
                           stroke: "#CA8A04",
                           strokeWidth: 1.5
                         }}
                         activeDot={{
                           r: 6,
                           fill: "#FDE047",
                           stroke: "#CA8A04",
                           strokeWidth: 2,
                           style: { filter: 'drop-shadow(0 0 8px #FACC15)' }
                         }}
                       />
                     </AreaChart>
                   </ResponsiveContainer>
                  </div>
                </div>

                {/* View Transactions Button */}
                <div className="mt-4 pt-3 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const unallocatedMapped = b.isUnallocated ? getUnallocatedCategoriesAndSubcategories(budgets || []) : { mappedCategories: [], mappedSubCategories: [] };
                      const cats = b.mappedCategories && b.mappedCategories.length > 0
                        ? b.mappedCategories
                        : (b.isUnallocated && unallocatedMapped.mappedCategories.length > 0
                            ? unallocatedMapped.mappedCategories
                            : (b.category ? [b.category] : (b.categoryTitle ? [b.categoryTitle.split(">")[0].trim()] : [])));

                      const subs = b.mappedSubCategories && b.mappedSubCategories.length > 0
                        ? b.mappedSubCategories
                        : (b.isUnallocated && unallocatedMapped.mappedSubCategories.length > 0
                            ? unallocatedMapped.mappedSubCategories
                            : (b.subcategory ? [b.subcategory] : (b.categoryTitle && b.categoryTitle.includes(">") ? [b.categoryTitle.split(">")[1].trim()] : [])));

                      let bYear = new Date().getFullYear();
                      let bMonth = new Date().getMonth() + 1;
                      const periodToUse = (b.period && typeof b.period === 'string' && b.period.includes('-')) ? b.period : (currentPeriod || new Date().toISOString().substring(0, 7));
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
                        localStorage.setItem("transactions_filter_categories", JSON.stringify(cats));
                        localStorage.setItem("transactions_filter_category", cats[0]);
                      }
                      if (subs.length > 0) {
                        localStorage.setItem("transactions_filter_subcategories", JSON.stringify(subs));
                      }
                      localStorage.setItem("transactions_filter_start_date", startStr);
                      localStorage.setItem("transactions_filter_end_date", endStr);

                      window.dispatchEvent(new CustomEvent("switch-tab", {
                        detail: {
                          tab: "activity",
                          categories: cats.length > 0 ? cats : undefined,
                          subcategories: subs.length > 0 ? subs : undefined,
                          category: cats[0] || undefined,
                          startDate: startStr,
                          endDate: endStr
                        }
                      }));
                    }}
                    className="w-full py-2.5 px-4 bg-[#366945] hover:bg-[#2e5a3b] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                  >
                    <Activity size={15} />
                    <span>View transactions</span>
                  </button>
                </div>
             </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const needsBudgets = budgetsWithDynamicSpent.filter(b => b.categoryGroup === 'needs' || (!b.categoryGroup && (b.categoryTitle === 'Essential Needs' || (b.categoryTitle !== 'Personal Wants' && b.categoryTitle !== 'Emergency Funds'))));
  const wantsBudgets = budgetsWithDynamicSpent.filter(b => b.categoryGroup === 'wants' || (!b.categoryGroup && b.categoryTitle === 'Personal Wants'));
  const savingsBudgets = budgetsWithDynamicSpent.filter(b => b.categoryGroup === 'savings' || (!b.categoryGroup && b.categoryTitle === 'Emergency Funds'));

  return (
    <section className="bg-white rounded-2xl border border-[#E1E8ED] p-6 shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold mb-0 text-[#111C2D]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          {t('budget_section.budget_allocation')}
        </h3>
        <div className="relative" ref={tooltipRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic(hapticPresets.light);
              setShowTooltip(!showTooltip);
            }}
            className="w-6 h-6 rounded-full bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-sm font-bold flex items-center justify-center transition-colors cursor-pointer shadow-xs"
            title="More details"
          >
            i
          </button>
          {showTooltip && (
            <div 
              className="absolute right-0 top-full mt-2 w-64 p-3 bg-white rounded-xl shadow-lg border border-neutral-200 text-xs text-neutral-700 z-50 font-normal leading-relaxed text-left"
              onClick={(e) => e.stopPropagation()}
            >
              {t('budget_section.below_budgets_tip', 'Below you can see your monthly budgets and how much you have spent on them so far')}
              <div className="absolute right-3 bottom-full w-2 h-2 bg-white border-l border-t border-neutral-200 transform rotate-45 -mb-1"></div>
            </div>
          )}
        </div>
      </div>

      {/* Add Manual Budget Button */}
      {onAddManualBudget && (
        <div className="mb-6">
          <button
            onClick={onAddManualBudget}
            className="w-full py-2.5 px-4 bg-[#111C2D] hover:bg-[#1f2d42] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm cursor-pointer"
            style={{ fontFamily: "'Google Sans', sans-serif" }}
          >
            <Plus size={16} />
            <span>{t('budget_section.add_manual_budget', 'Add Manual Budget')}</span>
          </button>
        </div>
      )}
      
      {/* Budget List */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="budget-list">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="flex flex-col gap-4">


              {budgetsWithDynamicSpent.map((b, index) => (
                <Draggable key={b.id} draggableId={b.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      style={{
                        ...provided.draggableProps.style,
                      }}
                      className={snapshot.isDragging ? 'shadow-2xl ring-2 ring-[#366945] rounded-2xl bg-white z-50 scale-[1.02]' : 'transition-transform'}
                    >
                      {renderBudgetCard(b, index, provided.dragHandleProps)}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              

            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Visual Indicator */}
      <div className="flex flex-col items-center mt-12 mb-8 privacy-balance privacy-budget-chart">
        <div className="relative w-48 h-48 flex items-center justify-center mb-2">
           <svg className="w-full h-full rotate-[-90deg]" viewBox="0 0 100 100">
             <circle className="text-neutral-100" strokeWidth="10" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50" />
             <circle 
                className="text-[#A6DDB1]" 
                strokeWidth="10" 
                strokeDasharray={251.2} 
                strokeDashoffset={251.2 - (251.2 * Math.min(spentPercentage, 100) / 100)} 
                strokeLinecap="round" 
                stroke="currentColor" 
                fill="transparent" 
                r="40" cx="50" cy="50" 
             />
           </svg>
           <div className="absolute text-center">
             <div className="text-[12px] text-neutral-400" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>{t('budget_section.spent_percent', '{{percent}}% spent', { percent: spentPercentage.toFixed(0) })}</div>
             <div className="text-lg font-bold text-[#111C2D] privacy-balance" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>{baseCurrency} {totalSpent.toLocaleString()}</div>
           </div>
        </div>
      </div>
      
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="text-center">
           <div className="text-xs text-neutral-400 mb-1" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>{t('budget_section.total_budgeted', 'Total budgeted')}</div>
           <div className="font-bold text-[#111C2D] text-lg privacy-balance privacy-budget-total" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>{baseCurrency} {totalBudgeted.toLocaleString()}</div>
        </div>
        <div className="text-center">
           <div className="text-xs text-neutral-400 mb-1" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>{t('budget_section.remaining', 'Remaining')}</div>
           <div className="font-bold text-[#366945] text-lg privacy-balance privacy-budget-remaining" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>{baseCurrency} {(totalBudgeted - totalSpent).toLocaleString()}</div>
        </div>
      </div>

      {/* Income Breakdown Section */}
      {onOpenBreakdown && (
        <div className="mb-4">
          <SalaryOverviewSection
            salary={salary}
            currency={baseCurrency}
            onOpenBreakdown={onOpenBreakdown}
            onEditPayroll={onEditPayroll}
          />
        </div>
      )}

      {/* Month Selection UI */}
      {currentPeriod && onPeriodChange && (
        <div className="flex items-center justify-between bg-[#F8FAFC] border border-[#E1E8ED] rounded-xl p-3" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          <div className="flex flex-col">
            <span className="text-[14px] text-[#57606F] font-normal">
              {t('essentials.active_viewing_period', 'Active Viewing Period')}
            </span>
            <span className="text-[14px] text-black font-bold">
              {getSalaryBreakdownTitle(currentPeriod)} {t('essentials.breakdown', 'Breakdown')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                const [y, m] = currentPeriod.split('-').map(Number);
                const prev = new Date(y, m - 2, 1);
                onPeriodChange(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
              }}
              className="p-1.5 hover:bg-white rounded-lg border border-neutral-200 transition-all active:scale-95 shadow-xs bg-white cursor-pointer"
            >
              <ChevronLeft size={16} className="text-neutral-600" />
            </button>
            <button 
              onClick={() => {
                const [y, m] = currentPeriod.split('-').map(Number);
                const next = new Date(y, m, 1);
                onPeriodChange(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
              }}
              className="p-1.5 hover:bg-white rounded-lg border border-neutral-200 transition-all active:scale-95 shadow-xs bg-white cursor-pointer"
            >
              <ChevronRight size={16} className="text-neutral-600" />
            </button>
          </div>
        </div>
      )}

    </section>
  );
};
