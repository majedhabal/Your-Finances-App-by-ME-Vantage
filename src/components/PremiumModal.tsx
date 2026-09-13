import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ShieldCheck, Zap, X, Check, CreditCard, Flame, Trophy } from 'lucide-react';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { useTranslation } from '@/lib/i18n';
import { DEFAULT_RATES } from '../lib/exchangeRates';

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  onSuccess: (profile: any) => void;
  profile: any;
}

interface TierPlan {
  id: 'free' | 'tier1' | 'tier2' | 'tier3';
  name: string;
  priceAED: number;
  tokens: number;
  icon: any;
  features: string[];
  color: string;
  badge?: string;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({ isOpen, onClose, uid, onSuccess, profile }) => {
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('hide-header-footer');
      window.dispatchEvent(new CustomEvent('premium-modal-toggled', { detail: { isOpen: true } }));
    } else {
      document.body.style.overflow = 'auto';
      document.body.classList.remove('hide-header-footer');
      window.dispatchEvent(new CustomEvent('premium-modal-toggled', { detail: { isOpen: false } }));
    }
    return () => {
      document.body.style.overflow = 'auto';
      document.body.classList.remove('hide-header-footer');
      window.dispatchEvent(new CustomEvent('premium-modal-toggled', { detail: { isOpen: false } }));
    };
  }, [isOpen]);

  const [step, setStep] = useState<'benefits' | 'payment' | 'success' | 'cancellationFeedback'>('benefits');
  const [hasReadTerms, setHasReadTerms] = useState(!!profile?.hasAcceptedTerms);
  
  // Selected premium tier defaults to Tier 1
  const [selectedTierId, setSelectedTierId] = useState<'tier1' | 'tier2' | 'tier3'>('tier2');
  
  // No simulated IP location needed
  
  const plans: TierPlan[] = [
    {
      id: 'free',
      name: t('premium_modal.free_starter'),
      priceAED: 0,
      tokens: 0,
      icon: ShieldCheck,
      color: 'text-neutral-500',
      features: [
        t('premium_modal.feat_free_1'),
        t('premium_modal.feat_free_2'),
        t('premium_modal.feat_free_3'),
        t('premium_modal.feat_free_4')
      ]
    },
    {
      id: 'tier1',
      name: t('premium_modal.tier1'),
      priceAED: 19.99,
      tokens: 0,
      icon: Zap,
      color: 'text-emerald-600',
      features: [
        t('premium_modal.feat_tier1_1'),
        t('premium_modal.feat_tier1_2'),
        t('premium_modal.feat_tier1_3'),
        t('premium_modal.feat_tier1_4')
      ]
    },
    {
      id: 'tier2',
      name: t('premium_modal.tier2'),
      priceAED: 24.99,
      tokens: 120000,
      icon: Flame,
      color: 'text-amber-500',
      badge: t('premium_modal.best_value'),
      features: [
        t('premium_modal.feat_tier2_1'),
        t('premium_modal.feat_tier2_2'),
        t('premium_modal.feat_tier2_3'),
        t('premium_modal.feat_tier2_4')
      ]
    },
    {
      id: 'tier3',
      name: t('premium_modal.tier3'),
      priceAED: 49.99,
      tokens: 250000,
      icon: Trophy,
      color: 'text-indigo-600',
      features: [
        t('premium_modal.feat_tier3_1'),
        t('premium_modal.feat_tier3_2'),
        t('premium_modal.feat_tier3_3'),
        t('premium_modal.feat_tier3_4')
      ]
    }
  ];
  
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [showCancellationFeedback, setShowCancellationFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  const getRateToAED = (curr: string) => {
    const c = curr || 'AED';
    if (c === 'AED') return 1;
    return (DEFAULT_RATES as any)[c] || 1;
  };

  const handleSubscribe = async () => {
    if (!hasReadTerms) return;
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const targetPlan = plans.find(p => p.id === selectedTierId);
    if (!targetPlan) return;

    // Map tier ID to readable tier name for DB
    const tierNameMap = {
      tier1: 'tier 1',
      tier2: 'tier 2',
      tier3: 'tier 3'
    };
    const mappedTier = tierNameMap[selectedTierId];

    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { 
        subscriptionTier: mappedTier,
        vantageAiTokens: targetPlan.tokens,
        isPremium: true,
        premiumSince: new Date().toISOString(),
        hasAcceptedTerms: true
      });
      onSuccess({ 
        ...profile, 
        subscriptionTier: mappedTier, 
        vantageAiTokens: targetPlan.tokens,
        isPremium: true, 
        hasAcceptedTerms: true 
      });
      setStep('success');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const activePlan = plans.find(p => p.id === selectedTierId) || plans[1];
  const userCurrentTier = (profile?.subscriptionTier || 'free').toLowerCase().replace(' ', '');
  const isUserPremium = !!(profile.isPremium || (profile.subscriptionTier && profile.subscriptionTier.toLowerCase() !== 'free'));

  const handleCancelSubscription = async () => {
    setStep('cancellationFeedback');
  };

  const confirmCancelSubscription = async () => {
    setIsProcessing(true);
    try {
      // Save feedback
      if (feedbackText.trim()) {
        await addDoc(collection(db, 'feedback'), {
          userId: uid,
          feedback: feedbackText,
          timestamp: serverTimestamp(),
          reason: 'subscription_cancellation'
        });
      }

      // Cancel subscription
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { 
        isPremium: false,
        subscriptionTier: 'free',
        vantageAiTokens: 0,
        premiumSince: null
      });
      onSuccess({ 
        ...profile,
        isPremium: false,
        subscriptionTier: 'free',
        vantageAiTokens: 0,
        premiumSince: null
      });
      onClose();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    } finally {
      setIsProcessing(false);
      setShowCancellationFeedback(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60"
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.15 }}
            style={{ fontFamily: "'Google Sans', sans-serif" }}
            id="subscription-plans-modal"
            className="relative w-full max-w-[480px] bg-white border border-neutral-200 rounded-[2rem] overflow-hidden shadow-2xl z-10 max-h-[92vh] flex flex-col"
          >
            {/* Modal Scrollable Container */}
            <div className="overflow-y-auto flex-1 p-6 md:p-8 flex flex-col gap-6">
              {step === 'cancellationFeedback' && (
                <div className="flex flex-col gap-6">
                  <h3 className="text-xl font-bold text-neutral-800">{t('premium_modal.sad_to_see_go')}</h3>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    className="w-full h-32 p-4 border border-neutral-200 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500"
                    placeholder={t('premium_modal.share_thoughts')}
                  />
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={confirmCancelSubscription}
                      disabled={isProcessing}
                      className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl active:scale-95 transition-all text-sm"
                    >
                      {isProcessing ? t('premium_modal.processing') : t('premium_modal.confirm_cancellation')}
                    </button>
                    <button
                      onClick={() => setStep('benefits')}
                      className="w-full py-3 text-neutral-500 font-bold tracking-wide rounded-2xl border border-neutral-200 hover:bg-neutral-50 active:scale-95 transition-all text-sm"
                    >
                      {t('premium_modal.cancel')}
                    </button>
                  </div>
                </div>
              )}
                    {step === 'benefits' && (
                <>
                  {/* Header */}
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="text-emerald-600" size={24} />
                        <h3 className="text-2xl font-bold tracking-tight text-emerald-600 leading-tight">
                          {t('premium_modal.subscription_plans')}
                        </h3>
                      </div>
                      <p className="text-xs text-neutral-500 font-normal">
                        {t('premium_modal.plans_desc')}
                      </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-700 transition-colors active:scale-90" aria-label="Close">
                      <X size={24} />
                    </button>
                  </div>

                  {/* Subscription tiers list */}
                  <div className="flex flex-col gap-3.5">
                    {plans.map((plan) => {
                      const isUserCurrent = userCurrentTier === plan.id || 
                        (plan.id === 'free' && (!userCurrentTier || userCurrentTier === 'free')) ||
                        (plan.id === 'tier1' && userCurrentTier === 'tier1') ||
                        (plan.id === 'tier2' && userCurrentTier === 'tier2') ||
                        (plan.id === 'tier3' && userCurrentTier === 'tier3');
                        
                      const isSelected = selectedTierId === plan.id;
                      const PlanIcon = plan.icon;

                      return (
                        <div 
                          key={plan.id}
                          onClick={() => {
                            if (plan.id !== 'free') {
                              setSelectedTierId(plan.id as any);
                            }
                          }}
                          className={`p-4 rounded-2xl border transition-all relative flex flex-col gap-3 bg-white ${
                            plan.id === 'free' ? 'opacity-80 cursor-default' : 'cursor-pointer'
                          } ${
                            isSelected && plan.id !== 'free'
                              ? 'border-emerald-500 ring-1 ring-emerald-500/50 shadow-md' 
                              : 'border-neutral-200 hover:border-neutral-300'
                          }`}
                        >
                          {plan.badge && (
                            <span className="absolute right-4 top-4 bg-emerald-50 text-emerald-700 text-[12px] font-bold px-2 py-0.5 rounded-full">
                              {plan.badge}
                            </span>
                          )}

                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl bg-neutral-50 flex items-center justify-center shrink-0`}>
                              <PlanIcon className={plan.color} size={20} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-neutral-800 flex items-center gap-1.5">
                                {plan.name}
                                {isUserCurrent && (
                                  <span className="text-[12px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded-full font-bold">
                                    {t('premium_modal.current')}
                                  </span>
                                )}
                              </span>
                              <span className="text-xs font-bold text-neutral-900 mt-0.5">
                                {plan.priceAED === 0 ? t('premium_modal.free') : t('premium_modal.per_month', { price: plan.priceAED })}
                              </span>
                            </div>
                          </div>

                          {/* Currency Conversions Equivalent */}
                          {plan.priceAED > 0 && (
                            <div className="text-[12px] text-neutral-500 font-normal pl-1 px-1 bg-neutral-50 rounded py-1 border border-neutral-100/50">
                              {plan.priceAED} AED
                            </div>
                          )}

                          <ul className="grid grid-cols-1 gap-1.5 pl-1.5 mt-1">
                            {plan.features.map((feat, fIdx) => (
                              <li key={fIdx} className="flex items-start gap-2 text-xs text-neutral-600 font-normal leading-relaxed">
                                <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                                <span>{feat}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-col gap-3 mt-2">
                    <button 
                      onClick={() => setStep('payment')}
                      className="w-full py-4 bg-emerald-600 text-white font-bold tracking-wide rounded-2xl shadow-sm hover:bg-emerald-700 active:scale-95 transition-all text-sm"
                    >
                      {isUserPremium ? t('premium_modal.upgrade_change_plan') : t('premium_modal.continue_with', { name: activePlan.name })}
                    </button>
                    {isUserPremium && (
                        <button
                          onClick={handleCancelSubscription}
                          disabled={isProcessing}
                          className="w-full py-3 text-neutral-500 font-bold tracking-wide rounded-2xl border border-neutral-200 hover:bg-neutral-50 active:scale-95 transition-all text-sm"
                        >
                            {isProcessing ? t('premium_modal.processing') : t('premium_modal.cancel_subscription')}
                        </button>
                    )}
                    <p className="text-[12px] text-center text-neutral-500 font-normal">
                      {t('premium_modal.cancel_anytime_note')}
                    </p>
                  </div>
                </>
              )}

              {step === 'payment' && (
                <>
                  {/* Header */}
                  <div className="flex justify-between items-start">
                    <button 
                      onClick={() => setStep('benefits')} 
                      className="text-xs font-bold text-neutral-500 tracking-wide hover:text-emerald-600 transition-colors"
                    >
                      {t('premium_modal.back_to_plans')}
                    </button>
                    <h3 className="text-lg font-bold text-neutral-800">{t('premium_modal.premium_authorization')}</h3>
                    <div className="w-10"></div>
                  </div>

                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-bold text-neutral-500 tracking-wider">{t('premium_modal.payment_instrument')}</label>
                      <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CreditCard className="text-neutral-500" size={20} />
                          <span className="text-sm font-bold text-neutral-800">•••• •••• •••• 8812</span>
                        </div>
                        <span className="text-[12px] font-bold text-neutral-400">{t('premium_modal.mock_card')}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-500 font-normal">{t('premium_modal.plan_title')}</span>
                        <span className="font-bold text-neutral-800">{activePlan.name}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-500 font-normal">{t('premium_modal.base_value')}</span>
                        <span className="font-bold text-neutral-800">{t('premium_modal.per_month', { price: activePlan.priceAED })}</span>
                      </div>
                      <div className="flex justify-between text-xs pt-2 border-t border-neutral-200">
                        <span className="text-neutral-500 font-normal">{t('premium_modal.local_geolocation_equivalent')}</span>
                        <span className="font-bold text-emerald-600">
                          {t('premium_modal.dubai_base')}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-500 font-normal">{t('premium_modal.service_period')}</span>
                        <span className="font-bold text-neutral-800">{t('premium_modal.monthly_recurring')}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-4 bg-neutral-50 border border-neutral-100 rounded-xl">
                      <input 
                        type="checkbox" 
                        id="opt-terms-check"
                        checked={hasReadTerms}
                        onChange={(e) => setHasReadTerms(e.target.checked)}
                        className="mt-1 w-4 h-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div className="flex flex-col gap-2">
                        <label htmlFor="opt-terms-check" className="text-xs text-neutral-500 font-normal leading-relaxed cursor-pointer select-none">
                          {t('premium_modal.terms_label')}
                        </label>
                        <div className="flex gap-4">
                          <a href="https://www.yourfinances.me/privacy" target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 font-bold hover:underline">
                            {t('premium_modal.privacy_policy')}
                          </a>
                          <a href="https://www.yourfinances.me/terms-of-engagement" target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 font-bold hover:underline">
                            {t('premium_modal.terms_of_engagement')}
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button 
                    disabled={isProcessing || !hasReadTerms}
                    onClick={handleSubscribe}
                    className={`w-full py-4 text-white font-bold rounded-2xl shadow-sm flex items-center justify-center gap-2 transition-all text-sm ${
                      isProcessing || !hasReadTerms 
                        ? 'bg-neutral-300 text-neutral-500 opacity-60 cursor-not-allowed' 
                        : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white'
                    }`}
                  >
                    {isProcessing ? (
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck size={18} />
                        {t('premium_modal.confirm_btn')}
                      </>
                    )}
                  </button>
                </>
              )}

              {step === 'success' && (
                <div className="py-6 flex flex-col items-center gap-6 text-center">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 12, stiffness: 300 }}
                    className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center"
                  >
                    <Check className="text-emerald-600" size={36} />
                  </motion.div>
                  
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-xl font-bold text-emerald-600 leading-tight">
                      {t('premium_modal.welcome')}
                    </h3>
                    <p className="text-xs text-neutral-500 font-normal leading-relaxed px-4">
                      {t('premium_modal.advantages_provisioned')}
                    </p>
                  </div>

                  <button 
                    onClick={onClose}
                    className="mt-2 px-8 py-3 bg-emerald-600 text-white font-bold rounded-full shadow-lg hover:bg-emerald-700 active:scale-95 transition-all text-xs"
                  >
                    {t('premium_modal.enter_private')}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
