import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '@/lib/i18n';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { 
  X, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Landmark, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  ChevronRight,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';
import { getSimulatedDate } from '../lib/dateSimulator';
import { DEFAULT_RATES } from '../lib/exchangeRates';

interface WeekendWrapUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: any[];
  accounts: any[];
  profile: any;
  accountBalances: Record<string, number>;
}

export const WeekendWrapUpModal: React.FC<WeekendWrapUpModalProps> = ({
  isOpen,
  onClose,
  transactions = [],
  accounts = [],
  profile = {},
  accountBalances = {}
}) => {
  const { t } = useTranslation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [fetchedGoals, setFetchedGoals] = useState<any[]>([]);
  const totalSlides = 3;

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('hide-header-footer');
    } else {
      document.body.classList.remove('hide-header-footer');
    }
    return () => {
      document.body.classList.remove('hide-header-footer');
    };
  }, [isOpen]);

  // Reset to first slide when modal opens and fetch goals
  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
      setIsPlaying(true);

      const uid = profile?.uid;
      if (uid) {
        try {
          const cached = localStorage.getItem(`vantage_offline_goals_${uid}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setFetchedGoals(parsed);
            }
          }
        } catch (e) {}

        const unsub = onSnapshot(collection(db, `users/${uid}/goals`), (snap) => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (items.length > 0) {
            setFetchedGoals(items);
            localStorage.setItem(`vantage_offline_goals_${uid}`, JSON.stringify(items));
          }
        }, (err) => {
          console.warn("WeekendWrapUp: Error fetching goals:", err);
        });

        return () => unsub();
      }
    }
  }, [isOpen, profile?.uid]);

  // Story progress timer (10 seconds per slide = 30-second story experience)
  useEffect(() => {
    if (!isOpen || !isPlaying) return;

    const timer = setInterval(() => {
      setCurrentSlide((prev) => {
        if (prev < totalSlides - 1) {
          return prev + 1;
        } else {
          setIsPlaying(false);
          return prev;
        }
      });
    }, 10000);

    return () => clearInterval(timer);
  }, [isOpen, isPlaying, totalSlides]);

  // 1. Time Window Calculations (Current Week / Past 7 Days / Fallback to Current Month)
  const now = getSimulatedDate();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - daysSinceMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  // Filter transactions for this week
  const weeklyTxs = (transactions || []).filter((tx: any) => {
    if (!tx?.date) return false;
    const txDate = new Date(tx.date);
    return txDate >= startOfWeek && txDate <= now;
  });

  // Fallback to past 7 days if weeklyTxs is empty
  const past7DaysTxs = weeklyTxs.length > 0 ? weeklyTxs : (transactions || []).filter((tx: any) => {
    if (!tx?.date) return false;
    const txDate = new Date(tx.date);
    const diffDays = (now.getTime() - txDate.getTime()) / (1000 * 3600 * 24);
    return diffDays >= 0 && diffDays <= 7;
  });

  // Final fallback to current month if past 7 days is also empty (ensuring zero is never shown when user has transactions)
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentMonthTxs = (transactions || []).filter((tx: any) => {
    if (!tx?.date) return false;
    const txDate = new Date(tx.date);
    return !isNaN(txDate.getTime()) && txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth;
  });

  const activeTxs = past7DaysTxs.length > 0 ? past7DaysTxs : (currentMonthTxs.length > 0 ? currentMonthTxs : (transactions || []));

  // 2. Metrics calculation
  const incomeTxs = activeTxs.filter((tx: any) => {
    const t = (tx.type || tx.transactionType || '').toLowerCase();
    return t === 'income' || t === 'inflow' || t === 'credit' || (!['expense', 'outflow', 'debit'].includes(t) && Number(tx.amount || 0) > 0);
  });
  const expenseTxs = activeTxs.filter((tx: any) => {
    const t = (tx.type || tx.transactionType || '').toLowerCase();
    const isInc = t === 'income' || t === 'inflow' || t === 'credit';
    return t === 'expense' || t === 'outflow' || t === 'debit' || (!isInc && Number(tx.amount || 0) < 0);
  });

  const incomeCount = incomeTxs.length;
  const expenseCount = expenseTxs.length;
  const totalTxCount = incomeCount + expenseCount;

  const currency = profile?.baseCurrency || 'AED';

  const totalSpent = expenseTxs.reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
  const totalReceived = incomeTxs.reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
  const netCashFlow = totalReceived - totalSpent;

  // 3. Savings Goals percentage calculation
  const savingsMilestones = fetchedGoals.length > 0
    ? fetchedGoals.filter((m: any) => !m.isArchived && (m.type === 'savings' || !m.type))
    : Array.isArray(profile?.savingsMilestones)
    ? profile.savingsMilestones.filter((m: any) => !m.isArchived)
    : Array.isArray(profile?.milestones)
    ? profile.milestones.filter((m: any) => !m.isArchived)
    : [];

  const getRateToAED = (curr: string) => {
    const c = curr || 'AED';
    if (c === 'AED') return 1;
    const rates = profile?.exchangeRates || DEFAULT_RATES;
    return rates[c] || (DEFAULT_RATES as any)[c] || 1;
  };
  const primaryCurr = profile?.baseCurrency || profile?.currency || 'AED';
  const baseRateToAED = getRateToAED(primaryCurr);

  let totalSavedAmount = 0;
  let totalSavingsTarget = 0;

  savingsMilestones.forEach((m: any) => {
    const linkedAccountIds = m.linkedAccountIds || [];
    const linkedBalancesSum = linkedAccountIds.reduce((sum: number, id: string) => {
      const acc = accounts.find((a: any) => a.id === id || a.accountId === id);
      const bal = Math.max(0, accountBalances[id] || 0);
      const rate = getRateToAED(acc?.currency || 'AED');
      return sum + ((bal * rate) / baseRateToAED);
    }, 0);
    const effectiveCurrent = Math.max(0, linkedAccountIds.length > 0 ? linkedBalancesSum : (Number(m.currentValue) || 0));
    const target = Number(m.targetAmount) || 0;
    
    totalSavedAmount += effectiveCurrent;
    totalSavingsTarget += target;
  });

  const savingsGoalsPercentage = totalSavingsTarget > 0 
    ? Math.min(100, Math.round((totalSavedAmount / totalSavingsTarget) * 100))
    : (profile?.savingsGoalsProgress ? Math.round(profile.savingsGoalsProgress) : 0);

  // 4. Debt milestones percentage calculation
  const debtAccounts = (accounts || []).filter((acc: any) => 
    ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(acc.type)
  );

  let startingDebtTotal = 0;
  let currentDebtTotal = 0;

  debtAccounts.forEach((acc: any) => {
    startingDebtTotal += Math.abs(Number(acc.startingBalance) || 0);
    currentDebtTotal += Math.abs(Number(acc.currentBalance) || 0);
  });

  const debtPaidAmount = Math.max(0, startingDebtTotal - currentDebtTotal);
  const debtMilestonesPercentage = startingDebtTotal > 0
    ? Math.min(100, Math.round((debtPaidAmount / startingDebtTotal) * 100))
    : (profile?.debtMilestonesProgress ? Math.round(profile.debtMilestonesProgress) : 0);

  const displayName = profile?.displayName || profile?.fullName || 'User';

  const dateOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const formattedWeekEnding = now.toLocaleDateString(undefined, dateOptions);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-[#E1E8ED] flex flex-col"
          style={{ fontFamily: "'Google Sans', sans-serif" }}
        >
          {/* Top Story Header & Progress Bar */}
          <div className="bg-[#111C2D] text-white p-5 pt-4">
            {/* Story Progress Indicators (3 bars for 30s story) */}
            <div className="flex gap-1.5 mb-3">
              {[0, 1, 2].map((idx) => (
                <div 
                  key={idx}
                  onClick={() => { setCurrentSlide(idx); setIsPlaying(false); }}
                  className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden cursor-pointer"
                >
                  <motion.div
                    className="h-full bg-[#A6DDB1]"
                    initial={{ width: idx < currentSlide ? '100%' : '0%' }}
                    animate={{ 
                      width: idx < currentSlide 
                        ? '100%' 
                        : idx === currentSlide && isPlaying 
                        ? '100%' 
                        : idx === currentSlide 
                        ? '50%' 
                        : '0%' 
                    }}
                    transition={{ 
                      duration: idx === currentSlide && isPlaying ? 10 : 0.2, 
                      ease: 'linear' 
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#A6DDB1]/20 flex items-center justify-center text-[#A6DDB1]">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-tight text-white">
                    {t('weekend_wrapup.title', 'Weekend Wrap-Up')}
                  </h3>
                  <p className="text-[11px] text-neutral-300 font-normal">
                    {t('weekend_wrapup.subtitle', 'Sunday Evening Story • Week ending')} {formattedWeekEnding}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer border-none transition-colors"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer border-none transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Slide Content Container */}
          <div className="p-6 min-h-[360px] flex flex-col justify-between bg-[#F8FAFC]">
            <AnimatePresence mode="wait">
              {/* SLIDE 0: Warm 30-Second Text Snippet Note */}
              {currentSlide === 0 && (
                <motion.div
                  key="slide-0"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col gap-4"
                >
                  <div className="bg-white p-5 rounded-2xl border border-[#E1E8ED] shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#366945] mb-2">
                      <Sparkles size={14} />
                      <span>{t('weekend_wrapup.warm_note_heading', 'Weekly Reflection & Summary')}</span>
                    </div>

                    <p className="text-sm text-[#111C2D] leading-relaxed font-normal mb-3">
                      {t('weekend_wrapup.greeting', 'Happy Sunday Evening')}, <span className="font-bold">{displayName}</span>! 👋
                    </p>

                    <p className="text-sm text-[#475569] leading-relaxed font-normal">
                      {t('weekend_wrapup.story_body_text', 'Here is your 30-second weekend wrap-up snippet. This week, you logged')} <span className="font-bold text-[#111C2D]">{totalTxCount} transactions</span> ({incomeCount} {t('weekend_wrapup.income', 'income')}, {expenseCount} {t('weekend_wrapup.expenses', 'expenses')}). {t('weekend_wrapup.received_text', 'You received')} <span className="font-bold text-[#2E7D32]">{currency} {totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> {t('weekend_wrapup.and_spent_text', 'and spent')} <span className="font-bold text-[#C62828]">{currency} {totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>.
                    </p>
                  </div>

                  {/* 5 Details Quick Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white rounded-xl border border-[#E1E8ED] shadow-sm">
                      <div className="text-[11px] font-normal text-neutral-500 mb-1">
                        {t('weekend_wrapup.transactions_label', 'Transactions Added')}
                      </div>
                      <div className="text-base font-bold text-[#111C2D]">
                        {totalTxCount} <span className="text-xs font-normal text-neutral-500">({incomeCount} In / {expenseCount} Out)</span>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-[#E1E8ED] shadow-sm">
                      <div className="text-[11px] font-normal text-neutral-500 mb-1">
                        {t('weekend_wrapup.net_flow_label', 'Net Cash Flow')}
                      </div>
                      <div className={`text-base font-bold ${netCashFlow >= 0 ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>
                        {netCashFlow >= 0 ? '+' : ''}{currency} {netCashFlow.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-[#E1E8ED] shadow-sm">
                      <div className="text-[11px] font-normal text-neutral-500 mb-1">
                        {t('weekend_wrapup.savings_progress_label', 'Savings Goals')}
                      </div>
                      <div className="text-base font-bold text-[#1E3A8A] flex items-center gap-1">
                        <Target size={14} className="text-[#2563EB]" />
                        {savingsGoalsPercentage}%
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-[#E1E8ED] shadow-sm">
                      <div className="text-[11px] font-normal text-neutral-500 mb-1">
                        {t('weekend_wrapup.debt_progress_label', 'Debt Milestones')}
                      </div>
                      <div className="text-base font-bold text-[#5B21B6] flex items-center gap-1">
                        <Landmark size={14} className="text-[#7C3AED]" />
                        {debtMilestonesPercentage}%
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* SLIDE 1: Income vs Spent Breakdown */}
              {currentSlide === 1 && (
                <motion.div
                  key="slide-1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col gap-4"
                >
                  <div className="bg-white p-4 rounded-2xl border border-[#E1E8ED] shadow-sm">
                    <div className="text-xs font-bold text-neutral-500 mb-3">
                      {t('weekend_wrapup.cash_flow_headline', 'Weekly Cash Flow Analysis')}
                    </div>

                    {/* Money Received */}
                    <div className="p-3.5 bg-[#E8F8EE] rounded-xl border border-[#C8E6C9] mb-3">
                      <div className="flex justify-between items-center mb-1">
                        <div className="text-xs font-normal text-[#2E7D32] flex items-center gap-1.5">
                          <TrendingUp size={14} />
                          <span>{t('weekend_wrapup.money_received', 'Money Received')}</span>
                        </div>
                        <span className="text-xs font-bold text-[#2E7D32]">{incomeCount} {t('weekend_wrapup.tx_count', 'txs')}</span>
                      </div>
                      <div className="text-2xl font-bold text-[#111C2D]">
                        {currency} {totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Money Spent */}
                    <div className="p-3.5 bg-[#FFEBEE] rounded-xl border border-[#FFCDD2]">
                      <div className="flex justify-between items-center mb-1">
                        <div className="text-xs font-normal text-[#C62828] flex items-center gap-1.5">
                          <TrendingDown size={14} />
                          <span>{t('weekend_wrapup.money_spent', 'Money Spent')}</span>
                        </div>
                        <span className="text-xs font-bold text-[#C62828]">{expenseCount} {t('weekend_wrapup.tx_count', 'txs')}</span>
                      </div>
                      <div className="text-2xl font-bold text-[#111C2D]">
                        {currency} {totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {/* Cash flow balance bar */}
                  <div className="bg-white p-4 rounded-2xl border border-[#E1E8ED] shadow-sm">
                    <div className="flex justify-between text-xs font-normal text-neutral-600 mb-1.5">
                      <span>{t('weekend_wrapup.income_vs_spent', 'Income vs Spent Ratio')}</span>
                      <span className="font-bold text-[#111C2D]">
                        {totalReceived + totalSpent > 0 
                          ? `${Math.round((totalReceived / (totalReceived + totalSpent)) * 100)}% / ${Math.round((totalSpent / (totalReceived + totalSpent)) * 100)}%`
                          : '0% / 0%'}
                      </span>
                    </div>
                    <div className="w-full bg-neutral-100 h-2.5 rounded-full overflow-hidden flex">
                      <div 
                        className="bg-[#2E7D32] h-full" 
                        style={{ width: `${totalReceived + totalSpent > 0 ? (totalReceived / (totalReceived + totalSpent)) * 100 : 50}%` }}
                      />
                      <div 
                        className="bg-[#C62828] h-full" 
                        style={{ width: `${totalReceived + totalSpent > 0 ? (totalSpent / (totalReceived + totalSpent)) * 100 : 50}%` }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* SLIDE 2: Goals & Debt Milestones Progress */}
              {currentSlide === 2 && (
                <motion.div
                  key="slide-2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col gap-4"
                >
                  {/* Savings Goals Card */}
                  <div className="bg-white p-4 rounded-2xl border border-[#E1E8ED] shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-[#2563EB]">
                          <Target size={16} />
                        </div>
                        <span className="text-xs font-bold text-[#111C2D]">{t('weekend_wrapup.savings_goals', 'Savings Goals')}</span>
                      </div>
                      <span className="text-base font-bold text-[#2563EB]">{savingsGoalsPercentage}%</span>
                    </div>

                    <div className="w-full bg-neutral-100 rounded-full h-2 mb-2">
                      <div 
                        className="bg-[#2563EB] h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${savingsGoalsPercentage}%` }}
                      />
                    </div>

                    <div className="text-[11px] font-normal text-neutral-500">
                      {currency} {totalSavedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t('weekend_wrapup.saved_of', 'saved of')} {currency} {totalSavingsTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t('weekend_wrapup.target', 'target')}
                    </div>
                  </div>

                  {/* Debt Milestones Card */}
                  <div className="bg-white p-4 rounded-2xl border border-[#E1E8ED] shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#F3E8FF] flex items-center justify-center text-[#7C3AED]">
                          <Landmark size={16} />
                        </div>
                        <span className="text-xs font-bold text-[#111C2D]">{t('weekend_wrapup.debt_milestones', 'Debt Milestones')}</span>
                      </div>
                      <span className="text-base font-bold text-[#7C3AED]">{debtMilestonesPercentage}%</span>
                    </div>

                    <div className="w-full bg-neutral-100 rounded-full h-2 mb-2">
                      <div 
                        className="bg-[#7C3AED] h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${debtMilestonesPercentage}%` }}
                      />
                    </div>

                    <div className="text-[11px] font-normal text-neutral-500">
                      {currency} {debtPaidAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t('weekend_wrapup.paid_of', 'paid off of')} {currency} {startingDebtTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t('weekend_wrapup.total_debt', 'total liability')}
                    </div>
                  </div>

                  {/* Encouraging Closing Note */}
                  <div className="bg-[#E8F8EE] p-3.5 rounded-2xl border border-[#C8E6C9] flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-[#2E7D32] shrink-0" />
                    <p className="text-xs text-[#2E7D32] font-normal leading-snug">
                      {t('weekend_wrapup.closing_encouragement', 'Great discipline this week! You are consistently building strong habits for long-term financial freedom.')}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom Controls Bar */}
            <div className="pt-4 border-t border-[#E1E8ED] flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                {currentSlide > 0 && (
                  <button
                    onClick={() => { setCurrentSlide(currentSlide - 1); setIsPlaying(false); }}
                    className="px-3 py-2 bg-white border border-[#E1E8ED] rounded-xl text-xs font-bold text-[#111C2D] hover:bg-neutral-50 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <ArrowLeft size={14} />
                    <span>{t('common.back', 'Back')}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {currentSlide < totalSlides - 1 ? (
                  <button
                    onClick={() => { setCurrentSlide(currentSlide + 1); setIsPlaying(false); }}
                    className="px-4 py-2 bg-[#111C2D] text-white rounded-xl text-xs font-bold hover:bg-[#1E293B] flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>{t('weekend_wrapup.next_card', 'Next Card')}</span>
                    <ChevronRight size={14} />
                  </button>
                ) : (
                  <button
                    onClick={onClose}
                    className="px-5 py-2 bg-[#2E7D32] text-white rounded-xl text-xs font-bold hover:bg-[#1B5E20] flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <CheckCircle2 size={14} />
                    <span>{t('weekend_wrapup.done_button', 'Complete Wrap-Up')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
};
