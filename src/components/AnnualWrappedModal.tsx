import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '@/lib/i18n';
import { 
  X, 
  Sparkles, 
  Trophy, 
  Flame, 
  TrendingUp, 
  ShoppingBag, 
  Share2, 
  Copy, 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  Play, 
  Pause, 
  RotateCcw, 
  Calendar, 
  Award, 
  Star, 
  Zap, 
  ShieldCheck,
  Target,
  Crown,
  HeartHandshake
} from 'lucide-react';
import { getSimulatedDate } from '../lib/dateSimulator';
import { triggerHaptic, hapticPresets } from '../lib/haptics';

interface AnnualWrappedModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: any[];
  accounts: any[];
  profile: any;
  accountBalances: Record<string, number>;
}

export const AnnualWrappedModal: React.FC<AnnualWrappedModalProps> = ({
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
  const [copiedToast, setCopiedToast] = useState(false);
  const totalSlides = 6;

  const cardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  // Target Year Determination (e.g. 2026 or current/previous year)
  const now = getSimulatedDate();
  const currentYear = now.getFullYear();
  // If viewing in early Jan (Jan 1 - Jan 15), default to previous year's wrapped; otherwise current year wrapped
  const defaultTargetYear = (now.getMonth() === 0 && now.getDate() <= 15) ? currentYear - 1 : currentYear;
  const [selectedYear, setSelectedYear] = useState<number>(defaultTargetYear);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
      setIsPlaying(true);
      setCopiedToast(false);
    }
  }, [isOpen]);

  // Story progress timer (6 seconds per slide)
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
    }, 6000);

    return () => clearInterval(timer);
  }, [isOpen, isPlaying, totalSlides]);

  // Keyboard Navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1));
        setIsPlaying(false);
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlide((prev) => Math.max(prev - 1, 0));
        setIsPlaying(false);
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, totalSlides, onClose]);

  // Touch Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX.current - touchEndX;

    if (Math.abs(diffX) > 40) {
      if (diffX > 0) {
        // Swipe Left -> Next slide
        setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1));
      } else {
        // Swipe Right -> Previous slide
        setCurrentSlide((prev) => Math.max(prev - 1, 0));
      }
      setIsPlaying(false);
      triggerHaptic(hapticPresets.light);
    }
    touchStartX.current = null;
  };

  // 1. Data Filtering for Selected Year
  const yearTxs = (transactions || []).filter((tx: any) => {
    if (!tx?.date) return false;
    const txYear = new Date(tx.date).getFullYear();
    return txYear === selectedYear;
  });

  // Fallback if sparse user data (use all transactions if target year is empty)
  const activeTxs = yearTxs.length >= 3 ? yearTxs : (transactions || []);

  const currency = profile?.baseCurrency || 'AED';
  const displayName = profile?.displayName || profile?.fullName || 'Financial Pioneer';

  // 2. Financial Metrics Calculation
  const incomeTxs = activeTxs.filter((tx: any) => tx.type === 'income' || tx.type === 'credit');
  const expenseTxs = activeTxs.filter((tx: any) => tx.type === 'expense' || tx.type === 'debit');

  const totalIncome = incomeTxs.reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
  const totalExpense = expenseTxs.reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
  const totalSaved = Math.max(0, totalIncome - totalExpense);
  const savingsRate = totalIncome > 0 ? Math.min(100, Math.round((totalSaved / totalIncome) * 100)) : 0;

  // 3. Top Merchants & Frequent Spots Analysis
  const merchantMap: Record<string, { count: number; totalSpent: number }> = {};
  expenseTxs.forEach((tx: any) => {
    let name = tx.description || tx.payee || tx.merchant || tx.category || 'General Expense';
    name = name.trim();
    if (!name) name = 'General Expense';
    if (!merchantMap[name]) {
      merchantMap[name] = { count: 0, totalSpent: 0 };
    }
    merchantMap[name].count += 1;
    merchantMap[name].totalSpent += Number(tx.amount) || 0;
  });

  const sortedMerchants = Object.entries(merchantMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  const topMerchant = sortedMerchants.length > 0 ? sortedMerchants[0] : { name: 'Local Businesses', count: 12, totalSpent: totalExpense * 0.25 };
  const runnerUpMerchants = sortedMerchants.slice(1, 4);

  // 4. Category Breakdown Analysis
  const categoryMap: Record<string, number> = {};
  expenseTxs.forEach((tx: any) => {
    const cat = tx.category || 'General';
    categoryMap[cat] = (categoryMap[cat] || 0) + (Number(tx.amount) || 0);
  });

  const sortedCategories = Object.entries(categoryMap)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  const topCategory = sortedCategories.length > 0 ? sortedCategories[0] : { name: 'Essential Living', amount: totalExpense * 0.4 };
  const topCategoryPercent = totalExpense > 0 ? Math.round((topCategory.amount / totalExpense) * 100) : 40;

  // 5. Monthly Savings Breakdown -> Golden Month
  const monthlySavingsMap: Record<number, number> = {};
  activeTxs.forEach((tx: any) => {
    if (!tx?.date) return;
    const d = new Date(tx.date);
    const m = d.getMonth(); // 0-11
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income' || tx.type === 'credit') {
      monthlySavingsMap[m] = (monthlySavingsMap[m] || 0) + amt;
    } else {
      monthlySavingsMap[m] = (monthlySavingsMap[m] || 0) - amt;
    }
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  let bestMonthIndex = 10; // Default November if equal
  let maxMonthSavings = -Infinity;
  Object.entries(monthlySavingsMap).forEach(([mStr, val]) => {
    const m = Number(mStr);
    if (val > maxMonthSavings) {
      maxMonthSavings = val;
      bestMonthIndex = m;
    }
  });

  const goldenMonthName = monthNames[bestMonthIndex] || 'November';
  const goldenMonthSaved = maxMonthSavings > 0 ? maxMonthSavings : Math.round(totalSaved / 4);

  // 6. Lifestyle Financial Archetype Determination
  let archetypeKey = 'strategic_financial_pioneer';
  let archetypeDescKey = 'balancing_steady_wealth';
  let archetypeIcon = ShieldCheck;

  if (savingsRate >= 35) {
    archetypeKey = 'master_wealth_builder';
    archetypeDescKey = 'master_wealth_desc';
    archetypeIcon = Crown;
  } else if (topCategory.name.toLowerCase().includes('dining') || topCategory.name.toLowerCase().includes('food')) {
    archetypeKey = 'connoisseur_flavor';
    archetypeDescKey = 'connoisseur_desc';
    archetypeIcon = HeartHandshake;
  } else if (topCategory.name.toLowerCase().includes('travel') || topCategory.name.toLowerCase().includes('flight')) {
    archetypeKey = 'global_adventurer';
    archetypeDescKey = 'global_adventurer_desc';
    archetypeIcon = Zap;
  } else if (topCategory.name.toLowerCase().includes('groceries') || topCategory.name.toLowerCase().includes('home')) {
    archetypeKey = 'savvy_home_director';
    archetypeDescKey = 'savvy_home_desc';
    archetypeIcon = Target;
  }

  const archetype = t(`annual_wrapped.${archetypeKey}`);
  const archetypeDescription = t(`annual_wrapped.${archetypeDescKey}`);

  const userStreak = profile?.dailyStreak || 1;
  const badgesCount = (profile?.claimedRewards || []).filter((r: string) => r.startsWith('badge_')).length || 2;

  // Social Share Action
  const handleShare = async () => {
    triggerHaptic(hapticPresets.heavy);
    const shareText = `✨ My ${selectedYear} Financial Story on YOUR FINANCES:\n` +
      `💰 Total Saved: ${currency} ${totalSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n` +
      `📈 Savings Rate: ${savingsRate}%\n` +
      `🏆 #1 Merchant: ${topMerchant.name}\n` +
      `⭐ Top Category: ${topCategory.name}\n` +
      `👑 Archetype: ${archetype}\n` +
      `🔥 Active Streak: ${userStreak} Days\n\n` +
      `Track your future financial freedom at https://yourfinances.me`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `YOUR FINANCES ${selectedYear} Wrapped`,
          text: shareText,
          url: 'https://yourfinances.me'
        });
        return;
      } catch (err) {
        // Fallback to clipboard if share rejected or unsupported
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
    } catch (err) {
      console.warn("Clipboard copy deferred:", err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 30 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            ref={cardRef}
            className="relative w-full max-w-md bg-[#0D131F] text-white rounded-3xl shadow-2xl overflow-hidden border border-white/10 flex flex-col min-h-[580px] max-h-[90vh]"
            style={{ fontFamily: "'Google Sans', sans-serif" }}
          >
            {/* Top Story Header & Segmented Progress Bar */}
            <div className="p-4 pb-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent relative z-20">
              {/* Progress Indicators */}
              <div className="flex gap-1.5 mb-3">
                {Array.from({ length: totalSlides }).map((_, idx) => (
                  <div 
                    key={idx}
                    onClick={() => { setCurrentSlide(idx); setIsPlaying(false); triggerHaptic(hapticPresets.light); }}
                    className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden cursor-pointer"
                  >
                    <motion.div
                      className="h-full bg-gradient-to-r from-[#34D399] to-[#F59E0B]"
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
                        duration: idx === currentSlide && isPlaying ? 6 : 0.2, 
                        ease: 'linear' 
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#34D399]/30 to-[#F59E0B]/30 flex items-center justify-center text-[#34D399]">
                    <Sparkles size={14} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold leading-none text-white tracking-normal">
                      YOUR FINANCES • {selectedYear} {t('annual_wrapped.title')}
                    </h3>
                    <p className="text-[10px] text-neutral-400 font-normal mt-0.5">
                      {t('annual_wrapped.annual_financial_story_for', { name: displayName })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
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

            {/* Slide Interactive Content Canvas */}
            <div className="flex-1 p-6 flex flex-col justify-between relative z-10 overflow-y-auto">
              <AnimatePresence mode="wait">
                {/* SLIDE 0: Cinematic Cover Intro */}
                {currentSlide === 0 && (
                  <motion.div
                    key="slide-0"
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col justify-between h-full py-4"
                  >
                    <div className="space-y-4 text-center mt-4">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-normal text-[#34D399]">
                        <Calendar size={12} />
                        <span>{t('annual_wrapped.annual_reflection')}</span>
                      </div>

                      <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#34D399] via-[#F59E0B] to-[#EC4899]">
                          {t('annual_wrapped.your_year_financial_story', { year: selectedYear })}
                        </span>
                      </h1>

                      <p className="text-sm text-neutral-300 font-normal leading-relaxed max-w-xs mx-auto">
                        {t('annual_wrapped.hey_name', { name: displayName })}, {t('annual_wrapped.story_intro')}
                      </p>
                    </div>

                    <div className="my-6 p-5 rounded-2xl bg-gradient-to-br from-white/10 via-white/5 to-transparent border border-white/10 text-center space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-full bg-[#34D399]/20 flex items-center justify-center text-[#34D399] mb-1">
                        <Trophy size={24} />
                      </div>
                      <div className="text-2xl font-bold text-white">
                        {t('annual_wrapped.transactions_count', { count: activeTxs.length })}
                      </div>
                      <div className="text-xs font-normal text-neutral-400">
                        {t('annual_wrapped.tracked_in_year', { year: selectedYear })}
                      </div>
                    </div>

                    <div className="text-center pt-2">
                      <button
                        onClick={() => { setCurrentSlide(1); setIsPlaying(true); triggerHaptic(hapticPresets.medium); }}
                        className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#34D399] to-[#059669] text-slate-950 text-sm font-bold shadow-lg hover:brightness-110 flex items-center justify-center gap-2 cursor-pointer transition-all border-none"
                      >
                        <span>{t('annual_wrapped.start_story')}</span>
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* SLIDE 1: Total Savings & Net Growth */}
                {currentSlide === 1 && (
                  <motion.div
                    key="slide-1"
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col justify-between h-full py-2 space-y-4"
                  >
                    <div>
                      <div className="text-xs font-bold text-[#34D399] flex items-center gap-1.5 mb-2">
                        <TrendingUp size={14} />
                        <span>{t('annual_wrapped.savings_victory')}</span>
                      </div>
                      <h2 className="text-2xl font-bold text-white">
                        {t('annual_wrapped.built_momentum')}
                      </h2>
                    </div>

                    <div className="p-6 rounded-3xl bg-gradient-to-br from-[#065F46]/40 via-[#047857]/20 to-transparent border border-[#34D399]/30 text-center space-y-3 shadow-xl">
                      <div className="text-xs font-normal text-emerald-200">
                        {t('annual_wrapped.total_net_savings')}
                      </div>
                      <div className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                        {currency} {totalSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#34D399]/20 text-xs font-bold text-[#34D399]">
                        <Sparkles size={12} />
                        <span>{savingsRate}% {t('annual_wrapped.savings_rate')}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                        <div className="text-[11px] font-normal text-neutral-400">{t('annual_wrapped.total_income')}</div>
                        <div className="text-base font-bold text-emerald-400 mt-1">
                          {currency} {totalIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                        <div className="text-[11px] font-normal text-neutral-400">{t('annual_wrapped.total_expenses')}</div>
                        <div className="text-base font-bold text-rose-400 mt-1">
                          {currency} {totalExpense.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs font-normal text-neutral-300 text-center leading-relaxed">
                      {t('annual_wrapped.prioritizing_savings_msg')}
                    </p>
                  </motion.div>
                )}

                {/* SLIDE 2: Top Merchant Spotlight */}
                {currentSlide === 2 && (
                  <motion.div
                    key="slide-2"
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col justify-between h-full py-2 space-y-4"
                  >
                    <div>
                      <div className="text-xs font-bold text-[#F59E0B] flex items-center gap-1.5 mb-2">
                        <ShoppingBag size={14} />
                        <span>{t('annual_wrapped.top_merchant_spotlight')}</span>
                      </div>
                      <h2 className="text-2xl font-bold text-white">
                        {t('annual_wrapped.your_favorite_spot')}
                      </h2>
                    </div>

                    {/* #1 Merchant Big Card */}
                    <div className="p-5 rounded-3xl bg-gradient-to-br from-[#78350F]/50 via-[#B45309]/20 to-transparent border border-[#F59E0B]/40 text-center space-y-2">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F59E0B]/20 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B]">
                        <Crown size={22} />
                      </div>
                      <div className="text-xl font-bold text-white">
                        {topMerchant.name}
                      </div>
                      <div className="text-2xl font-bold text-[#F59E0B]">
                        {currency} {topMerchant.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs font-normal text-amber-200/80">
                        {t('annual_wrapped.recorded_visits', { count: topMerchant.count, year: selectedYear })}
                      </div>
                    </div>

                    {/* Runner Up Merchants */}
                    {runnerUpMerchants.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold text-neutral-400">{t('annual_wrapped.other_frequent_favorites')}</div>
                        <div className="space-y-1.5">
                          {runnerUpMerchants.map((m, idx) => (
                            <div key={idx} className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex justify-between items-center text-xs">
                              <span className="font-normal text-white">#{idx + 2} {m.name}</span>
                              <span className="font-bold text-amber-400">{currency} {m.totalSpent.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* SLIDE 3: Lifestyle Archetype & Categories */}
                {currentSlide === 3 && (
                  <motion.div
                    key="slide-3"
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col justify-between h-full py-2 space-y-4"
                  >
                    <div>
                      <div className="text-xs font-bold text-[#EC4899] flex items-center gap-1.5 mb-2">
                        <Award size={14} />
                        <span>{t('annual_wrapped.financial_archetype')}</span>
                      </div>
                      <h2 className="text-2xl font-bold text-white">
                        {t('annual_wrapped.who_you_were', { year: selectedYear })}
                      </h2>
                    </div>

                    <div className="p-5 rounded-3xl bg-gradient-to-br from-[#831843]/50 via-[#BE185D]/20 to-transparent border border-[#EC4899]/40 text-center space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-[#EC4899]/20 border border-[#EC4899]/30 flex items-center justify-center text-[#EC4899]">
                        <Star size={24} />
                      </div>
                      <div className="text-xl font-bold text-white">
                        {archetype}
                      </div>
                      <p className="text-xs font-normal text-pink-200/90 leading-relaxed px-2">
                        {archetypeDescription}
                      </p>
                    </div>

                    {/* Streak & Badges Metrics */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-center">
                        <div className="flex items-center justify-center gap-1 text-amber-400 mb-1">
                          <Flame size={16} />
                          <span className="text-lg font-bold">{t('annual_wrapped.days_count', { count: userStreak })}</span>
                        </div>
                        <div className="text-[11px] font-normal text-neutral-400">{t('annual_wrapped.daily_login_streak')}</div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-center">
                        <div className="flex items-center justify-center gap-1 text-emerald-400 mb-1">
                          <Trophy size={16} />
                          <span className="text-lg font-bold">{t('annual_wrapped.earned_badges', { count: badgesCount })}</span>
                        </div>
                        <div className="text-[11px] font-normal text-neutral-400">{t('annual_wrapped.milestone_badges')}</div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* SLIDE 4: Golden Month Peak */}
                {currentSlide === 4 && (
                  <motion.div
                    key="slide-4"
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col justify-between h-full py-2 space-y-4"
                  >
                    <div>
                      <div className="text-xs font-bold text-[#6366F1] flex items-center gap-1.5 mb-2">
                        <Zap size={14} />
                        <span>{t('annual_wrapped.golden_month')}</span>
                      </div>
                      <h2 className="text-2xl font-bold text-white">
                        {t('annual_wrapped.your_peak_financial_month')}
                      </h2>
                    </div>

                    <div className="p-6 rounded-3xl bg-gradient-to-br from-[#312E81]/50 via-[#4338CA]/20 to-transparent border border-[#6366F1]/40 text-center space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-full bg-[#6366F1]/20 flex items-center justify-center text-[#6366F1]">
                        <Calendar size={24} />
                      </div>
                      <div className="text-2xl font-bold text-white">
                        {goldenMonthName}
                      </div>
                      <div className="text-3xl font-bold text-[#818CF8]">
                        +{currency} {goldenMonthSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-xs font-normal text-indigo-200/80">
                        {t('annual_wrapped.highest_net_financial_gain', { year: selectedYear })}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                        <ShieldCheck size={20} />
                      </div>
                      <p className="text-xs text-neutral-300 font-normal leading-relaxed">
                        {t('annual_wrapped.discipline_peaked_msg', { month: goldenMonthName })}
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* SLIDE 5: Social Shareable Summary Card */}
                {currentSlide === 5 && (
                  <motion.div
                    key="slide-5"
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col justify-between h-full py-2 space-y-3"
                  >
                    <div>
                      <div className="text-xs font-bold text-[#34D399] flex items-center gap-1.5 mb-1">
                        <Sparkles size={14} />
                        <span>{t('annual_wrapped.share_your_story')}</span>
                      </div>
                      <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                        {t('annual_wrapped.wrapped_summary')}
                      </h2>
                    </div>

                    {/* Spotify-Wrapped Style Visual Card */}
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] border border-[#34D399]/40 space-y-2.5 shadow-2xl relative overflow-hidden" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      <div className="absolute top-0 right-0 w-32 h-32 bg-[#34D399]/10 rounded-full blur-2xl pointer-events-none" />

                      <div className="flex justify-between items-center border-b border-white/10 pb-2">
                        <div className="text-xs font-bold text-white">YOUR FINANCES</div>
                        <div className="text-[10px] font-normal text-[#34D399]">{t('annual_wrapped.wrapped_year_label', { year: selectedYear })}</div>
                      </div>

                      <div className="text-sm font-bold text-white">{displayName}</div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                          <div className="text-[10px] font-normal text-neutral-400">{t('annual_wrapped.total_saved')}</div>
                          <div className="font-bold text-emerald-400">{currency} {totalSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        </div>

                        <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                          <div className="text-[10px] font-normal text-neutral-400">{t('annual_wrapped.savings_rate')}</div>
                          <div className="font-bold text-amber-400">{savingsRate}%</div>
                        </div>

                        <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                          <div className="text-[10px] font-normal text-neutral-400">{t('annual_wrapped.top_spot')}</div>
                          <div className="font-bold text-white truncate">{topMerchant.name}</div>
                        </div>

                        <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                          <div className="text-[10px] font-normal text-neutral-400 font-normal">{t('annual_wrapped.streak')}</div>
                          <div className="font-bold text-amber-400">{t('annual_wrapped.days_count', { count: userStreak })}</div>
                        </div>
                      </div>

                      <div className="pt-1 text-[11px] font-bold text-[#EC4899] flex items-center gap-1">
                        <Crown size={12} />
                        <span>{archetype}</span>
                      </div>
                    </div>

                    {/* Share Buttons & Actions */}
                    <div className="space-y-2 pt-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      <button
                        onClick={handleShare}
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#34D399] to-[#059669] text-slate-950 text-xs font-bold shadow-lg hover:brightness-110 flex items-center justify-center gap-2 cursor-pointer transition-all border-none"
                      >
                        <Share2 size={15} />
                        <span>{t('annual_wrapped.share_story_with_friends')}</span>
                      </button>

                      <div className="flex gap-2">
                        <button
                          onClick={() => { setCurrentSlide(0); setIsPlaying(true); }}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all border-none"
                        >
                          <RotateCcw size={14} />
                          <span>{t('annual_wrapped.replay_story')}</span>
                        </button>

                        <button
                          onClick={onClose}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all border-none"
                        >
                          <Check size={14} />
                          <span>{t('annual_wrapped.done')}</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bottom Nav Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between mt-2">
                <button
                  disabled={currentSlide === 0}
                  onClick={() => { setCurrentSlide(currentSlide - 1); setIsPlaying(false); triggerHaptic(hapticPresets.light); }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 text-white text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer border-none"
                >
                  <ChevronLeft size={14} />
                  <span>{t('annual_wrapped.prev')}</span>
                </button>

                <div className="text-[11px] font-normal text-neutral-400">
                  {currentSlide + 1} / {totalSlides}
                </div>

                <button
                  disabled={currentSlide === totalSlides - 1}
                  onClick={() => { setCurrentSlide(currentSlide + 1); setIsPlaying(false); triggerHaptic(hapticPresets.light); }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 text-white text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer border-none"
                >
                  <span>{t('annual_wrapped.next')}</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Copied Toast Notification */}
            <AnimatePresence>
              {copiedToast && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#34D399] text-slate-950 px-4 py-2 rounded-full text-xs font-bold shadow-2xl flex items-center gap-1.5"
                >
                  <Check size={14} />
                  <span>Story summary copied to clipboard!</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
