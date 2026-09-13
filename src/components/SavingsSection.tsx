import React, { useState, useRef, useEffect } from 'react';
import { Target, Trash2, TrendingUp, Plus, Edit2, BarChart2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { translateCategoryOrSubcategory } from '../lib/stringUtils';
import { triggerHaptic, hapticPresets } from '../lib/haptics';
import { motion, AnimatePresence } from 'motion/react';
import { DEFAULT_RATES } from '../lib/exchangeRates';

export const SavingsSection: React.FC<{ 
  milestones: any[], 
  accounts: any[], 
  accountBalances: Record<string, number>,
  transactions: any[],
  onDeleteMilestone: (ms: any) => void,
  onArchiveMilestone?: (ms: any) => void,
  onEditMilestone?: (ms: any) => void,
  onSelectMilestone?: (ms: any) => void,
  onAddTransaction: (ms: any) => void,
  onAddGoal: () => void,
  currency: string,
  exchangeRates?: any
}> = ({
  milestones,
  accounts,
  accountBalances,
  transactions,
  onDeleteMilestone,
  onArchiveMilestone,
  onEditMilestone,
  onSelectMilestone,
  onAddTransaction,
  onAddGoal,
  currency,
  exchangeRates
}) => {
  const { t } = useTranslation();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

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

  const getRateToAED = (curr: string) => {
    const c = curr || 'AED';
    if (c === 'AED') return 1;
    return (exchangeRates && exchangeRates[c]) || (DEFAULT_RATES as any)[c] || 1;
  };
  const baseRateToAED = getRateToAED(currency);

  const getAccountBalanceInBase = (accountId: string) => {
    const currentBalance = accountBalances[accountId] || 0;
    const acc = accounts.find(a => a.id === accountId || a.accountId === accountId);
    if (!acc) return Math.max(0, currentBalance);
    const rate = getRateToAED(acc.currency);
    const balInAED = currentBalance * rate;
    return Math.max(0, balInAED / baseRateToAED);
  };

  const getTransactionAmountInBase = (tx: any) => {
    const amt = Number(tx.amount) || 0;
    const rate = getRateToAED(tx.currency || 'AED');
    const amtInAED = amt * rate;
    return amtInAED / baseRateToAED;
  };

  // Use optional chaining and default to empty array to prevent crashes
  const activeMilestones = Array.isArray(milestones) 
    ? milestones.filter(m => !m.isArchived) 
    : [];

  // Calculate total saved
  const totalSaved = activeMilestones.reduce((sum, m) => {
    const linkedAccountIds = m.linkedAccountIds || [];
    const linkedBalancesSum = linkedAccountIds.reduce((s: number, id: string) => s + getAccountBalanceInBase(id), 0);
    const effectiveCurrentValue = linkedAccountIds.length > 0 ? linkedBalancesSum : Math.max(0, Number(m.currentValue) || 0);
    return sum + Math.max(0, effectiveCurrentValue);
  }, 0);

  return (
    <section>
      <h2 className="text-xl font-bold text-[#111C2D] mb-6" style={{ fontFamily: "'Google Sans', sans-serif" }}>
        {t('essentials.savings_goals', 'Savings Goals')}
      </h2>
      
      {/* Total Saved Card */}
      <div className="bg-white rounded-2xl border border-[#E1E8ED] p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-1" ref={tooltipRef}>
          <div className="text-[12px] font-bold text-gray-500" style={{ fontFamily: "'Google Sans', sans-serif" }}>
            {t('savings_section.total_saved')}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic(hapticPresets.light);
                setShowTooltip(!showTooltip);
              }}
              className="w-5 h-5 rounded-full bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-bold flex items-center justify-center transition-colors cursor-pointer shadow-xs"
              title="More details"
            >
              i
            </button>
            <AnimatePresence>
              {showTooltip && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 4 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 bottom-full mb-2 w-72 p-3 bg-white rounded-xl shadow-xl border border-neutral-200 text-xs text-neutral-700 z-[999] font-normal leading-relaxed text-left"
                  onClick={(e) => e.stopPropagation()}
                >
                  Below you can see your savings goals and track the progress on individual goals and see a dashboard with your total progress.
                  <div className="absolute right-3 top-full w-2 h-2 bg-white border-r border-b border-neutral-200 transform rotate-45 -mt-1"></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="text-3xl font-bold text-[#111C2D] mb-2 privacy-balance" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          {currency} {totalSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#E8F8EE] text-[#366945] text-xs font-bold">
          <TrendingUp size={12} />
          {t('savings_section.comparison_gain')}
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-bold text-gray-500" style={{ fontFamily: "'Google Sans', sans-serif" }}>
            {t('savings_section.active_goals')}
        </h3>
        <button 
          onClick={() => {
            triggerHaptic(hapticPresets.medium);
            onAddGoal();
          }} 
          className="text-xs text-[#366945] font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E8F8EE] hover:bg-[#d5f3df] transition-all cursor-pointer border-none shadow-xs"
        >
          <Plus size={16} /> {t('savings_section.add_goal')}
        </button>
      </div>

      {/* Goals List */}
      <div className="flex flex-col gap-4">
        {activeMilestones.length > 0 ? (
          activeMilestones.map(m => {
            // Find linked accounts
            const linkedAccountIds = m.linkedAccountIds || []; 
            const linkedBalancesSum = linkedAccountIds.reduce((sum: number, id: string) => sum + getAccountBalanceInBase(id), 0);
            
            // Updated current value to use linked account balances if available, otherwise fallback
            const effectiveCurrentValue = Math.max(0, linkedAccountIds.length > 0 ? linkedBalancesSum : (Number(m.currentValue) || 0));
            const tar = Number(m.targetAmount) || 0;
            const progress = tar > 0 ? Math.min((effectiveCurrentValue / tar) * 100, 100) : 0;

            // Calculate estimated completion
            const remaining = Math.max(0, tar - effectiveCurrentValue);
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            const recentCredits = transactions.filter(t => 
              linkedAccountIds.includes(t.toAccountId) && 
              t.amount > 0 && 
              new Date(t.date) >= threeMonthsAgo
            );
            const avgMonthlyContribution = recentCredits.reduce((sum, t) => sum + getTransactionAmountInBase(t), 0) / 3;
            
            let estCompletionDate = null;
            if (avgMonthlyContribution > 0 && remaining > 0) {
              const monthsNeeded = remaining / avgMonthlyContribution;
              const date = new Date();
              date.setMonth(date.getMonth() + Math.ceil(monthsNeeded));
              estCompletionDate = date;
            }

            return (
              <div 
                key={m.id || Math.random()} 
                onClick={() => {
                  triggerHaptic(hapticPresets.light);
                  if (onSelectMilestone) onSelectMilestone(m);
                }}
                className="p-4 bg-white rounded-2xl border border-[#E1E8ED] hover:border-[#366945]/40 transition-all shadow-sm cursor-pointer group relative"
              >
                {/* Top Row: Goal Name & Action Buttons */}
                <div className="flex justify-between items-center gap-3 mb-3">
                  <div className="text-sm font-bold text-[#111C2D] flex items-center gap-2 flex-wrap min-w-0">
                    <span className="break-words">{(translateCategoryOrSubcategory(m.name, t) || t('savings_section.unnamed_goal')) as string}</span>
                    <span className="text-[10px] font-bold text-[#366945] bg-[#E8F8EE] px-2 py-0.5 rounded-md inline-flex items-center gap-1 opacity-90 group-hover:opacity-100">
                      <BarChart2 size={11} />
                      {t('savings_section.view_chart', 'Monthly Payments')}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic(hapticPresets.medium);
                        onAddTransaction(m);
                      }} 
                      title={t('savings_section.add_transaction', 'Add Transaction')} 
                      className="p-1.5 rounded-lg text-[#366945] bg-[#E8F8EE] hover:bg-[#d5f3df] transition-all cursor-pointer border-none flex items-center justify-center shrink-0"
                    >
                      <Plus size={19} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic(hapticPresets.heavy);
                        onDeleteMilestone(m);
                      }} 
                      title={t('common.delete', 'Delete')} 
                      className="p-1.5 rounded-lg text-rose-500 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 transition-all cursor-pointer border-none flex items-center justify-center shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Middle Row: Icon, Est completion & Amounts */}
                <div className="flex justify-between items-center gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-[#E8F8EE] rounded-xl flex items-center justify-center shrink-0 text-[#366945] group-hover:scale-105 transition-all">
                      <Target size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] text-gray-500">
                        {t('savings_section.est_completion')} <span className="font-bold text-gray-900">{estCompletionDate ? estCompletionDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : t('common.na', 'N/A')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-[#111C2D] privacy-balance">{currency} {effectiveCurrentValue.toLocaleString()}</div>
                    <div className="text-[12px] text-gray-400 privacy-balance">{t('savings_section.of_target')} {currency} {tar.toLocaleString()}</div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden mb-2">
                  <div 
                    className="h-full bg-[#A6DDB1] rounded-full transition-all duration-500" 
                    style={{ width: `${progress}%` }} 
                  />
                </div>
                
                <div className="flex justify-between items-center text-[12px] font-bold text-[#366945]">
                  <span>{progress.toFixed(0)}% {t('savings_section.reached')}</span>
                  <span className="text-gray-400 font-normal group-hover:text-[#366945] transition-colors text-[11px]">
                    {t('savings_section.tap_for_chart', 'Tap to view payment breakdown →')}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-6 text-sm text-neutral-400">
            {t('savings_section.no_active_goals')}
          </div>
        )}
      </div>
    </section>
  );
};