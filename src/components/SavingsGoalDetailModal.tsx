import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Target, Plus, Edit2, Archive, TrendingUp, Calendar, ArrowUpRight, CheckCircle2, DollarSign, Wallet } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid, ReferenceLine } from 'recharts';
import { translateCategoryOrSubcategory } from '../lib/stringUtils';
import { triggerHaptic, hapticPresets } from '../lib/haptics';
import { DEFAULT_RATES } from '../lib/exchangeRates';

interface SavingsGoalDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  goal: any | null;
  accounts: any[];
  accountBalances: Record<string, number>;
  transactions: any[];
  onEdit: (goal: any) => void;
  onArchive?: (goal: any) => void;
  onAddTransaction: (goal: any) => void;
  currency: string;
  exchangeRates?: any;
}

export const SavingsGoalDetailModal: React.FC<SavingsGoalDetailModalProps> = ({
  isOpen,
  onClose,
  goal,
  accounts = [],
  accountBalances = {},
  transactions = [],
  onEdit,
  onArchive,
  onAddTransaction,
  currency,
  exchangeRates,
}) => {
  const { t } = useTranslation();
  const [chartTimeframe, setChartTimeframe] = useState<'6m' | '12m'>('6m');

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('goal-detail-modal-toggled', { detail: { isOpen } }));
    if (isOpen) {
      document.body.classList.add('hide-header-footer');
    } else {
      document.body.classList.remove('hide-header-footer');
    }
    return () => {
      window.dispatchEvent(new CustomEvent('goal-detail-modal-toggled', { detail: { isOpen: false } }));
      document.body.classList.remove('hide-header-footer');
    };
  }, [isOpen]);

  const goalId = goal?.id || '';
  const linkedAccountIds: string[] = goal?.linkedAccountIds || [];

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

  // Calculate current saved value
  const linkedBalancesSum = useMemo(() => {
    if (linkedAccountIds.length === 0) return Math.max(0, Number(goal?.currentValue) || 0);
    return Math.max(0, linkedAccountIds.reduce((sum, id) => sum + getAccountBalanceInBase(id), 0));
  }, [linkedAccountIds, accountBalances, goal, accounts, exchangeRates, currency]);

  const targetAmount = Number(goal?.targetAmount) || 0;
  const progressPercent = targetAmount > 0 ? Math.min((linkedBalancesSum / targetAmount) * 100, 100) : 0;
  const remainingAmount = Math.max(0, targetAmount - linkedBalancesSum);
  const monthsToTarget = Number(goal?.monthsToTarget) || 12;

  // Monthly target payment recommendation
  const targetMonthlyPayment = useMemo(() => {
    if (remainingAmount <= 0) return 0;
    return Math.round(remainingAmount / Math.max(1, monthsToTarget));
  }, [remainingAmount, monthsToTarget]);

  // Filter payment & contribution transactions linked to this savings goal
  const goalTransactions = useMemo(() => {
    if (!goalId && linkedAccountIds.length === 0) return [];
    return transactions.filter(tx => {
      if (!tx || tx.status === 'draft') return false;
      const matchesGoalId = tx.goalId === goalId || tx.milestoneId === goalId;
      const matchesLinkedAccount = linkedAccountIds.includes(tx.toAccountId) || linkedAccountIds.includes(tx.accountId);
      const matchesCategory = goal?.name && (tx.category === goal.name || tx.subcategory === goal.name);
      return (matchesGoalId || matchesLinkedAccount || matchesCategory) && (tx.amount > 0);
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [goalId, linkedAccountIds, goal?.name, transactions]);

  // Generate monthly chart data for monthly payments (contributions)
  const monthlyPaymentChartData = useMemo(() => {
    const monthsCount = chartTimeframe === '6m' ? 6 : 12;
    const result = [];
    const now = new Date();

    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const yearMonthKey = `${year}-${monthStr}`;

      // Sum all payment contributions made in this specific month
      const monthTxList = goalTransactions.filter(tx => {
        if (!tx.date) return false;
        const txDateStr = typeof tx.date === 'string' ? tx.date.substring(0, 7) : '';
        return txDateStr === yearMonthKey;
      });

      const actualMonthlyPaid = monthTxList.reduce((sum, tx) => sum + Math.abs(getTransactionAmountInBase(tx)), 0);
      const monthLabel = d.toLocaleDateString(undefined, { month: 'short' });

      result.push({
        month: monthLabel,
        fullDateKey: yearMonthKey,
        paid: actualMonthlyPaid,
        target: targetMonthlyPayment,
        txCount: monthTxList.length,
        isCurrent: i === 0,
      });
    }

    return result;
  }, [chartTimeframe, goalTransactions, targetMonthlyPayment, exchangeRates, currency]);

  // Average monthly payment calculation
  const averageMonthlyPayment = useMemo(() => {
    const nonZeroMonths = monthlyPaymentChartData.filter(m => m.paid > 0);
    if (nonZeroMonths.length === 0) return 0;
    const sum = nonZeroMonths.reduce((acc, m) => acc + m.paid, 0);
    return Math.round(sum / nonZeroMonths.length);
  }, [monthlyPaymentChartData]);

  if (!isOpen || !goal) return null;

  const displayGoalName = (translateCategoryOrSubcategory(goal.name, t) || t('savings_section.unnamed_goal')) as string;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[230] flex items-center justify-center p-3 sm:p-5 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative w-full max-w-2xl bg-white border border-[#E1E8ED] rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden z-10"
          style={{ fontFamily: "'Google Sans', sans-serif" }}
        >
          {/* Header */}
          <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-4 p-5 sm:p-6 border-b border-gray-100 bg-white sticky top-0 z-20">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className="w-11 h-11 rounded-2xl bg-[#E8F8EE] flex items-center justify-center text-[#366945] shrink-0 shadow-xs">
                <Target size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-lg font-bold text-[#111C2D] break-words leading-tight">
                  {displayGoalName}
                </h2>
                <p className="text-xs text-gray-500 font-normal mt-0.5">
                  {t('savings_detail.target_horizon', 'Target Horizon')}: <span className="font-bold text-gray-800">{monthsToTarget} {t('common.months', 'months')}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(hapticPresets.medium);
                  onEdit(goal);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#366945] bg-[#E8F8EE] hover:bg-[#d5f3df] transition-all cursor-pointer border-none shadow-2xs"
              >
                <Edit2 size={14} />
                <span>{t('common.edit', 'Edit Goal')}</span>
              </button>

              {onArchive && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(hapticPresets.light);
                    onArchive(goal);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer border-none shadow-2xs"
                  title={t('common.archive', 'Archive')}
                >
                  <Archive size={14} />
                  <span>{goal?.isArchived ? t('common.restore', 'Restore') : t('common.archive', 'Archive')}</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer border-none"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
            {/* Top Overview Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Saved vs Target */}
              <div className="p-3.5 rounded-2xl bg-gray-50/80 border border-gray-200/80">
                <div className="text-[11px] font-normal text-gray-500 mb-0.5">
                  {t('savings_detail.current_saved', 'Current Saved')}
                </div>
                <div className="text-lg sm:text-xl font-bold text-[#111C2D] privacy-balance">
                  {currency} {linkedBalancesSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-gray-400 font-normal mt-0.5">
                  {t('savings_section.of_target')} {currency} {targetAmount.toLocaleString()}
                </div>
              </div>

              {/* Remaining Needed */}
              <div className="p-3.5 rounded-2xl bg-gray-50/80 border border-gray-200/80">
                <div className="text-[11px] font-normal text-gray-500 mb-0.5">
                  {t('savings_detail.remaining_needed', 'Remaining Needed')}
                </div>
                <div className="text-lg sm:text-xl font-bold text-[#111C2D] privacy-balance">
                  {currency} {remainingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-[#366945] font-bold mt-0.5">
                  {progressPercent.toFixed(1)}% {t('savings_section.reached', 'reached')}
                </div>
              </div>

              {/* Target Monthly Contribution */}
              <div className="p-3.5 rounded-2xl bg-[#E8F8EE]/60 border border-[#A6DDB1]/40">
                <div className="text-[11px] font-normal text-[#2e593a] mb-0.5">
                  {t('savings_detail.monthly_target', 'Target Monthly Payment')}
                </div>
                <div className="text-lg sm:text-xl font-bold text-[#111C2D] privacy-balance">
                  {currency} {targetMonthlyPayment.toLocaleString()}
                </div>
                <div className="text-[11px] text-[#366945] font-normal mt-0.5">
                  {t('savings_detail.avg_paid', 'Avg paid')}: <span className="font-bold">{currency} {averageMonthlyPayment.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5 bg-white p-4 rounded-2xl border border-gray-200/80">
              <div className="flex justify-between items-center text-xs">
                <span className="font-normal text-gray-500">{t('savings_detail.overall_progress', 'Overall Savings Progress')}</span>
                <span className="font-bold text-[#366945]">{progressPercent.toFixed(1)}%</span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#366945] to-[#A6DDB1] rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Monthly Payments Chart Section */}
            <div className="bg-white rounded-2xl border border-[#E1E8ED] p-5 shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#111C2D] flex items-center gap-2">
                    <TrendingUp size={16} className="text-[#366945]" />
                    {t('savings_detail.monthly_payments_chart', 'Monthly Payments Chart')}
                  </h3>
                  <p className="text-[11px] text-gray-500 font-normal mt-0.5">
                    {t('savings_detail.monthly_payments_desc', 'Track your monthly savings deposits and payments over time')}
                  </p>
                </div>

                {/* 6m vs 12m toggle */}
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(hapticPresets.light);
                      setChartTimeframe('6m');
                    }}
                    className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all border-none cursor-pointer ${
                      chartTimeframe === '6m'
                        ? 'bg-white text-[#111C2D] shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    6 {t('common.months', 'months')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(hapticPresets.light);
                      setChartTimeframe('12m');
                    }}
                    className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all border-none cursor-pointer ${
                      chartTimeframe === '12m'
                        ? 'bg-white text-[#111C2D] shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    12 {t('common.months', 'months')}
                  </button>
                </div>
              </div>

              {/* Chart Component */}
              <div className="h-56 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyPaymentChartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F3F6" />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 500 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#9CA3AF', fontSize: 10 }}
                      tickFormatter={(val) => `${val}`}
                    />
                    <Tooltip
                      cursor={{ fill: '#F8FAFC' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-[#111C2D] text-white p-3 rounded-xl shadow-xl border border-gray-700 text-xs space-y-1">
                              <div className="font-bold text-gray-300 border-b border-gray-700 pb-1">
                                {data.month} ({data.fullDateKey})
                              </div>
                              <div className="text-emerald-400 font-bold text-sm">
                                {currency} {data.paid.toLocaleString()}
                              </div>
                              <div className="text-[10px] text-gray-400 font-normal">
                                {data.txCount} {data.txCount === 1 ? 'payment deposit' : 'payment deposits'}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {targetMonthlyPayment > 0 && (
                      <ReferenceLine
                        y={targetMonthlyPayment}
                        stroke="#94A3B8"
                        strokeDasharray="4 4"
                      />
                    )}
                    <Bar dataKey="paid" radius={[6, 6, 0, 0]} maxBarSize={36}>
                      {monthlyPaymentChartData.map((entry, idx) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={entry.paid > 0 ? '#366945' : '#E2E8F0'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {targetMonthlyPayment > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-600 px-2 pt-3 border-t border-gray-100">
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-0.5 border-t-2 border-dashed border-slate-400 inline-block"></span>
                    <span className="font-normal">{t('savings_detail.monthly_target', 'Target Monthly Payment')}</span>
                  </span>
                  <span className="font-bold text-[#111C2D] privacy-balance">
                    {currency} {targetMonthlyPayment.toLocaleString()}
                  </span>
                </div>
              )}
            </div>


          </div>

          {/* Modal Footer Actions */}
          <div className="p-4 sm:p-5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-xs font-bold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-all cursor-pointer shadow-2xs"
            >
              {t('common.close', 'Close')}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
