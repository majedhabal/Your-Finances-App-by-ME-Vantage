import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '@/lib/i18n';
import { 
  Coffee, X, Play, Pause, RotateCcw, Volume2, VolumeX, 
  Sparkles, Flame, Calendar, Landmark, Wallet, TrendingUp, CheckCircle2, AlertCircle
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, doc, updateDoc } from 'firebase/firestore';
import { triggerHaptic, hapticPresets } from '../lib/haptics';
import { getCurrentPeriodYearMonth } from '../lib/salaryBreakdownUtils';
import { isTxMatchingBudget } from '../lib/transactionUtils';

interface MorningEspressoModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile?: any;
  accounts?: any[];
  transactions?: any[];
  accountBalances?: Record<string, number>;
  userLogins?: any[];
  setActiveTab?: (tab: any) => void;
  onUpdateProfile?: (profile: any) => void;
}

export const MorningEspressoModal: React.FC<MorningEspressoModalProps> = ({
  isOpen,
  onClose,
  profile = {},
  accounts = [],
  transactions = [],
  accountBalances = {},
  userLogins = [],
  setActiveTab,
  onUpdateProfile
}) => {
  const { t, i18n } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0); // 0 to 20 seconds
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [miniBudgets, setMiniBudgets] = useState<any[]>([]);
  const [salaryBreakdowns, setSalaryBreakdowns] = useState<any[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [fetchedLogins, setFetchedLogins] = useState<any[]>([]);

  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const progressIntervalRef = useRef<any>(null);

  // Currency
  const currency = profile?.baseCurrency || 'AED';

  const activeBreakdown = React.useMemo(() => {
    const activeYM = getCurrentPeriodYearMonth();
    return salaryBreakdowns.find(sb => sb.id === activeYM) || null;
  }, [salaryBreakdowns]);

  const confirmedBudgets = React.useMemo(() => {
    let list: any[] = [];

    // 1. Salary breakdown allocations if configured and active
    if (activeBreakdown && activeBreakdown.isBreakdownConfigured === true) {
      const allocations = activeBreakdown.allocations || {};
      const breakdownBudgets = Object.entries(allocations)
        .filter(([_, amt]) => Number(amt) > 0)
        .map(([key, amt]) => {
          const parts = key.split('__');
          
          const formatTitle = (str: string) => {
            return str.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          };

          const cat = parts[0] ? formatTitle(parts[0]) : 'General';
          const sub = parts[1] ? formatTitle(parts[1]) : '';
          
          let spentAmount = 0;
          if (transactions && transactions.length > 0 && activeBreakdown?.id) {
              const activeYM = activeBreakdown.id; 
              const [year, month] = activeYM.split('-').map(Number);
              const payday = Number(activeBreakdown.payday) || 28;
              
              const startDate = new Date(year, month - 1, payday);
              const endDate = new Date(year, month, payday - 1, 23, 59, 59);
              const startStr = startDate.toLocaleDateString('en-CA');
              const endStr = endDate.toLocaleDateString('en-CA');
              
              const dummyBudget = { categoryTitle: sub ? `${cat} > ${sub}` : cat, category: cat, subcategory: sub };
              
              spentAmount = transactions.filter((tx: any) => {
                 const matches = isTxMatchingBudget(tx, dummyBudget);
                 const isInRange = tx.date && tx.date >= startStr && tx.date <= endStr;
                 const t = (tx.type || tx.transactionType || '').toLowerCase();
                 const isInc = t === 'income' || t === 'inflow' || t === 'credit';
                 const isExp = t === 'expense' || t === 'outflow' || t === 'debit' || (!isInc && Number(tx.amount || 0) < 0);
                 return matches && isInRange && isExp;
              }).reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount || 0)), 0);
          }

          return {
            id: `breakdown_${key}`,
            categoryTitle: sub ? `${cat} > ${sub}` : cat,
            category: cat,
            subcategory: sub,
            allocatedAmount: Number(amt),
            spentAmount,
            currency: activeBreakdown.currency || currency
          };
        });
      list.push(...breakdownBudgets);
    }

    // 2. Active manual budgets (miniBudgets) set by user
    if (miniBudgets && miniBudgets.length > 0) {
      const manualBudgetsMapped = miniBudgets
        .filter((mb: any) => Number(mb.allocatedAmount || mb.limit || mb.maxBudget || mb.amount || 0) > 0)
        .map((mb: any) => {
          const title = mb.categoryTitle || mb.title || mb.name || 'Manual Budget';
          const allocated = Number(mb.allocatedAmount || mb.limit || mb.maxBudget || mb.amount || 0);

          let spentAmount = 0;
          if (transactions && transactions.length > 0) {
            const currentMonthStr = new Date().toISOString().substring(0, 7);
            const dummyBudget = { categoryTitle: title, category: mb.category || title, subcategory: mb.subcategory || '' };
            spentAmount = transactions.filter((tx: any) => {
              const matches = isTxMatchingBudget(tx, dummyBudget);
              const isInRange = tx.date && tx.date.startsWith(currentMonthStr);
              const t = (tx.type || tx.transactionType || '').toLowerCase();
              const isInc = t === 'income' || t === 'inflow' || t === 'credit';
              const isExp = t === 'expense' || t === 'outflow' || t === 'debit' || (!isInc && Number(tx.amount || 0) < 0);
              return matches && isInRange && isExp;
            }).reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount || 0)), 0);
          } else {
            spentAmount = Number(mb.spentAmount || mb.spent || 0);
          }

          return {
            id: `manual_${mb.id}`,
            categoryTitle: title,
            category: mb.category || title,
            subcategory: mb.subcategory || '',
            allocatedAmount: allocated,
            spentAmount,
            currency: mb.currency || currency
          };
        });
      list.push(...manualBudgetsMapped);
    }

    return list;
  }, [activeBreakdown, miniBudgets, currency, transactions]);

  const selectedBudgetIds = React.useMemo(() => {
    if (Array.isArray(profile?.espressoSelectedBudgets) && profile.espressoSelectedBudgets.length > 0) {
      return profile.espressoSelectedBudgets.filter((id: string) => confirmedBudgets.some(b => b.id === id));
    }
    return confirmedBudgets.slice(0, 3).map(b => b.id);
  }, [profile?.espressoSelectedBudgets, confirmedBudgets]);

  const handleToggleBudgetSelection = async (budgetId: string) => {
    triggerHaptic(hapticPresets.light);
    let updated: string[];
    if (selectedBudgetIds.includes(budgetId)) {
      updated = selectedBudgetIds.filter((id: string) => id !== budgetId);
    } else {
      if (selectedBudgetIds.length >= 3) {
        return;
      }
      updated = [...selectedBudgetIds, budgetId];
    }

    if (profile?.uid) {
      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, { espressoSelectedBudgets: updated });
      if (onUpdateProfile) {
        onUpdateProfile({ ...profile, espressoSelectedBudgets: updated });
      }
    }
  };

  // Listen to miniBudgets, salaryBreakdowns, recurring, and userLogins for live briefing math
  useEffect(() => {
    if (!profile?.uid) return;
    const unsubBudgets = onSnapshot(collection(db, `users/${profile.uid}/miniBudgets`), (snap) => {
      setMiniBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSalary = onSnapshot(collection(db, `users/${profile.uid}/salaryBreakdowns`), (snap) => {
      setSalaryBreakdowns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubRec = onSnapshot(collection(db, `users/${profile.uid}/recurringTransactions`), (snap) => {
      setRecurring(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubLogins = onSnapshot(collection(db, `users/${profile.uid}/userLogins`), (snap) => {
      setFetchedLogins(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubBudgets();
      unsubSalary();
      unsubRec();
      unsubLogins();
    };
  }, [profile?.uid]);

  // Compute Net Account Balances
  const totalNetBalance = React.useMemo(() => {
    if (accounts.length === 0) return 0;
    return accounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] ?? (acc.currentBalance || 0);
      if (acc.type === 'Credit Card' || acc.type === 'Personal Loan' || acc.type === 'Mortgage') {
        return sum + bal; // Note: liabilities are already stored negative or subtracted
      }
      return sum + bal;
    }, 0);
  }, [accounts, accountBalances]);

  // Compute Cash / Liquid Account Balances
  const { totalCashBalance, cashAccountCount } = React.useMemo(() => {
    const isLiabilityAccount = (acc: any) => {
      const t = (acc.type || '').toLowerCase();
      const bat = (acc.bankAccountType || '').toLowerCase();
      return ['credit', 'loan', 'mortgage', 'liability'].some(k => t.includes(k) || bat.includes(k)) && acc.loanDirection !== 'lent';
    };

    const cashAccs = (accounts || []).filter(acc => {
      if (acc.isArchived) return false;
      return !isLiabilityAccount(acc) && (
        ['bank', 'cash'].includes((acc.type || '').toLowerCase()) ||
        ['checking', 'savings', 'cash', 'salary'].includes((acc.bankAccountType || '').toLowerCase())
      );
    });
    const total = cashAccs.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] ?? (acc.currentBalance || 0);
      return sum + bal;
    }, 0);
    return { totalCashBalance: total, cashAccountCount: cashAccs.length };
  }, [accounts, accountBalances]);

  // Compute Checking Accounts & Today's Budget Runway
  const { checkingCount, dailyRunway, daysRemainingInMonth } = React.useMemo(() => {
    const checkingAccs = (accounts || []).filter(acc => {
      if (acc.isArchived) return false;
      const type = (acc.type || '').toLowerCase();
      const bat = (acc.bankAccountType || '').toLowerCase();
      return type === 'bank' && (bat === 'checking' || !bat);
    });

    const count = checkingAccs.length;
    const totalCheckingBal = checkingAccs.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] ?? (acc.currentBalance || 0);
      return sum + bal;
    }, 0);

    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysLeft = Math.max(1, lastDay - currentDay + 1);

    const basePool = totalCheckingBal > 0 ? totalCheckingBal : 5000;
    const runway = daysLeft > 0 ? (basePool / daysLeft) : 250;

    return { checkingCount: count, dailyRunway: runway, daysRemainingInMonth: daysLeft };
  }, [accounts, accountBalances]);

  // Compute Upcoming Payments in current month period
  const upcomingPayments = React.useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    // Check recurring transactions
    const recDues = recurring.filter(r => {
      if (!r.isActive) return false;
      if (!r.nextExecutionDate) return false;
      const d = r.nextExecutionDate.toDate ? r.nextExecutionDate.toDate() : new Date(r.nextExecutionDate);
      return d >= now && d <= endOfMonth;
    });

    // Check credit card due dates
    const ccDues = accounts.filter(acc => {
      if (acc.type !== 'Credit Card' || !acc.paymentDueDate) return false;
      const d = new Date(acc.paymentDueDate);
      return d >= now && d <= endOfMonth;
    });

    return {
      count: recDues.length + ccDues.length,
      items: [
        ...recDues.map(r => ({ title: r.title || 'Recurring Bill', amount: r.amount, currency: r.currency || currency })),
        ...ccDues.map(c => ({ title: c.name || 'Credit Card Payment', amount: Math.abs(accountBalances[c.id] || 0), currency: c.currency || currency }))
      ]
    };
  }, [recurring, accounts, accountBalances, currency]);

  // Active logins list (prop or real-time snapshot fallback)
  const activeLogins = userLogins && userLogins.length > 0 ? userLogins : fetchedLogins;

  // Dynamically compute active streak
  const streakDays = React.useMemo(() => {
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

    const loginDateStrings = new Set(
      (activeLogins || []).map(login => {
        const loginDate = login.date || (login.timestamp ? (login.timestamp.toDate ? login.timestamp.toDate() : new Date(login.timestamp)) : new Date());
        return toLocalDateString(loginDate);
      })
    );

    let calculatedStreak = 0;
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);
    
    if (!loginDateStrings.has(toLocalDateString(checkDate))) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (loginDateStrings.has(toLocalDateString(checkDate))) {
      calculatedStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    return Math.max(profile?.dailyStreak || 0, calculatedStreak, 1);
  }, [activeLogins, profile?.dailyStreak]);

  // Format currency helpers
  const formatMoney = (val: number) => {
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Generate 20-second Voice Script
  const generateVoiceScript = () => {
    const lang = (i18n.language || 'en').split('-')[0];
    const balanceStr = `${formatMoney(totalNetBalance)} ${currency}`;
    const cashBalanceStr = `${formatMoney(totalCashBalance)} ${currency}`;
    const runwayStr = `${formatMoney(dailyRunway)} ${currency}`;
    const count = upcomingPayments.count;

    if (lang === 'ar') {
      const cashStr = ` رصيدك النقدي هو ${cashBalanceStr}.`;
      const upcomingStr = count > 0 ? `لديك ${count} دفعة قادمة مستحقة هذا الشهر.` : `جميع المدفوعات القادمة هذا الشهر مسددة.`;
      return `صباح الخير! إليك موجز صباح المالية الخاص بك. إجمالي رصيدك هو ${balanceStr}.${cashStr} ميزانية اليوم تتيح ${runwayStr} للإنفاق الآمن. ${upcomingStr} سلسلة تسجيلك النشطة هي ${streakDays} أيام. نتمنى لك يومًا رائعًا!`;
    }
    if (lang === 'ru') {
      const cashStr = ` Наличный баланс составляет ${cashBalanceStr}.`;
      const upcomingStr = count > 0 ? `У вас есть ${count} предстоящих платежа в этом месяце.` : `Все предстоящие платежи в этом месяце чисты.`;
      return `Доброе утро! Вот ваша утренняя финансовая сводка. Общий баланс составляет ${balanceStr}.${cashStr} Дневной бюджет позволяет потратить ${runwayStr}. ${upcomingStr} Ваша активная серия записей составляет ${streakDays} дней. Отличного дня!`;
    }
    if (lang === 'es') {
      const cashStr = ` Tu saldo en efectivo es ${cashBalanceStr}.`;
      const upcomingStr = count > 0 ? `Tienes ${count} pago(s) próximo(s) este mes.` : `Todos los pagos próximos este mes están al día.`;
      return `¡Buenos días! Aquí tienes tu resumen financiero matutino. Tu saldo neto total es ${balanceStr}.${cashStr} El presupuesto diario permite ${runwayStr} de gastos seguros. ${upcomingStr} Tu racha activa es de ${streakDays} días. ¡Que tengas un gran día!`;
    }
    if (lang === 'ur') {
      const cashStr = ` آپ کا نقد بیلنس ${cashBalanceStr} ہے۔`;
      const upcomingStr = count > 0 ? `اس مہینے آپ کے ${count} آنے والے ادوات واجب الادا ہیں۔` : `اس مہینے کی تمام آنے والی ادائگیاں واضح ہیں۔`;
      return `صبح بخیر! یہاں آپ کی صبح کی مالی بریفنگ ہے۔ آپ کا کل بیلنس ${balanceStr} ہے۔${cashStr} آج کا بجٹ ${runwayStr} کی اجازت دیتا ہے۔ ${upcomingStr} آپ کا فعال سلسلہ ${streakDays} دن کا ہے۔ آپ کا دن اچھا گزرے!`;
    }
    if (lang === 'hi') {
      const cashStr = ` आपका नकद शेष ${cashBalanceStr} है।`;
      const upcomingStr = count > 0 ? `इस महीने आपके ${count} आगामी भुगतान देय हैं।` : `इस महीने के सभी आगामी भुगतान स्पष्ट हैं।`;
      return `सुप्रभात! यहाँ आपका सुबह का वित्तीय ब्रीफिंग है। आपका कुल शेष ${balanceStr} है।${cashStr} आज का बजट ${runwayStr} खर्च करने की अनुमति देता है। ${upcomingStr} आपकी सक्रिय स्ट्रीक ${streakDays} दिनों की है। आपका दिन शुभ हो!`;
    }
    if (lang === 'ko') {
      const cashStr = ` 현금 잔액은 ${cashBalanceStr}입니다.`;
      const upcomingStr = count > 0 ? `이번 달에 예정된 결제가 ${count}건 있습니다.` : `이번 달 예정된 결제가 모두 완료되었습니다.`;
      return `좋은 아침입니다! 오늘의 모닝 파이낸셜 에스프레소 브리핑입니다. 총 잔액은 ${balanceStr}입니다.${cashStr} 오늘의 일일 예산은 ${runwayStr}입니다. ${upcomingStr} 활성 연속 기록은 ${streakDays}일입니다. 멋진 하루 보내세요!`;
    }
    if (lang === 'tr' || lang === 'ts') {
      const cashStr = ` Nakit bakiyeniz ${cashBalanceStr}.`;
      const upcomingStr = count > 0 ? `Bu ay vadesi gelen ${count} ödemeniz var.` : `Bu ayki tüm yaklaşan ödemeler temiz.`;
      return `Günaydın! Sabah finansal özetiniz burada. Toplam net bakiyeniz ${balanceStr}.${cashStr} Bugünün bütçesi ${runwayStr} harcamaya izin veriyor. ${upcomingStr} Aktif seriniz ${streakDays} gün. Harika bir gün dilerim!`;
    }

    // Default English
    const cashStr = ` Your cash balance is ${cashBalanceStr}.`;
    const upcomingStr = count > 0 
      ? `You have ${count} upcoming payment${count > 1 ? 's' : ''} due this month.` 
      : `All upcoming payments for this month are clear.`;
    
    const selectedBudgetsList = confirmedBudgets.filter(b => selectedBudgetIds.includes(b.id));
    let budgetBriefStr = '';
    if (selectedBudgetsList.length > 0) {
      const budgetDetails = selectedBudgetsList.map(b => {
        const allocated = b.allocatedAmount || 0;
        const spent = b.spentAmount || 0;
        const remaining = Math.max(0, allocated - spent);
        return `${b.categoryTitle || 'Budget'} has ${formatMoney(remaining)} ${currency} remaining`;
      }).join('. ');
      budgetBriefStr = ` Budget highlights: ${budgetDetails}.`;
    }

    return `Good morning! Here is your Morning Financial Espresso briefing. Your net total balance is ${balanceStr}.${cashStr} Today's daily budget runway allows ${runwayStr} per day, sourced across ${checkingCount} checking account${checkingCount === 1 ? '' : 's'}. ${upcomingStr}${budgetBriefStr} Your active logging streak is ${streakDays} days strong. Have a wonderful day ahead!`;
  };

  // Web Audio synthetic ambient intro sound
  const playEspressoChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      
      // Warm twin oscillator chime (espresso theme)
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';
      
      osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, audioCtx.currentTime + 0.3); // E5
      osc1.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.6); // G5

      osc2.frequency.setValueAtTime(261.63, audioCtx.currentTime); // C4

      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 1.2);
      osc2.stop(audioCtx.currentTime + 1.2);
    } catch (e) {
      console.warn("Espresso chime playback error:", e);
    }
  };

  // Play audio brief
  const startAudioBrief = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();

      playEspressoChime();

      const lang = (i18n.language || 'en').split('-')[0];
      const text = generateVoiceScript();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = playbackSpeed;
      utterance.pitch = 1.0;
      utterance.volume = isMuted ? 0 : 1;
      utterance.lang = lang === 'ar' ? 'ar-SA' : lang === 'ru' ? 'ru-RU' : lang === 'es' ? 'es-ES' : lang === 'ur' ? 'ur-PK' : lang === 'hi' ? 'hi-IN' : lang === 'ko' ? 'ko-KR' : (lang === 'tr' || lang === 'ts') ? 'tr-TR' : 'en-US';

      // Select matching voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.lang.toLowerCase().startsWith(lang) || v.lang.toLowerCase().includes(lang));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onend = () => {
        setIsPlaying(false);
        setPlaybackTime(20);
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      };

      utterance.onerror = () => {
        setIsPlaying(false);
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      };

      synthRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
      setPlaybackTime(0);

      // Start 20-second progress animation
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      const startTime = Date.now();
      progressIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= 20) {
          setPlaybackTime(20);
          clearInterval(progressIntervalRef.current);
        } else {
          setPlaybackTime(elapsed);
        }
      }, 100);
    } else {
      // Fallback timer if speech synth not supported
      setIsPlaying(true);
      setPlaybackTime(0);
      let tSec = 0;
      progressIntervalRef.current = setInterval(() => {
        tSec += 0.2;
        if (tSec >= 20) {
          setIsPlaying(false);
          setPlaybackTime(20);
          clearInterval(progressIntervalRef.current);
        } else {
          setPlaybackTime(tSec);
        }
      }, 200);
    }
  };

  const stopAudioBrief = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      stopAudioBrief();
    } else {
      startAudioBrief();
    }
  };

  const handleReset = () => {
    stopAudioBrief();
    setPlaybackTime(0);
    startAudioBrief();
  };

  useEffect(() => {
    if (!isOpen) {
      stopAudioBrief();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-neutral-100 overflow-hidden my-auto"
          style={{ fontFamily: "'Google Sans', sans-serif" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* HEADER HERO GRAPHIC */}
          <div className="relative bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#111C2D] text-white p-6 pt-7 overflow-hidden">
            {/* Background Halo Deco */}
            <div className="absolute top-[-30px] right-[-30px] w-48 h-48 rounded-full bg-[#A6DDB1]/20 blur-3xl pointer-events-none" />
            <div className="absolute bottom-[-20px] left-[-20px] w-40 h-40 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />

            <div className="relative z-10 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                  <Coffee size={24} className="animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-normal tracking-wide px-2.5 py-0.5 rounded-full bg-white/10 text-amber-300 border border-white/10">
                      {t('morning_espresso.am_daily_briefing')}
                    </span>
                    <span className="text-[10px] font-normal text-neutral-400">20s {t('morning_espresso.audio')}</span>
                  </div>
                  <h2 className="text-xl font-bold text-white mt-1 leading-snug">
                    {t('morning_espresso.title')}
                  </h2>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-neutral-300 flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* AUDIO PLAYER CONTROLLER BAR */}
            <div className="mt-6 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTogglePlay}
                    className="w-12 h-12 rounded-full bg-[#A6DDB1] text-[#0F172A] flex items-center justify-center font-bold shadow-lg shadow-[#A6DDB1]/30 hover:scale-105 transition-transform"
                  >
                    {isPlaying ? <Pause size={22} className="fill-[#0F172A]" /> : <Play size={22} className="fill-[#0F172A] ml-0.5" />}
                  </button>

                  <div>
                    <div className="text-xs font-bold text-white">
                      {isPlaying ? t('morning_espresso.playing') : t('morning_espresso.press_play')}
                    </div>
                    <div className="text-[11px] font-normal text-neutral-300 mt-0.5">
                      0:{String(Math.floor(playbackTime)).padStart(2, '0')} / 0:20
                    </div>
                  </div>
                </div>

                {/* ANIMATED AUDIO WAVEFORM */}
                <div className="flex items-center gap-1 h-8 px-2">
                  {[40, 75, 50, 90, 60, 100, 45, 80, 55, 70].map((h, idx) => (
                    <motion.div
                      key={idx}
                      className="w-1 bg-[#A6DDB1] rounded-full"
                      animate={isPlaying ? { height: [`${h * 0.3}%`, `${h}%`, `${h * 0.4}%`] } : { height: '20%' }}
                      transition={isPlaying ? { repeat: Infinity, duration: 0.6 + (idx % 3) * 0.1, ease: 'easeInOut' } : { duration: 0.3 }}
                    />
                  ))}
                </div>
              </div>

              {/* PROGRESS SLIDER */}
              <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden mb-3">
                <div
                  className="bg-[#A6DDB1] h-full transition-all duration-200"
                  style={{ width: `${Math.min(100, (playbackTime / 20) * 100)}%` }}
                />
              </div>

              {/* AUDIO CONTROLS BOTTOM ROW */}
              <div className="flex items-center justify-between text-[11px] text-neutral-300 font-normal pt-1 border-t border-white/10">
                <div className="flex items-center gap-3">
                  <button onClick={handleReset} className="flex items-center gap-1 hover:text-white transition-colors">
                    <RotateCcw size={13} />
                    <span>{t('morning_espresso.replay')}</span>
                  </button>

                  <button
                    onClick={() => {
                      const speeds = [1.0, 1.15, 1.25];
                      const nextSpeed = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                      setPlaybackSpeed(nextSpeed);
                      if (synthRef.current) {
                        synthRef.current.rate = nextSpeed;
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-white/10 text-white font-bold hover:bg-white/20 transition-colors"
                  >
                    {t('morning_espresso.speed', { speed: playbackSpeed })}
                  </button>
                </div>

                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1 rounded hover:text-white transition-colors"
                >
                  {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
              </div>
            </div>
          </div>

          {/* BRIEFING HIGHLIGHTS GRID */}
          <div className="p-6 bg-[#F8FAFC] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#111C2D]">{t('morning_espresso.personalized_summary')}</span>
              <span className="text-[11px] font-normal text-neutral-500">{t('morning_espresso.live_sync')}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* CARD 1: ACCOUNT BALANCES */}
              <div className="bg-white rounded-2xl p-3.5 border border-neutral-200/80 shadow-sm">
                <div className="flex items-center justify-between text-neutral-500 mb-1.5">
                  <span className="text-[11px] font-normal text-neutral-500">{t('morning_espresso.net_balances')}</span>
                  <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                    <Landmark size={14} />
                  </div>
                </div>
                <div className="text-base font-bold text-[#111C2D]">
                  {formatMoney(totalNetBalance)} <span className="text-xs font-normal text-neutral-500">{currency}</span>
                </div>

              </div>

              {/* CARD 2: CASH BALANCE */}
              <div className="bg-white rounded-2xl p-3.5 border border-neutral-200/80 shadow-sm">
                <div className="flex items-center justify-between text-neutral-500 mb-1.5">
                  <span className="text-[11px] font-normal text-neutral-500">{t('morning_espresso.cash_balance', 'Cash Balance')}</span>
                  <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                    <Wallet size={14} />
                  </div>
                </div>
                <div className="text-base font-bold text-[#111C2D]">
                  {formatMoney(totalCashBalance)} <span className="text-xs font-normal text-neutral-500">{currency}</span>
                </div>
                <div className="text-[10px] font-normal text-neutral-500 mt-1">
                  {cashAccountCount} cash wallet{cashAccountCount === 1 ? '' : 's'}
                </div>
              </div>

              {/* CARD 3: BUDGET RUNWAY */}
              <div className="bg-white rounded-2xl p-3.5 border border-neutral-200/80 shadow-sm">
                <div className="flex items-center justify-between text-neutral-500 mb-1.5">
                  <span className="text-[11px] font-normal text-neutral-500">{t('morning_espresso.daily_budget_runway')}</span>
                  <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                    <TrendingUp size={14} />
                  </div>
                </div>
                <div className="text-base font-bold text-[#111C2D]">
                  {formatMoney(dailyRunway)} <span className="text-xs font-normal text-neutral-500">{currency}/day</span>
                </div>
                <div className="text-[10px] font-normal text-neutral-500 mt-1">
                  {checkingCount} checking account{checkingCount === 1 ? '' : 's'} • {daysRemainingInMonth} days left
                </div>
              </div>

              {/* CARD 4: UPCOMING PAYMENTS */}
              <div 
                onClick={() => {
                  triggerHaptic(hapticPresets.light);
                  localStorage.setItem('vantage_transactions_view_mode', 'future');
                  if (setActiveTab) {
                    setActiveTab('activity');
                  }
                  onClose();
                }}
                className="bg-white rounded-2xl p-3.5 border border-neutral-200/80 shadow-sm cursor-pointer hover:border-emerald-300 transition-all"
                title="Click to view upcoming transactions in Activity tab"
              >
                <div className="flex items-center justify-between text-neutral-500 mb-1.5">
                  <span className="text-[11px] font-normal text-neutral-500">{t('morning_espresso.upcoming_payments')}</span>
                  <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                    <Calendar size={14} />
                  </div>
                </div>
                <div className="text-base font-bold text-[#111C2D]">
                  {upcomingPayments.count > 0 ? t('morning_espresso.pending_count', { count: upcomingPayments.count }) : t('morning_espresso.all_clear')}
                </div>
                <div className="text-[10px] font-normal text-neutral-500 mt-1 truncate">
                  {upcomingPayments.count > 0 ? upcomingPayments.items[0]?.title : t('morning_espresso.no_dues_this_month', 'No dues remaining this month')}
                </div>
              </div>

              {/* CARD 5: ACTIVE STREAK */}
              <div className="col-span-2 bg-white rounded-2xl p-3.5 border border-neutral-200/80 shadow-sm">
                <div className="flex items-center justify-between text-neutral-500 mb-1.5">
                  <span className="text-[11px] font-normal text-neutral-500">{t('morning_espresso.active_streak')}</span>
                  <div className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                    <Flame size={14} />
                  </div>
                </div>
                <div className="text-base font-bold text-[#111C2D]">
                  {streakDays} <span className="text-xs font-normal text-neutral-500">{t('morning_espresso.days')}</span>
                </div>
                <div className="text-[10px] font-normal text-orange-600 mt-1">
                  {t('morning_espresso.daily_tracking_active')}
                </div>
              </div>
            </div>

            {/* BUDGET DASHBOARD & DAILY SELECTION (UP TO 3) */}
            <div className="bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Wallet size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#111C2D]">Daily Briefing Budgets</h4>
                    <p className="text-[11px] text-neutral-500">Select up to 3 budgets to hear about daily ({selectedBudgetIds.length}/3 selected)</p>
                  </div>
                </div>
              </div>

              {confirmedBudgets.length === 0 ? (
                <div 
                  onClick={() => {
                    onClose();
                    if (setActiveTab) setActiveTab('essentials');
                    window.dispatchEvent(new CustomEvent('open-salary-breakdown-modal'));
                  }}
                  className="p-6 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 hover:bg-neutral-50 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2"
                >
                  <Wallet size={20} className="text-neutral-400" />
                  <span className="text-xs font-bold text-neutral-700">Configure your salary break down to show budgets</span>
                  <span className="text-[11px] text-neutral-400">Click here to set up your allocation matrix</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {confirmedBudgets.map(b => {
                    const isSelected = selectedBudgetIds.includes(b.id);
                    const allocated = b.allocatedAmount || 0;
                    const spent = b.spentAmount || 0;
                    const remaining = Math.max(0, allocated - spent);
                    const pct = allocated > 0 ? Math.min(100, (spent / allocated) * 100) : 0;

                    return (
                      <div
                        key={b.id}
                        onClick={() => handleToggleBudgetSelection(b.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected 
                            ? 'bg-emerald-50/60 border-emerald-300 shadow-xs' 
                            : 'bg-neutral-50 border-neutral-200/60 hover:border-neutral-300'
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-[#111C2D] truncate">{b.categoryTitle || 'Budget'}</span>
                            <div className="flex flex-col items-end leading-tight">
                              <span className="text-[11px] font-bold text-neutral-700 font-mono">
                                {formatMoney(remaining)} {currency} left
                              </span>
                              <span className="text-[9px] font-normal text-neutral-400 mt-0.5">
                                {formatMoney(spent)} / {formatMoney(allocated)} {currency} spent
                              </span>
                            </div>
                          </div>
                          <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${pct > 85 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                          isSelected ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-500'
                        }`}>
                          {isSelected ? '✓' : '+'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* TRANSCRIPT CARD */}
            <div className="bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#111C2D] mb-1.5">
                <Sparkles size={14} className="text-amber-500" />
                <span>{t('morning_espresso.audio_briefing_transcript')}</span>
              </div>
              <p className="text-xs font-normal text-neutral-600 leading-relaxed">
                "{generateVoiceScript()}"
              </p>
            </div>

            {/* BOTTOM BUTTON */}
            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl bg-[#111C2D] text-white text-xs font-bold hover:bg-[#0F172A] transition-colors text-center"
              >
                {t('morning_espresso.dismiss_briefing')}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
