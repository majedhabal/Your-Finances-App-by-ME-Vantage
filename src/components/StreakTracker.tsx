import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { Flame, X, ChevronLeft, ChevronRight, Gift, Repeat } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { REWARDS } from '../lib/badgeUtils';

interface StreakTrackerProps {
  profile: any;
  streakUpdated?: boolean;
  userLogins: any[];
}

export const StreakTracker: React.FC<StreakTrackerProps> = ({ profile, streakUpdated, userLogins }) => {
  const { t } = useTranslation();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [recurringTransactions, setRecurringTransactions] = useState<any[]>([]);

  // Normalize dates safely using local date components to prevent UTC vs Local off-by-one errors on mobile APKs
  const toLocalDateString = (dateInput: any) => {
    if (!dateInput) return '';
    const date = typeof dateInput === 'string' || typeof dateInput === 'number'
      ? new Date(dateInput)
      : (dateInput.toDate ? dateInput.toDate() : dateInput);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    if (!profile?.uid) return;
    const q = collection(db, `users/${profile.uid}/recurringTransactions`);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const rawDate = data.nextExecutionDate || data.nextGenerationDate || data.startDate || data.date;
        let dateStr = '';
        if (rawDate) {
          if (typeof rawDate.toDate === 'function') {
            dateStr = toLocalDateString(rawDate.toDate());
          } else if (rawDate instanceof Date) {
            dateStr = toLocalDateString(rawDate);
          } else {
            dateStr = toLocalDateString(rawDate);
          }
        }
        if (dateStr) {
          items.push({
            id: doc.id,
            date: dateStr,
            title: data.title || data.notes || 'Recurring Transaction',
            ...data
          });
        }
      });
      setRecurringTransactions(items);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  const loginDateStrings = new Set(
    (userLogins || []).map(login => {
      const loginDate = login.date || (login.timestamp ? (login.timestamp.toDate ? login.timestamp.toDate() : new Date(login.timestamp)) : new Date());
      return toLocalDateString(loginDate);
    })
  );

  let calculatedStreak = 0;
  let checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);
  
  // If not logged in today, start checking from yesterday
  if (!loginDateStrings.has(toLocalDateString(checkDate))) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (loginDateStrings.has(toLocalDateString(checkDate))) {
    calculatedStreak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  const streak = Math.max(profile?.dailyStreak || 0, calculatedStreak);
  
  const rewardMap = new Map();
  (profile.rewardHistory || []).forEach((r: any) => rewardMap.set(r.dateClaimed, r.id));

  // Upcoming rewards
  const upcomingRewardMap = new Map();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  REWARDS.forEach(reward => {
    if (streak < reward.streakThreshold) {
      const daysUntil = reward.streakThreshold - streak;
      const targetDate = new Date(today);
      targetDate.setUTCDate(today.getUTCDate() + daysUntil);
      upcomingRewardMap.set(toLocalDateString(targetDate), reward.id);
    }
  });
  
  // Optional: Update Firestore if streak was 0 but calculated streak > 0
  // Note: This would require access to db and profileRef, which StreakTracker doesn't have.
  // I will just use the calculated streak in the UI for now.

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0-6 (Sun-Sat)

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const paddingDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  
  return (
    <div className="relative">
      <motion.div 
        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF5E6] border border-[#FFD9A3]/50 cursor-pointer"
        onClick={() => setIsCalendarOpen(!isCalendarOpen)}
        animate={streakUpdated ? { scale: [1, 1.1, 1] } : { scale: [1, 1.05, 1] }}
        transition={streakUpdated ? { duration: 1.5, repeat: 3, ease: "easeInOut" } : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Flame size={14} className="text-orange-500 fill-orange-500" />
        <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-xs text-neutral-800 font-normal">
          {t('streak_tracker.streak', 'Streak')}:
        </span>
        <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-sm text-neutral-900 font-bold">
          {streak}
        </span>
      </motion.div>

      <AnimatePresence>
        {isCalendarOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-12 right-0 w-64 bg-white border border-neutral-200 rounded-2xl shadow-xl z-[60] p-4"
          >
            <div className="flex justify-between items-center mb-4">
              <button onClick={goToPrevMonth}><ChevronLeft size={16} /></button>
              <span className="font-bold text-sm">{monthName}</span>
              <button onClick={goToNextMonth}><ChevronRight size={16} /></button>
              <button onClick={() => setIsCalendarOpen(false)}><X size={16} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                <div key={day} className="text-[10px] text-neutral-400 text-center">{day}</div>
              ))}
              {paddingDays.map((_, i) => <div key={`padding-${i}`} />)}
              {days.map((day) => {
                const date = new Date(Date.UTC(year, month, day));
                const dateString = toLocalDateString(date);
                const isActive = loginDateStrings.has(dateString);
                const isPast = new Date(Date.UTC(year, month, day)) < today;
                const isSkipped = isPast && !isActive;
                const rewardId = rewardMap.get(dateString);
                const upcomingRewardId = upcomingRewardMap.get(dateString);
                const recurringOnThisDay = recurringTransactions.filter(r => r.date === dateString);
                const hasRecurring = recurringOnThisDay.length > 0;

                return (
                  <div 
                    key={`day-${year}-${month}-${day}`} 
                    className={`w-7 h-7 flex flex-col items-center justify-center text-xs rounded-full relative ${isActive ? 'bg-orange-500 text-white font-bold' : isSkipped ? 'bg-red-100 text-red-500 font-bold' : 'bg-neutral-100'}`}
                    title={hasRecurring ? `Recurring: ${recurringOnThisDay.map(r => r.title).join(', ')}` : undefined}
                  >
                    {rewardId && <Gift size={10} className="absolute -top-1 -right-1 text-yellow-500" />}
                    {upcomingRewardId && !rewardId && <Gift size={12} className="absolute -top-1 -right-1 text-yellow-500 opacity-70" />}
                    {hasRecurring && (
                      <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-600 rounded-full flex items-center justify-center shadow-xs text-white" title={`Recurring: ${recurringOnThisDay.map(r => r.title).join(', ')}`}>
                        <Repeat size={8} />
                      </div>
                    )}
                    <span>{day}</span>
                    {isSkipped && <span className="text-[8px] leading-none">X</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-neutral-100 flex justify-between items-center text-xs text-neutral-600" style={{ fontFamily: "'Google Sans', sans-serif" }}>
              <span>Streak Freezes</span>
              <div className="flex gap-1">
                {Array.from({ length: profile?.streakFreezes || 0 }).map((_, i) => (
                  <img key={i} src="/badges/Streak Freeze No BG.png" alt="Streak Freeze" className="w-5 h-5" />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
