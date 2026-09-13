import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { doc, onSnapshot, collection, updateDoc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { secureSave, secureLoad } from './lib/secureStorage';
import { Layout } from './components/Layout';
import { Settings as SettingsComponent } from './components/Settings';
import { BiometricLogin } from './components/BiometricLogin';
import { OnboardingFlow } from './components/OnboardingFlow';
import { AddTransactionModal } from './components/AddTransactionModal';
import { AddAccountModal } from './components/AddAccountModal';
import { SmsAutoFetchModal } from './components/SmsAutoFetchModal';
import { parseBankSms } from './lib/smsParser';
import { PremiumModal } from './components/PremiumModal';
import { VantageDataErrorBoundary } from './components/VantageDataErrorBoundary';
import { PermissionRequestModal } from './components/PermissionRequestModal';
import { RefreshCw, Sparkles } from 'lucide-react';
import i18n from './lib/i18n';
import { I18nextProvider } from 'react-i18next';
import { useTranslation } from '@/lib/i18n';
import { Essentials as EssentialsComponent, MilestoneConfigModal } from './components/Essentials';
import { DebtMilestoneConfigModal } from './components/DebtMilestoneConfigModal';
import { Accounts as AccountsComponent } from './components/Accounts';
import { VantageAI as VantageAIComponent } from './components/VantageAI';
import { Transactions as TransactionsComponent } from './components/Transactions';
import { getSimulatedDate, toLocalDateString } from './lib/dateSimulator';
import { Analytics as AnalyticsComponent } from './components/Analytics';
import { SalaryBreakdownModal } from './components/SalaryBreakdownModal';
import { StreakAnimation } from './components/StreakAnimation';
import { MilestoneRewardBanner } from './components/MilestoneRewardBanner';
import { FullMilestoneOverlay } from './components/FullMilestoneOverlay';
import { PasscodeLockModal } from './components/PasscodeLockModal';
import { hasPasscode } from './lib/passcode';
import { NotificationManager } from './components/NotificationManager';
import { WeekendWrapUpModal } from './components/WeekendWrapUpModal';
import { AnnualWrappedModal } from './components/AnnualWrappedModal';
import { DEFAULT_RATES, syncExchangeRates } from './lib/exchangeRates';
import { calculateAccountBalances } from './lib/trendUtils';
import { REWARDS, BADGES } from './lib/badgeUtils';
import { triggerHaptic, hapticPresets } from './lib/haptics';
import { PublicSharedCartView } from './components/PublicSharedCartView';
import { assignUserCountryFromBackend } from './lib/countryDetection';
import { RedeemInviteModal } from './components/RedeemInviteModal';
import { MissingDaysModal } from './components/MissingDaysModal';
import { seedUserCustomCategories, fetchGlobalPresets } from './lib/categoryUtils';
import { VantageVoiceAssistant } from './components/VantageVoiceAssistant';


const Essentials = EssentialsComponent;
const Accounts = AccountsComponent;
const VantageAI = VantageAIComponent;
const Transactions = TransactionsComponent;
const Analytics = AnalyticsComponent;
const Settings = SettingsComponent;

export type Tab = 'essentials' | 'accounts' | 'ai' | 'activity' | 'analytics' | 'settings' | 'salary-breakdown';

const animation = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
};

