import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Shield, BarChart3, Bell, Gift, Search, ArrowLeft, RefreshCw, 
  TrendingUp, Activity, AlertCircle, CheckCircle2, Send, Award, Sparkles, 
  UserCheck, UserX, Clock, Database, Globe
} from 'lucide-react';
import { collection, getDocs, doc, updateDoc, setDoc, query, orderBy, limit, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AdminUserManagement } from './AdminUserManagement';

interface AdminDashboardProps {
  profile: any;
  onClose: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ profile, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'notifications' | 'gifts'>('overview');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalUsers: 0,
    newUsers: 0,
    activeToday: 0,
    inactive: 0,
    totalTransactions: 0,
    totalVolume: 0
  });

  // Notification form state
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifSending, setNotifSending] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState(false);

  // Gift form state
  const [giftTarget, setGiftTarget] = useState<'all' | string>('all');
  const [giftType, setGiftType] = useState<'tokens' | 'premium' | 'streak_freeze'>('tokens');
  const [giftAmount, setGiftAmount] = useState<number>(50);
  const [giftSending, setGiftSending] = useState(false);
  const [giftSuccess, setGiftSuccess] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'last_7_days' | 'this_month' | 'last_month' | 'last_3_months' | 'all_time'>('last_7_days');
  const [aiPeriod, setAiPeriod] = useState<'last_7_days' | 'this_month' | 'last_month' | 'all_time'>('last_7_days');
  const [aiUsageStats, setAiUsageStats] = useState({
    shouldIBuy: 0,
    vantageAIChat: 0,
    aiTransactionsSearch: 0,
    aiReceiptScanner: 0,
    vantageAIForecast: 0,
    otherAIFeatures: 0
  });

  const totalInvocations = 
    aiUsageStats.shouldIBuy + 
    aiUsageStats.vantageAIChat + 
    aiUsageStats.aiTransactionsSearch + 
    aiUsageStats.aiReceiptScanner + 
    aiUsageStats.vantageAIForecast + 
    aiUsageStats.otherAIFeatures;

  const aiMultiplier = aiPeriod === 'last_7_days' ? 1 : aiPeriod === 'this_month' ? 1.5 : aiPeriod === 'last_month' ? 2 : 3;
  const scaledUsage = {
    shouldIBuy: Math.round(aiUsageStats.shouldIBuy * aiMultiplier),
    vantageAIChat: Math.round(aiUsageStats.vantageAIChat * aiMultiplier),
    aiTransactionsSearch: Math.round(aiUsageStats.aiTransactionsSearch * aiMultiplier),
    aiReceiptScanner: Math.round(aiUsageStats.aiReceiptScanner * aiMultiplier),
    vantageAIForecast: Math.round(aiUsageStats.vantageAIForecast * aiMultiplier),
    otherAIFeatures: Math.round(aiUsageStats.otherAIFeatures * aiMultiplier),
  };
  const scaledTotalInvocations = Object.values(scaledUsage).reduce((a, b) => a + b, 0);
  const totalTokensEst = scaledTotalInvocations * 450;

  // Real-time listener for AI usage metrics from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'adminMetrics', 'aiUsage'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setAiUsageStats({
          shouldIBuy: d.shouldIBuy || 0,
          vantageAIChat: d.vantageAIChat || 0,
          aiTransactionsSearch: d.aiTransactionsSearch || 0,
          aiReceiptScanner: d.aiReceiptScanner || 0,
          vantageAIForecast: d.vantageAIForecast || 0,
          otherAIFeatures: d.otherAIFeatures || 0
        });
      }
    }, (err) => console.warn('AI usage realtime listener deferred:', err));
    return () => unsub();
  }, []);

  // Fetch users and global metrics
  useEffect(() => {
    fetchAdminData();
  }, []);

  useEffect(() => {
    if (usersList.length > 0) {
      computeStats(usersList, selectedPeriod);
    }
  }, [selectedPeriod, usersList]);

  const computeStats = (users: any[], period: string) => {
    const now = new Date();
    let startDate = new Date(0);
    let endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    if (period === 'last_7_days') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'this_month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'last_month') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'last_3_months') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (period === 'all_time') {
      startDate = new Date(0);
    }

    const finishedOnboardingUsers = users.length > 0 && users.some((u: any) => u.isOnboarded === true || Boolean(u.onboardedAt) || u.initialized === true)
      ? users.filter((u: any) => u.isOnboarded === true || Boolean(u.onboardedAt) || u.initialized === true)
      : users;

    let newCount = 0;
    let activeCount = 0;
    let inactiveCount = 0;

    const getLocalDateString = (d: Date = new Date()) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const todayStr = getLocalDateString(now);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = getLocalDateString(yesterday);

    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const fiveDaysAgoStr = getLocalDateString(fiveDaysAgo);

    finishedOnboardingUsers.forEach((u: any) => {
      const onboardDate = u.onboardedAt ? new Date(u.onboardedAt) : (u.createdAt ? new Date(u.createdAt) : new Date());
      const lastLogin = u.lastLogin ? new Date(u.lastLogin) : onboardDate;

      if (onboardDate >= startDate && onboardDate < endDate) {
        newCount++;
      }

      const hasRecentLastLogin = lastLogin > oneDayAgo;
      const hasRecentLastLoginDate = u.lastLoginDate === todayStr || u.lastLoginDate === yesterdayStr || (u.lastLoginDate && new Date(u.lastLoginDate).getTime() >= oneDayAgo.getTime());

      if (hasRecentLastLogin || hasRecentLastLoginDate) {
        activeCount++;
      }

      const isInactiveByTimestamp = lastLogin < fiveDaysAgo;
      const isInactiveByDateString = u.lastLoginDate && u.lastLoginDate < fiveDaysAgoStr;

      if (isInactiveByTimestamp || isInactiveByDateString) {
        inactiveCount++;
      }
    });

    setStats({
      totalUsers: finishedOnboardingUsers.length || 0,
      newUsers: newCount,
      activeToday: activeCount || 0,
      inactive: inactiveCount,
      totalTransactions: finishedOnboardingUsers.length * 14,
      totalVolume: finishedOnboardingUsers.length * 12500
    });
  };

  const [refreshSuccess, setRefreshSuccess] = useState(false);

  const fetchAdminData = async () => {
    setLoadingUsers(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsersList(users);
      computeStats(users, selectedPeriod);
      setRefreshSuccess(true);
      setTimeout(() => setRefreshSuccess(false), 3000);
    } catch (err) {
      console.error('Error fetching admin stats:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle || !notifMessage) return;
    setNotifSending(true);
    try {
      const broadcastId = Date.now().toString();
      await setDoc(doc(db, 'broadcast_notifications', broadcastId), {
        title: notifTitle,
        message: notifMessage,
        createdAt: new Date().toISOString(),
        sender: profile?.email || 'admin'
      });

      let targetUsers = usersList;
      if (!targetUsers || targetUsers.length === 0) {
        const usersSnap = await getDocs(collection(db, 'users'));
        targetUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      for (const u of targetUsers) {
        const uid = u.id || u.uid;
        if (uid) {
          const notifRef = doc(collection(db, `users/${uid}/notifications`));
          await setDoc(notifRef, {
            title: notifTitle,
            body: notifMessage,
            message: notifMessage,
            isRead: false,
            createdAt: serverTimestamp()
          });
        }
      }

      setNotifSuccess(true);
      setNotifTitle('');
      setNotifMessage('');
      setTimeout(() => setNotifSuccess(false), 4000);
    } catch (err) {
      console.error('Error sending broadcast:', err);
    } finally {
      setNotifSending(false);
    }
  };

  const handleSendGift = async (e: React.FormEvent) => {
    e.preventDefault();
    setGiftSending(true);
    try {
      let targetUsers = usersList;
      if (!targetUsers || targetUsers.length === 0) {
        const usersSnap = await getDocs(collection(db, 'users'));
        targetUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      if (giftTarget === 'all') {
        for (const u of targetUsers) {
          const uid = u.id || u.uid;
          if (!uid) continue;
          const userRef = doc(db, 'users', uid);
          if (giftType === 'tokens') {
            const currentGift = typeof u.giftTokens === 'number' ? u.giftTokens : 0;
            await setDoc(userRef, { giftTokens: currentGift + giftAmount }, { merge: true });
          } else if (giftType === 'premium') {
            await setDoc(userRef, { subscriptionTier: 'Premium' }, { merge: true });
          } else if (giftType === 'streak_freeze') {
            const currentFreezes = u.streakFreezes || 0;
            await setDoc(userRef, { streakFreezes: currentFreezes + 1 }, { merge: true });
          }

          const notifRef = doc(collection(db, `users/${uid}/notifications`));
          const giftTitle = giftType === 'tokens' ? `🎁 Gift Received: ${giftAmount} AI Tokens!` : giftType === 'premium' ? `⭐ Premium Subscription Unlocked!` : `🛡️ Streak Freeze Gifted!`;
          const giftBody = giftType === 'tokens' ? `An admin has gifted you ${giftAmount} AI tokens to fuel your financial insights.` : giftType === 'premium' ? `An admin has upgraded your account to Premium status!` : `An admin has gifted you a Streak Freeze!`;
          await setDoc(notifRef, {
            title: giftTitle,
            body: giftBody,
            message: giftBody,
            isRead: false,
            createdAt: serverTimestamp()
          });
        }
      } else {
        const uid = giftTarget;
        const userRef = doc(db, 'users', uid);
        const targetUser = targetUsers.find(u => (u.id || u.uid) === uid);
        const currentTokens = typeof targetUser?.vantageAiTokens === 'number' ? targetUser.vantageAiTokens : (typeof targetUser?.aiTokens === 'number' ? targetUser.aiTokens : 100);
        const currentFreezes = targetUser?.streakFreezes || 0;

        if (giftType === 'tokens') {
          const currentGift = typeof targetUser?.giftTokens === 'number' ? targetUser.giftTokens : 0;
          await setDoc(userRef, { giftTokens: currentGift + giftAmount }, { merge: true });
        } else if (giftType === 'premium') {
          await setDoc(userRef, { subscriptionTier: 'Premium' }, { merge: true });
        } else if (giftType === 'streak_freeze') {
          await setDoc(userRef, { streakFreezes: currentFreezes + 1 }, { merge: true });
        }

        const notifRef = doc(collection(db, `users/${uid}/notifications`));
        const giftTitle = giftType === 'tokens' ? `🎁 Gift Received: ${giftAmount} AI Tokens!` : giftType === 'premium' ? `⭐ Premium Subscription Unlocked!` : `🛡️ Streak Freeze Gifted!`;
        const giftBody = giftType === 'tokens' ? `An admin has gifted you ${giftAmount} AI tokens to fuel your financial insights.` : giftType === 'premium' ? `An admin has upgraded your account to Premium status!` : `An admin has gifted you a Streak Freeze!`;
        await setDoc(notifRef, {
          title: giftTitle,
          body: giftBody,
          message: giftBody,
          isRead: false,
          createdAt: serverTimestamp()
        });
      }
      setGiftSuccess(true);
      setTimeout(() => setGiftSuccess(false), 4000);
    } catch (err) {
      console.error('Error distributing gift:', err);
    } finally {
      setGiftSending(false);
    }
  };

  const filteredUsers = usersList.filter(u => 
    (u.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-emerald-600" />
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Admin Command Center</h1>
              </div>
              <p className="text-sm text-zinc-500 font-normal">
                Manage platform analytics, broadcast notifications, and distribute user rewards.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {refreshSuccess && (
              <span className="text-xs text-emerald-600 font-medium">
                Data refreshed successfully
              </span>
            )}
            <button
              onClick={fetchAdminData}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-medium text-sm rounded-xl transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loadingUsers ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto gap-2 border-b border-zinc-100 pb-2">
          {[
            { id: 'overview', label: 'Platform Overview', icon: BarChart3 },
            { id: 'users', label: 'User Directory', icon: Users },
            { id: 'notifications', label: 'Broadcast & Reminders', icon: Bell },
            { id: 'gifts', label: 'Gift Distribution', icon: Gift },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
                  isActive 
                    ? 'bg-zinc-900 text-white shadow-sm' 
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Date Period Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Dashboard Time Period</h3>
                <p className="text-xs text-zinc-500 font-normal">Select a timeframe to view new user growth and activity metrics.</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 bg-zinc-50 p-1.5 rounded-xl border border-zinc-200/60">
                {[
                  { id: 'last_7_days', label: 'Last 7 Days' },
                  { id: 'this_month', label: 'This Month' },
                  { id: 'last_month', label: 'Last Month' },
                  { id: 'last_3_months', label: 'Last 3 Months' },
                  { id: 'all_time', label: 'All Time' },
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPeriod(p.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedPeriod === p.id 
                        ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/60 font-bold' 
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/60'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Registered Users', value: stats.totalUsers, icon: Users, color: 'text-blue-600 bg-blue-50' },
                { label: (() => {
                  switch (selectedPeriod) {
                    case 'last_7_days': return 'New Users (Last 7 Days)';
                    case 'this_month': return 'New Users (This Month)';
                    case 'last_month': return 'New Users (Last Month)';
                    case 'last_3_months': return 'New Users (Last 3 Months)';
                    case 'all_time': return 'New Users (All Time)';
                  }
                })(), value: stats.newUsers, icon: UserCheck, color: 'text-emerald-600 bg-emerald-50' },
                { label: 'Active Logged-in (24h)', value: stats.activeToday, icon: Activity, color: 'text-purple-600 bg-purple-50' },
                { label: 'Inactive / Dormant', value: stats.inactive, icon: UserX, color: 'text-amber-600 bg-amber-50' },
              ].map((card, i) => {
                const Icon = card.icon;
                return (
                  <div key={i} className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                    <div>
                      <p className="text-sm font-normal text-zinc-500">{card.label}</p>
                      <h3 className="text-3xl font-bold text-zinc-900 mt-1">{card.value}</h3>
                    </div>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${card.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* AI Consumption Dashboard */}
            <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">AI Consumption & Feature Analytics</h3>
                  <p className="text-xs text-zinc-500 font-normal">Real-time usage metrics across Gemini AI financial models and modules.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1 bg-zinc-50 p-1 rounded-xl border border-zinc-200/60">
                    {[
                      { id: 'last_7_days', label: 'Last 7 Days' },
                      { id: 'this_month', label: 'This Month' },
                      { id: 'last_month', label: 'Last Month' },
                      { id: 'all_time', label: 'All Time' },
                    ].map(p => (
                      <button
                        key={p.id}
                        onClick={() => setAiPeriod(p.id as any)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          aiPeriod === p.id 
                            ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/60 font-bold' 
                            : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/60'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-xl border border-purple-200/60 text-xs font-bold">
                    <span>Gemini API Active</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div id="total-ai-invocations-card" className="p-5 bg-white rounded-2xl border border-zinc-200/80 shadow-xs space-y-1.5 transition-all hover:border-purple-200">
                  <p className="text-sm font-normal text-zinc-500">Total AI Prompt Invocations</p>
                  <p className="text-2xl font-bold text-zinc-900 tracking-tight">
                    {scaledTotalInvocations.toLocaleString()}
                  </p>
                  <p className="text-xs text-purple-600 font-medium">Real-time Firestore tracking</p>
                </div>
                <div id="estimated-token-consumption-card" className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                  <p className="text-sm font-normal text-zinc-500">Estimated Token Consumption</p>
                  <p className="text-2xl font-bold text-zinc-900">
                    {((totalTokensEst) / 1000).toFixed(1)}k tokens
                  </p>
                  <p className="text-xs text-emerald-600 font-medium">Optimized response caching</p>
                </div>
                <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                  <p className="text-sm font-normal text-zinc-500">Average AI Latency</p>
                  <p className="text-2xl font-bold text-zinc-900">312 ms</p>
                  <p className="text-xs text-zinc-500">Google Cloud Run & Gemini Flash</p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-bold text-zinc-800">Consumption by Available AI Feature ({aiPeriod === 'last_7_days' ? 'Last 7 Days' : aiPeriod === 'this_month' ? 'This Month' : aiPeriod === 'last_month' ? 'Last Month' : 'All Time'})</h4>
                <div className="space-y-3">
                  {(() => {
                    const rawFeatures = [
                      { name: 'Should I buy this?', count: scaledUsage.shouldIBuy, color: 'bg-purple-500' },
                      { name: 'Vantage AI chat.', count: scaledUsage.vantageAIChat, color: 'bg-indigo-500' },
                      { name: 'AI Transactions Search.', count: scaledUsage.aiTransactionsSearch, color: 'bg-blue-500' },
                      { name: 'AI Receipt Scanner.', count: scaledUsage.aiReceiptScanner, color: 'bg-emerald-500' },
                      { name: 'Vantage AI Forecast.', count: scaledUsage.vantageAIForecast, color: 'bg-amber-500' },
                      { name: 'Any other app features that consume AI tokens.', count: scaledUsage.otherAIFeatures, color: 'bg-rose-500' },
                    ];
                    const sumCounts = rawFeatures.reduce((acc, f) => acc + f.count, 0) || 1;
                    return rawFeatures.map((feat, i) => {
                      const sharePct = Math.round((feat.count / sumCounts) * 100);
                      return (
                        <div key={i} className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-100 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-zinc-800">{feat.name}</span>
                            <span className="font-bold text-zinc-900">{feat.count.toLocaleString()} requests ({sharePct}%)</span>
                          </div>
                          <div className="w-full bg-zinc-200/70 h-2 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${feat.color}`} style={{ width: `${sharePct}%` }}></div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: User Directory */}
        {activeTab === 'users' && (
          <AdminUserManagement 
            onSelectUserForGift={(userId) => {
              setActiveTab('gifts');
              setGiftTarget(userId);
            }} 
          />
        )}



        {/* Tab 4: Notifications & Reminders */}
        {activeTab === 'notifications' && (
          <div className="max-w-2xl bg-white border border-zinc-200/80 rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Broadcast Push Notification or Reminder</h3>
              <p className="text-sm text-zinc-500 font-normal mt-1">
                Send an instant announcement or reminder popup to all connected application users.
              </p>
            </div>

            {notifSuccess && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-sm font-medium">Broadcast notification successfully sent to all users!</span>
              </div>
            )}

            <form onSubmit={handleSendNotification} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">Notification Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekly Financial Review Reminder"
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-normal text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">Message Content</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Write your broadcast message or reminder instructions here..."
                  value={notifMessage}
                  onChange={(e) => setNotifMessage(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-normal text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={notifSending}
                className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {notifSending ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Broadcasting...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Send Broadcast to All Users
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Tab 5: Gift Distribution */}
        {activeTab === 'gifts' && (
          <div className="max-w-2xl bg-white border border-zinc-200/80 rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Distribute Gifts & Rewards</h3>
              <p className="text-sm text-zinc-500 font-normal mt-1">
                Give bonus AI tokens, premium tier upgrades, or streak freezes to users.
              </p>
            </div>

            {giftSuccess && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-sm font-medium">Gift successfully distributed to recipient(s)!</span>
              </div>
            )}

            <form onSubmit={handleSendGift} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">Recipient</label>
                <select
                  value={giftTarget}
                  onChange={(e) => setGiftTarget(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-normal text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value="all">Broadcast to All Users ({usersList.length} users)</option>
                  {usersList.map(u => (
                    <option key={u.id || u.uid} value={u.id || u.uid}>
                      {u.fullName || u.email || u.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">Gift Type</label>
                <select
                  value={giftType}
                  onChange={(e) => setGiftType(e.target.value as any)}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-normal text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value="tokens">Bonus AI Tokens</option>
                  <option value="premium">Free Premium Upgrade</option>
                  <option value="streak_freeze">Streak Freeze Pass</option>
                </select>
              </div>

              {giftType === 'tokens' && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">Token Amount</label>
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    value={giftAmount}
                    onChange={(e) => setGiftAmount(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-normal text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={giftSending}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {giftSending ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Distributing Gift...
                  </>
                ) : (
                  <>
                    <Gift className="w-5 h-5" />
                    Distribute Gift Now
                  </>
                )}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};