// We isolate the internal application content so the parent Error Boundary can monitor its states
function AppContent() {
  const { i18n: i18nextInstance } = useTranslation();
  const [profile, setProfile] = useState<any>(() => {
    return secureLoad('vantage_user_profile', null);
  });

  const [user, setUser] = useState<any>(() => {
    const cached = secureLoad('vantage_user_profile', null);
    if (cached?.uid) {
      return { uid: cached.uid, email: cached.email || '' };
    }
    return null;
  });

  // If profile exists in local cache, loading is FALSE on frame 0 (Zero screen freeze)
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = secureLoad('vantage_user_profile', null);
    return !cached;
  });
  const [activeTab, setActiveTab] = useState<Tab>('essentials');
  const [streakUpdated, setStreakUpdated] = useState(false);
  const [showStreakAnimation, setShowStreakAnimation] = useState(false);
  const [animatingStreak, setAnimatingStreak] = useState(0);
  const [isBonusStreak, setIsBonusStreak] = useState(false);
  const [rewardNotification, setRewardNotification] = useState<any>(null);
  
  // Feature Modal Interface Toggles
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txMode, setTxMode] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [isAccountModalOpen, setIsAddAccountOpen] = useState(false);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [isDebtMilestoneModalOpen, setIsDebtMilestoneModalOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(hasPasscode());
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [isWeekendWrapUpOpen, setIsWeekendWrapUpOpen] = useState(false);
  const [isAnnualWrappedOpen, setIsAnnualWrappedOpen] = useState(false);
  const [isPrivacyBlur, setIsPrivacyBlur] = useState<boolean>(() => {
    return localStorage.getItem('vantage_privacy_blur') === 'true';
  });
  const [privacyToast, setPrivacyToast] = useState<string | null>(null);
  const [publicCartId, setPublicCartId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('cartId') || params.get('sharedCart') || params.get('cart');
  });
  const [inviteCodeUrl] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('code') || params.get('invite');
  });
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return !!(params.get('code') || params.get('invite'));
  });
  const [isMissingDaysModalOpen, setIsMissingDaysModalOpen] = useState(false);
  const [isVoiceAssistantOpen, setIsVoiceAssistantOpen] = useState(false);
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [initialSmsData, setInitialSmsData] = useState<any>(null);
  const [smsToast, setSmsToast] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleBankSmsReceived = (e: CustomEvent<{ text: string; sender?: string }>) => {
      const permissionGranted = localStorage.getItem('vantage_sms_permission_granted') === 'true';
      const autoOpenEnabled = localStorage.getItem('vantage_sms_auto_open') !== 'false';

      if (!permissionGranted) {
        console.log('Bank SMS received but SMS permission not granted.');
        return;
      }

      const { text, sender } = e.detail || {};
      if (!text) return;

      const parsed = parseBankSms(text, sender || 'Bank SMS');
      if (parsed) {
        setInitialSmsData(parsed);
        setTxMode(parsed.type === 'income' ? 'income' : 'expense');
        if (autoOpenEnabled) {
          setIsTxModalOpen(true);
          setSmsToast(`⚡ Bank SMS Auto-Detected: ${parsed.currency} ${parsed.amount.toFixed(2)} at ${parsed.merchant} — Transaction window opened automatically!`);
          setTimeout(() => setSmsToast(null), 5000);
        }
      }
    };

    window.addEventListener('bank-sms-received', handleBankSmsReceived as EventListener);
    return () => {
      window.removeEventListener('bank-sms-received', handleBankSmsReceived as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleOpenSms = () => setIsSmsModalOpen(true);
    window.addEventListener('open-sms-auto-fetch', handleOpenSms);
    return () => window.removeEventListener('open-sms-auto-fetch', handleOpenSms);
  }, []);

  useEffect(() => {
    const handleQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('firestore-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('firestore-quota-exceeded', handleQuotaExceeded);
  }, []);

  useEffect(() => {
    const handleOpenVoice = () => setIsVoiceAssistantOpen(true);
    window.addEventListener('open-voice-assistant', handleOpenVoice);
    return () => window.removeEventListener('open-voice-assistant', handleOpenVoice);
  }, []);



  useEffect(() => {
    const handleOpenRedeem = () => setIsRedeemModalOpen(true);
    window.addEventListener('trigger-redeem-invite-modal', handleOpenRedeem);
    return () => window.removeEventListener('trigger-redeem-invite-modal', handleOpenRedeem);
  }, []);

  // Sync privacy blur class on body
  useEffect(() => {
    document.body.classList.toggle('privacy-blurred', isPrivacyBlur);
  }, [isPrivacyBlur]);

  // Triple-tap gesture handler for privacy blur
  useEffect(() => {
    let tapCount = 0;
    let tapTimer: any = null;

    const handlePointerDown = (e: PointerEvent) => {
      // Ignore taps inside input, select, textarea or interactive editable elements
      const target = e.target as HTMLElement;
      if (target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.tagName === 'SELECT' || 
        target.isContentEditable
      )) {
        return;
      }

      tapCount++;

      if (tapTimer) clearTimeout(tapTimer);

      if (tapCount >= 3) {
        tapCount = 0;
        setIsPrivacyBlur((prev) => {
          const nextState = !prev;
          localStorage.setItem('vantage_privacy_blur', nextState ? 'true' : 'false');
          triggerHaptic(hapticPresets.heavy);
          
          setPrivacyToast(
            nextState 
              ? '🔒 Privacy mode active — balances blurred' 
              : '🔓 Privacy mode disabled — balances visible'
          );
          setTimeout(() => setPrivacyToast(null), 2500);

          return nextState;
        });
      } else {
        tapTimer = setTimeout(() => {
          tapCount = 0;
        }, 500);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      if (tapTimer) clearTimeout(tapTimer);
    };
  }, []);

  const getLocalDateString = (d: Date = getSimulatedDate()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const verifyStreak = useCallback(async (uid: string, profileData: any) => {
    if (!uid || !profileData) return;
    const todayStr = getLocalDateString();
    const lastLoginDate = profileData.lastLoginDate;
    const streakShownKey = `vantage_streak_shown_${todayStr}`;
    const alreadyShownToday = localStorage.getItem(streakShownKey) === 'true';

    if (lastLoginDate === todayStr && alreadyShownToday) {
      return; // Already verified and shown today
    }

    // Log the daily login event into userLogins subcollection safely
    try {
      const loginRef = doc(db, 'users', uid, 'userLogins', todayStr);
      await setDoc(loginRef, { userId: uid, timestamp: getSimulatedDate(), date: todayStr }, { merge: true });
    } catch (err) {
      console.warn("User login ledger write deferred:", err);
    }

    // Calculate true streak from userLogins collection to prevent stale cache discrepancies
    let calculatedStreak = profileData.dailyStreak || 1;
    try {
      const loginsRef = collection(db, 'users', uid, 'userLogins');
      const loginsSnap = await getDocs(loginsRef);
      const loginsList: any[] = [];
      loginsSnap.forEach(docSnap => loginsList.push({ id: docSnap.id, ...docSnap.data() }));

      const loginDateStrings = new Set(
        loginsList.map(login => {
          const loginDate = login.date || (login.timestamp ? (login.timestamp.toDate ? login.timestamp.toDate() : new Date(login.timestamp)) : new Date());
          const d = new Date(loginDate);
          if (isNaN(d.getTime())) return '';
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }).filter(Boolean)
      );
      loginDateStrings.add(todayStr);

      let streakCount = 0;
      let checkDate = getSimulatedDate();
      checkDate.setHours(0, 0, 0, 0);

      const toLocalDateStr = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      if (!loginDateStrings.has(toLocalDateStr(checkDate))) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      while (loginDateStrings.has(toLocalDateStr(checkDate))) {
        streakCount++;
        checkDate.setDate(checkDate.getDate() - 1);
      }

      calculatedStreak = Math.max(streakCount, profileData.dailyStreak || 1, 1);
    } catch (err) {
      console.warn("Streak calculation from userLogins failed:", err);
    }

    if (profileData.dailyStreak !== undefined && profileData.dailyStreak >= calculatedStreak && lastLoginDate === todayStr && alreadyShownToday) {
      return; // Already updated today and cache is up to date
    }

    try {
      const profileRef = doc(db, 'users', uid);
      let streakFreezes = profileData.streakFreezes || 0;
      let newStreak = calculatedStreak;

      if (!lastLoginDate) {
        newStreak = calculatedStreak;
      } else if (lastLoginDate === todayStr) {
        newStreak = Math.max(profileData.dailyStreak || 1, calculatedStreak);
      } else {
        const todayDate = getSimulatedDate();
        todayDate.setHours(0, 0, 0, 0);

        const parts = lastLoginDate.split('-').map(Number);
        if (parts.length === 3 && !isNaN(parts[0])) {
          const lastLoginObj = new Date(parts[0], parts[1] - 1, parts[2]);
          lastLoginObj.setHours(0, 0, 0, 0);

          const diffTime = todayDate.getTime() - lastLoginObj.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays >= 2) {
            const showKey = `vantage_missing_prompt_shown_${todayStr}`;
            if (!localStorage.getItem(showKey)) {
              localStorage.setItem(showKey, 'true');
              setIsMissingDaysModalOpen(true);
            }
          }

          if (diffDays <= 1) {
            newStreak = Math.max((profileData.dailyStreak || 0) + 1, calculatedStreak);
          } else {
            const daysMissed = diffDays - 1;
            if (streakFreezes >= daysMissed) {
              streakFreezes -= daysMissed;
              newStreak = Math.max((profileData.dailyStreak || 0) + 1, calculatedStreak);
            } else {
              newStreak = calculatedStreak;
            }
          }
        } else {
          newStreak = calculatedStreak;
        }
      }

      const updateData: any = {
        dailyStreak: newStreak,
        streakFreezes: streakFreezes,
        lastLoginDate: todayStr
      };

      const claimedRewards = [...(profileData.claimedRewards || [])];
      const newRewards = [...(profileData.rewardHistory || [])];

      REWARDS.forEach(reward => {
        if (newStreak >= reward.streakThreshold && !claimedRewards.includes(reward.id)) {
          claimedRewards.push(reward.id);
          newRewards.push({
            id: reward.id,
            dateClaimed: todayStr
          });
          if (reward.type === 'receipt_scan') {
            updateData.receiptScans = (profileData.receiptScans || 0) + reward.amount;
          } else if (reward.type === 'ai_tokens') {
            updateData.giftTokens = (profileData.giftTokens || 0) + reward.amount;
          } else if (reward.type === 'streak_freeze') {
            updateData.streakFreezes = (profileData.streakFreezes || 0) + reward.amount;
          } else if (reward.type === 'ai_report') {
            updateData.aiReportUnlocked = true;
          } else if (reward.type === 'budget_audit') {
            updateData.budgetAuditUnlocked = true;
          } else if (reward.type === 'investment_report') {
            updateData.investmentReportUnlocked = true;
          } else if (reward.type === 'asset_allocation_report') {
            updateData.assetAllocationReportUnlocked = true;
          } else if (reward.type === 'annual_forecast_report') {
            updateData.annualForecastReportUnlocked = true;
          }
          if (!alreadyShownToday) {
            setIsBonusStreak(true);
            setRewardNotification(reward);
          }
        }
      });

      const userBadges = [...(profileData.badges || [])];
      BADGES.forEach(badge => {
        const badgeKey = `badge_${badge.id}`;
        if (newStreak >= badge.threshold && !claimedRewards.includes(badgeKey)) {
          claimedRewards.push(badgeKey);
        }
        if ((newStreak >= badge.threshold || claimedRewards.includes(badgeKey)) && !userBadges.includes(badge.id)) {
          userBadges.push(badge.id);
          if (!alreadyShownToday && !rewardNotification) {
            setIsBonusStreak(true);
            setRewardNotification({
              title: `${badge.title} Unlocked!`,
              type: 'badge',
              image: badge.image
            });
          }
        }
      });

      updateData.claimedRewards = claimedRewards;
      updateData.badges = userBadges;
      updateData.rewardHistory = newRewards;

      setProfile((prev: any) => {
        if (!prev) return prev;
        const updated = { ...prev, ...updateData };
        secureSave('vantage_user_profile', updated);
        secureSave(`vantage_offline_profile_${uid}`, updated);
        return updated;
      });

      if (!alreadyShownToday) {
        localStorage.setItem(streakShownKey, 'true');
        setStreakUpdated(true);
        setAnimatingStreak(newStreak);
        setShowStreakAnimation(true);
        setTimeout(() => setStreakUpdated(false), 3000);
      }

      await updateDoc(profileRef, updateData);
    } catch (streakErr) {
      console.warn("Streak verification deferred/offline:", streakErr);
    }
  }, []);

  const isResolvedRef = useRef(false);

  const userRef = useRef(user);

  useEffect(() => { userRef.current = user; }, [user]);

  // Verify streak once per session/day to prevent lag and unnecessary re-fetches
  useEffect(() => {
    if (!user?.uid || !profile) return;
    const todayStr = getLocalDateString();
    const verifiedKey = `vantage_streak_verified_${user.uid}_${todayStr}`;
    if (sessionStorage.getItem(verifiedKey)) return;
    sessionStorage.setItem(verifiedKey, 'true');

    verifyStreak(user.uid, profile);
  }, [user?.uid, verifyStreak]);

  // 🛡️ OFFLINE-FIRST: Hydrate state from local cache on mount
  useEffect(() => {
    // Ensure splash screen is removed when React mounts
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('fade-out');
      setTimeout(() => {
        try { if (splash.parentNode) splash.parentNode.removeChild(splash); } catch(e) {}
      }, 300);
    }

    const profileData = secureLoad('vantage_user_profile', null);
    if (profileData && profileData.uid) {
      try {
        setUser({ uid: profileData.uid, email: profileData.email });
        setProfile(profileData);
        isResolvedRef.current = true; // Prevents onAuthStateChanged from overriding
        setLoading(false); // Quick render from cache
        console.log("[Vantage Offline-First] Hydrated state from secure cache.");
      } catch (e) {
        console.error("[Vantage Offline-First] Failed to hydrate:", e);
      }
    }
  }, []);

  useEffect(() => {
    const hasRequested = localStorage.getItem('vantage_permissions_requested');
    if (!hasRequested) {
      setIsPermissionModalOpen(true);
      localStorage.setItem('vantage_permissions_requested', 'true');
    }
  }, []);

  // Synchronized state pools for analytics routing
  const [activeWorkspaceUid, setActiveWorkspaceUid] = useState<string>('');
  const [accounts, setAccounts] = useState<any[]>(() => {
    const profileCached = secureLoad('vantage_user_profile', null);
    const uid = profileCached?.uid;
    return (uid ? secureLoad(`vantage_offline_accounts_${uid}`, null) : null) || 
           secureLoad('vantage_accounts', []);
  });

  const [transactions, setTransactions] = useState<any[]>(() => {
    const profileCached = secureLoad('vantage_user_profile', null);
    const uid = profileCached?.uid;
    return (uid ? secureLoad(`vantage_offline_transactions_${uid}`, null) : null) || 
           secureLoad('vantage_transactions', []);
  });
  const [userLogins, setUserLogins] = useState<any[]>([]);
  const [exchangeRates, setExchangeRates] = useState<any>(DEFAULT_RATES);

  const isRTL = ['ar', 'ur'].includes(i18nextInstance.language);

  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  }, [i18nextInstance.language, isRTL]);

  const accountBalances = React.useMemo(() => {
    return calculateAccountBalances(accounts, transactions);
  }, [accounts, transactions]);

  const getRateToAED = (curr: string) => {
    const c = curr || 'AED';
    if (c === 'AED') return 1;
    return (exchangeRates && exchangeRates[c]) || (DEFAULT_RATES as any)[c] || 1;
  };

  useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await syncExchangeRates();
        setExchangeRates(rates);
      } catch (err) {
        // Safe suppressor
      }
    };
    loadRates();
  }, []);

  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      if (e.detail?.tab) setActiveTab(e.detail.tab);
    };
    const handleOpenAIChat = () => {
      setIsAIModalOpen(true);
    };
    window.addEventListener('switch-tab', handleSwitchTab);
    window.addEventListener('open-vantage-ai-chat', handleOpenAIChat);
    return () => {
      window.removeEventListener('switch-tab', handleSwitchTab);
      window.removeEventListener('open-vantage-ai-chat', handleOpenAIChat);
    };
  }, []);

  useEffect(() => {
    const handleForwardSavings = () => {
      setIsMilestoneModalOpen(true);
    };
    const handleForwardDebt = () => {
      setIsDebtMilestoneModalOpen(true);
    };
    const handleOpenPremium = () => {
      setIsPremiumModalOpen(true);
    };

    window.addEventListener('trigger-savings-goal-config', handleForwardSavings);
    window.addEventListener('trigger-debt-config', handleForwardDebt);
    window.addEventListener('trigger-premium-modal', handleOpenPremium);
    window.addEventListener('open-premium-modal', handleOpenPremium);
    
    // Weekend Wrap-Up Sunday Evening Check & Event Listeners
    const checkSundayEvening = () => {
      const now = getSimulatedDate();
      const isSunday = now.getDay() === 0;
      const isEvening = now.getHours() >= 17; // 5:00 PM or later
      if (isSunday && isEvening) {
        const todayStr = toLocalDateString(now);
        const storageKey = `vantage_weekend_wrapup_shown_${todayStr}`;
        const hasBeenShown = localStorage.getItem(storageKey);
        if (!hasBeenShown) {
          setIsWeekendWrapUpOpen(true);
          localStorage.setItem(storageKey, 'true');
        }
      }
    };
    checkSundayEvening();

    // 🎆 Annual Financial Story (Wrapped) Check: 1st of January at 9 PM local time
    const checkAnnualWrapped = () => {
      const now = getSimulatedDate();
      const isJan1st = now.getMonth() === 0 && now.getDate() === 1; // Month 0 is January
      const is9PMOrLater = now.getHours() >= 21; // 21:00 or later local time
      if (isJan1st && is9PMOrLater) {
        const year = now.getFullYear();
        const storageKey = `vantage_annual_wrapped_shown_${year}`;
        const hasBeenShown = localStorage.getItem(storageKey);
        if (!hasBeenShown) {
          setIsAnnualWrappedOpen(true);
          localStorage.setItem(storageKey, 'true');
        }
      }
    };
    checkAnnualWrapped();

    const handleOpenWrapUp = () => {
      setIsWeekendWrapUpOpen(true);
    };

    const handleOpenAnnualWrapped = () => {
      setIsAnnualWrappedOpen(true);
    };

    window.addEventListener('trigger-weekend-wrapup', handleOpenWrapUp);
    window.addEventListener('open-weekend-wrapup', handleOpenWrapUp);
    window.addEventListener('trigger-annual-wrapped', handleOpenAnnualWrapped);
    window.addEventListener('open-annual-wrapped', handleOpenAnnualWrapped);

    return () => {
      window.removeEventListener('trigger-savings-goal-config', handleForwardSavings);
      window.removeEventListener('trigger-debt-config', handleForwardDebt);
      window.removeEventListener('trigger-premium-modal', handleOpenPremium);
      window.removeEventListener('open-premium-modal', handleOpenPremium);
      window.removeEventListener('trigger-weekend-wrapup', handleOpenWrapUp);
      window.removeEventListener('open-weekend-wrapup', handleOpenWrapUp);
      window.removeEventListener('trigger-annual-wrapped', handleOpenAnnualWrapped);
      window.removeEventListener('open-annual-wrapped', handleOpenAnnualWrapped);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('milestone-modal-toggled', { detail: { isOpen: isMilestoneModalOpen } }));
  }, [isMilestoneModalOpen]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('account-modal-toggled', { detail: { isOpen: isAccountModalOpen } }));
  }, [isAccountModalOpen]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('debt-milestone-modal-toggled', { detail: { isOpen: isDebtMilestoneModalOpen } }));
  }, [isDebtMilestoneModalOpen]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('weekend-wrapup-toggled', { detail: { isOpen: isWeekendWrapUpOpen } }));
  }, [isWeekendWrapUpOpen]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sms-modal-toggled', { detail: { isOpen: isSmsModalOpen } }));
  }, [isSmsModalOpen]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        
        const profileRef = doc(db, 'users', currentUser.uid);
        
        const unsubProfile = onSnapshot(profileRef, { includeMetadataChanges: true }, (docSnap) => {
          // Unblock immediately
          setLoading(false);

          if (docSnap.exists()) {
            const profileData = docSnap.data();
            const userEmail = (currentUser.email || profileData.email || '').toLowerCase().trim();
            const shouldBeAdmin = userEmail === 'support@yourfinances.me';
            const fullProfile = { uid: currentUser.uid, ...profileData, isAdmin: shouldBeAdmin };

            setProfile(fullProfile);
            secureSave('vantage_user_profile', fullProfile);
            secureSave(`vantage_offline_profile_${currentUser.uid}`, fullProfile);

            if (profileData.language) {
              i18n.changeLanguage(profileData.language);
            }
          }
        }, (error) => {
          console.warn("Using offline cached profile:", error);
          setLoading(false);
        });

        return () => unsubProfile();
      } else {
        // Clear state only on explicit signout
        if (!secureLoad('vantage_user_profile', null)) {
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Instant offline hydration for accounts & transactions from secure local cache
  useEffect(() => {
    if (!user?.uid) return;
    const cachedAcc = secureLoad(`vantage_offline_accounts_${user.uid}`) || secureLoad('vantage_accounts');
    if (cachedAcc) setAccounts(cachedAcc);
    const cachedTx = secureLoad(`vantage_offline_transactions_${user.uid}`) || secureLoad('vantage_transactions');
    if (cachedTx) setTransactions(cachedTx);
  }, [user?.uid]);

  // Sync structural account balances matrices downstream when active user logs exist
  useEffect(() => {
    if (!user || loading) return;
    const targetUid = activeWorkspaceUid || user.uid;

    let unsubAccounts: any = () => {};
    let unsubTx: any = () => {};
    let unsubLogins: any = () => {};

    const timer = setTimeout(() => {
      const accountsRef = collection(db, 'users', targetUid, 'accounts');
      unsubAccounts = onSnapshot(accountsRef, (snapshot) => {
        const accList: any[] = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          accList.push({ id: doc.id, ...data });
        });
        setAccounts(accList);
        secureSave('vantage_accounts', accList);
        secureSave(`vantage_offline_accounts_${targetUid}`, accList);
      }, (error) => {
        console.warn("Accounts streaming transport errored, attempting fallback:", error);
        const cached = secureLoad(`vantage_offline_accounts_${targetUid}`) || secureLoad('vantage_accounts');
        if (cached) setAccounts(cached);
      });

      const txRef = collection(db, 'users', targetUid, 'transactions');
      unsubTx = onSnapshot(txRef, (snapshot) => {
        const txList: any[] = [];
        snapshot.forEach(doc => txList.push({ id: doc.id, ...doc.data() }));
        setTransactions(txList);
        secureSave('vantage_transactions', txList);
        secureSave(`vantage_offline_transactions_${targetUid}`, txList);
      }, (error) => {
        console.warn("Ledger streaming transport errored, attempting fallback:", error);
        const cached = secureLoad(`vantage_offline_transactions_${targetUid}`) || secureLoad('vantage_transactions');
        if (cached) setTransactions(cached);
      });

      const loginsRef = collection(db, 'users', user.uid, 'userLogins');
      unsubLogins = onSnapshot(loginsRef, (snapshot) => {
        const loginsList: any[] = [];
        snapshot.forEach(doc => loginsList.push({ id: doc.id, ...doc.data() }));
        setUserLogins(loginsList);
      }, (error) => {
        console.warn("Logins streaming transport errored safely:", error);
      });
    }, 150);

    return () => {
      clearTimeout(timer);
      unsubAccounts();
      unsubTx();
      unsubLogins();
    };
  }, [user, activeWorkspaceUid, loading]);

  if (publicCartId) {
    return (
      <PublicSharedCartView 
        cartId={publicCartId} 
        onClose={() => setPublicCartId(null)} 
      />
    );
  }

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-[#1E2229] flex flex-col items-center justify-center select-none">
        <RefreshCw size={24} className="text-[#A6DDB1] animate-spin" />
        <span className="text-xs font-mono tracking-wider text-neutral-400 mt-3">Loading</span>
        <button
          onClick={() => { signOut(auth); localStorage.removeItem('vantage_user_profile'); window.location.reload(); }}
          className="mt-8 px-4 py-2 bg-neutral-800 rounded-full text-[10px] font-bold text-neutral-400 hover:text-white cursor-pointer"
        >
          Force Reset / Logout
        </button>
      </div>
    );
  }

  // GATE A: Enforce password authentication wall
  if (!user) {
    return <BiometricLogin onSuccess={(profileData) => { 
      localStorage.setItem('vantage_user_profile', JSON.stringify(profileData));
      setUser({ uid: profileData.uid, email: profileData.email }); 
      setProfile(profileData); 
    }} />;
  }

  // GATE B: Defer advanced features until onboarding registration checks clear
  if (!profile || profile.hasAcceptedTerms === false || !profile.baseCurrency) {
    return <OnboardingFlow uid={user.uid} profile={profile} onSuccess={() => window.location.reload()} />;
  }

  const effectiveUid = activeWorkspaceUid || user.uid;
  const effectiveProfile = activeWorkspaceUid ? {
    ...profile,
    uid: activeWorkspaceUid
  } : profile;

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      isLocked={isLocked}
      isPremium={!!(profile.isPremium || (profile.subscriptionTier && profile.subscriptionTier.toLowerCase() !== 'free') || (profile.vantageAiUnlockedUntil && new Date(profile.vantageAiUnlockedUntil).getTime() > Date.now()))}
      isAIModalOpen={isAIModalOpen}
      setIsAIModalOpen={setIsAIModalOpen}
      isTxModalOpen={isTxModalOpen}
      setIsTxModalOpen={setIsTxModalOpen}
      txMode={txMode}
      setTxMode={setTxMode}
      profile={profile}
      accounts={accounts}
      transactions={transactions}
      accountBalances={accountBalances}
      streakUpdated={streakUpdated}
      userLogins={userLogins}
      receiptScanCount={profile.receiptScans || 0}
      onUpdateProfile={(updated) => setProfile(updated)}
      activeWorkspaceUid={activeWorkspaceUid}
      setActiveWorkspaceUid={setActiveWorkspaceUid}
    >
      {showStreakAnimation && (
        <StreakAnimation 
          streak={animatingStreak} 
          isBonusStreak={isBonusStreak}
          rewardNotification={rewardNotification}
          onComplete={() => setShowStreakAnimation(false)} 
        />
      )}
      <AnimatePresence>
        {privacyToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[99999] px-5 py-3 bg-[#111C2D]/95 backdrop-blur-md text-white rounded-full text-xs font-bold shadow-2xl border border-white/10 flex items-center gap-2 pointer-events-none select-none"
            style={{ fontFamily: "'Google Sans', sans-serif" }}
          >
            <span>{privacyToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <NotificationManager uid={effectiveUid} />

      {isPermissionModalOpen && (
        <PermissionRequestModal
          isOpen={isPermissionModalOpen}
          onClose={() => setIsPermissionModalOpen(false)}
        />
      )}
      {isLocked && (
        <PasscodeLockModal
          isOpen={isLocked}
          onSuccess={() => setIsLocked(false)}
        />
      )}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-800 flex items-center justify-center gap-2 z-[9999] relative">
          <span>⚠️ Firestore daily free tier quota limit reached. Data updates are operating in resilient offline/cached mode.</span>
          <button onClick={() => setQuotaExceeded(false)} className="underline font-bold text-amber-900 ml-2">Dismiss</button>
        </div>
      )}
     <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><RefreshCw size={24} className="text-[#A6DDB1] animate-spin" /></div>}>
     <AnimatePresence mode="wait">
  {activeTab === 'essentials' && (
    <motion.div key="essentials" {...animation}>
      <Essentials profile={effectiveProfile} />
    </motion.div>
  )}
  {activeTab === 'accounts' && (
    <motion.div key="accounts" {...animation}>
      <Accounts profile={effectiveProfile} />
    </motion.div>
  )}
{activeTab === 'ai' && (
  <motion.div key="ai" {...animation}>
    <VantageAI 
      isOpen={true} // Set to true to show it in the tab
      onClose={() => setActiveTab('essentials')} // Redirect back to home
      uid={effectiveUid}
      profile={effectiveProfile}
      accounts={accounts}
      transactions={transactions}
      accountBalances={accountBalances}
      onNavigateTab={(tab) => setActiveTab(tab)}
      onOpenModal={(modal) => {
        if (modal === 'transaction') setIsTxModalOpen(true);
        if (modal === 'account') setIsAddAccountOpen(true);
        if (modal === 'goal') setIsMilestoneModalOpen(true);
      }}
    />
  </motion.div>
)}
  {activeTab === 'activity' && (
    <motion.div key="activity" {...animation}>
      <Transactions 
        uid={effectiveUid} 
        accounts={accounts} 
        profile={effectiveProfile} 
        baseCurrency={effectiveProfile.baseCurrency || 'AED'} 
        getRateToAED={getRateToAED} 
      />
    </motion.div>
  )}
{activeTab === 'analytics' && (
  <motion.div key="analytics" {...animation}>
    <Analytics 
      onNavigateToTransactions={() => setActiveTab('activity')}
      profile={effectiveProfile} 
      allTransactions={transactions || []} // This must be exactly 'allTransactions'
      accounts={accounts || []} 
      accountBalances={accountBalances || {}}
    />
  </motion.div>
)}
  {activeTab === 'settings' && (
  <motion.div key="settings" {...animation}>
    <Settings 
      profile={effectiveProfile} 
      accounts={accounts} 
      onUpdateProfile={(updated) => setProfile(updated)} 
      onBack={() => setActiveTab('essentials')}
    />
  </motion.div>
)}

</AnimatePresence>
</Suspense>

      {/* FLOATING ACTION OVERLAYS PANEL HUB */}
      <AnimatePresence>
        {isAIModalOpen && (
          <VantageAI
            isOpen={isAIModalOpen}
            onClose={() => setIsAIModalOpen(false)}
            uid={effectiveUid}
            accounts={accounts}
            transactions={transactions}
            accountBalances={accountBalances}
            profile={effectiveProfile}
            onNavigateTab={(tab) => {
              setActiveTab(tab);
              setIsAIModalOpen(false);
            }}
            onOpenModal={(modal) => {
              setIsAIModalOpen(false);
              if (modal === 'transaction') setIsTxModalOpen(true);
              if (modal === 'account') setIsAddAccountOpen(true);
              if (modal === 'goal') setIsMilestoneModalOpen(true);
            }}
          />
        )}
      </AnimatePresence>

      <SmsAutoFetchModal
        isOpen={isSmsModalOpen}
        onClose={() => setIsSmsModalOpen(false)}
        onParsedTransactionSelect={(parsed) => {
          setInitialSmsData(parsed);
          setTxMode(parsed.type === 'income' ? 'income' : 'expense');
          setIsTxModalOpen(true);
        }}
      />

      {/* SMS Auto-Detection Toast Banner */}
      <AnimatePresence>
        {smsToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-5 right-5 z-50 max-w-md bg-emerald-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-emerald-700 flex items-center space-x-3 text-xs font-g-sans"
            style={{ fontFamily: "'Google Sans', sans-serif" }}
          >
            <div className="w-8 h-8 rounded-full bg-emerald-800 text-emerald-200 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 font-normal leading-relaxed">
              {smsToast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddTransactionModal 
        isOpen={isTxModalOpen} 
        onClose={() => {
          setIsTxModalOpen(false);
          setInitialSmsData(null);
        }} 
        uid={effectiveUid} 
        onSuccess={() => setInitialSmsData(null)} 
        accounts={accounts}
        profile={effectiveProfile}
        mode={txMode}
        setMode={setTxMode}
        getRateToAED={getRateToAED}
        initialSmsData={initialSmsData}
      />

      <AddAccountModal 
        isOpen={isAccountModalOpen} 
        onClose={() => setIsAddAccountOpen(false)} 
        uid={effectiveUid} 
        onAccountAdded={() => {}} 
        profile={effectiveProfile}
      />

      <MilestoneConfigModal 
        isOpen={isMilestoneModalOpen}
        onClose={() => setIsMilestoneModalOpen(false)}
        profile={effectiveProfile}
        editingMilestone={null}
        accounts={accounts}
        allTransactions={transactions}
        exchangeRates={exchangeRates}
      />

      <DebtMilestoneConfigModal
        isOpen={isDebtMilestoneModalOpen}
        onClose={() => setIsDebtMilestoneModalOpen(false)}
        profile={effectiveProfile}
        editingMilestone={null}
        accounts={accounts}
        exchangeRates={exchangeRates}
      />

      {rewardNotification && (
        <FullMilestoneOverlay
          reward={rewardNotification}
          onClose={() => setRewardNotification(null)}
        />
      )}

      <PremiumModal
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
        uid={effectiveUid}
        profile={effectiveProfile}
        onSuccess={(updatedProfile) => {}}
      />

      <WeekendWrapUpModal
        isOpen={isWeekendWrapUpOpen}
        onClose={() => setIsWeekendWrapUpOpen(false)}
        transactions={transactions}
        accounts={accounts}
        profile={effectiveProfile}
        accountBalances={accountBalances}
      />

      <AnnualWrappedModal
        isOpen={isAnnualWrappedOpen}
        onClose={() => setIsAnnualWrappedOpen(false)}
        transactions={transactions}
        accounts={accounts}
        profile={effectiveProfile}
        accountBalances={accountBalances}
      />

      <RedeemInviteModal
        isOpen={isRedeemModalOpen}
        onClose={() => setIsRedeemModalOpen(false)}
        profile={profile}
        onUpdateProfile={setProfile}
        initialCode={inviteCodeUrl}
      />

      <MissingDaysModal
        isOpen={isMissingDaysModalOpen}
        onClose={() => setIsMissingDaysModalOpen(false)}
        uid={effectiveUid}
        accounts={accounts}
        profile={effectiveProfile}
      />

      <VantageVoiceAssistant
        isOpen={isVoiceAssistantOpen}
        onClose={() => setIsVoiceAssistantOpen(false)}
        uid={effectiveUid}
        accounts={accounts}
        transactions={transactions}
        accountBalances={accountBalances}
        profile={effectiveProfile}
        onNavigateTab={(tab) => {
          setActiveTab(tab as any);
        }}
        onOpenModal={(modal) => {
          setIsVoiceAssistantOpen(false);
          if (modal === 'transaction') setIsTxModalOpen(true);
          if (modal === 'account') setIsAddAccountOpen(true);
          if (modal === 'goal') setIsMilestoneModalOpen(true);
        }}
      />
    </Layout>
  );
}


// 🛡️ MASTER MOUNT: Guarding the full component tree with native fallback triggers
export const App = () => {
  return (
    <I18nextProvider i18n={i18n}>
      <VantageDataErrorBoundary>
        <AppContent />
      </VantageDataErrorBoundary>
    </I18nextProvider>
  );
};


export default App;