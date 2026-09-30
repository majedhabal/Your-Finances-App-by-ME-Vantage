import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, X, CreditCard, Sparkles, Zap, Star, Shield } from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { getEffectiveAiTokens } from '../lib/tokenConsumption';

interface TokenShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  onSuccess: (profile: any) => void;
  profile: any;
}

export const TokenShopModal: React.FC<TokenShopModalProps> = ({ isOpen, onClose, uid, onSuccess, profile }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPack, setSelectedPack] = useState<string | null>(null);

  if (!isOpen) return null;

  const packs = [
    {
      id: 'streak_freezes',
      name: 'Streak Freezes',
      tokens: 0,
      streakFreezes: 2,
      priceAED: 3.99,
      icon: Shield,
      color: 'text-orange-500',
      bg: 'bg-orange-50'
    },
    {
      id: 'quick_refill',
      name: 'Quick Refill',
      tokens: 15000,
      priceAED: 9.99,
      icon: Zap,
      color: 'text-blue-500',
      bg: 'bg-blue-50'
    },
    {
      id: 'executive_booster',
      name: 'Executive Booster',
      tokens: 45000,
      priceAED: 19.99,
      icon: Star,
      color: 'text-amber-500',
      bg: 'bg-amber-50'
    },
    {
      id: 'command_pack',
      name: 'Command Pack',
      tokens: 100000,
      priceAED: 34.99,
      icon: Sparkles,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50'
    }
  ];

  const grantPack = async (packId: string) => {
    const pack = packs.find(p => p.id === packId);
    if (!pack || !uid) return;
    
    try {
      const userRef = doc(db, 'users', uid);
      const updateData: any = {
        updatedAt: serverTimestamp()
      };
      let newProfile = { ...profile };

      if (pack.id === 'streak_freezes') {
        const currentFreezes = typeof profile?.streakFreezes === 'number' ? profile.streakFreezes : 0;
        const newFreezes = currentFreezes + (pack.streakFreezes || 2);
        updateData.streakFreezes = newFreezes;
        newProfile.streakFreezes = newFreezes;
      } else {
        const currentTokens = getEffectiveAiTokens(profile);
        const newTokens = currentTokens + (pack.tokens || 0);
        updateData.vantageAiTokens = newTokens;
        updateData.aiTokens = newTokens;
        newProfile.vantageAiTokens = newTokens;
        newProfile.aiTokens = newTokens;
      }
      
      await updateDoc(userRef, updateData);
      
      onSuccess(newProfile);
      onClose();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, 'Purchase Pack');
    }
  };

  const handleGooglePlayPurchase = async () => {
    if (!selectedPack) return;
    setIsProcessing(true);
    try {
      // PWABuilder Android implementation uses the W3C Digital Goods API
      if ('getDigitalGoodsService' in window) {
        // @ts-ignore
        const service = await window.getDigitalGoodsService('https://play.google.com/billing');
        
        const request = new PaymentRequest(
          [{
            supportedMethods: 'https://play.google.com/billing',
            data: { sku: selectedPack }
          }],
          {
            total: {
              label: 'Tokens',
              amount: { currency: 'USD', value: '1.00' }
            }
          }
        );
        
        const response = await request.show();
        await response.complete('success');
        
        // Acknowledge the purchase (required by Google Play)
        // @ts-ignore
        await service.acknowledge(response.details.token, 'onetime');
        
        await grantPack(selectedPack);
      } else {
        console.log('Digital Goods API not available. Simulating purchase for testing.');
        await grantPack(selectedPack);
      }
    } catch (err: any) {
      console.error('Google Play purchase failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplePayPurchase = async () => {
    if (!selectedPack) return;
    const pack = packs.find(p => p.id === selectedPack);
    setIsProcessing(true);
    try {
      // PWABuilder iOS uses standard Payment Request API for Apple Pay
      if (window.PaymentRequest) {
        const request = new PaymentRequest(
          [{
            supportedMethods: 'https://apple.com/apple-pay',
            data: {
              version: 3,
              merchantIdentifier: 'merchant.com.vantage.app',
              merchantCapabilities: ['supports3DS'],
              supportedNetworks: ['visa', 'masterCard', 'amex'],
              countryCode: 'AE',
            }
          }],
          {
            total: {
              label: pack?.name || 'Vantage AI Pack',
              amount: { currency: 'AED', value: pack?.priceAED.toString() || '0' }
            }
          }
        );
        
        const canMakePayment = await request.canMakePayment();
        if (canMakePayment) {
          const response = await request.show();
          await response.complete('success');
          await grantPack(selectedPack);
          return;
        }
      }
      console.log('Apple Pay not available. Simulating purchase for testing.');
      await grantPack(selectedPack);
    } catch (err: any) {
      console.error('Apple Pay purchase failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStandardPurchase = async () => {
    if (!selectedPack) return;
    setIsProcessing(true);
    // Simulate standard credit card processing or redirect to Stripe checkout
    setTimeout(() => {
      grantPack(selectedPack).finally(() => setIsProcessing(false));
    }, 1500);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-neutral-900/50 backdrop-blur-xs"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl border border-neutral-100 overflow-hidden"
          >
            <div className="p-4 sm:p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h2 className="text-[16px] font-bold text-[#111c2d] font-['Google_Sans',sans-serif] leading-tight">Token Shop</h2>
                  <p className="text-[12px] text-neutral-500 font-normal mt-0.5 font-['Google_Sans',sans-serif]">Boost your executive bandwidth to power AI insights.</p>
                </div>
                <button 
                  onClick={onClose}
                  className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-between mb-4">
                <span className="text-[12px] text-neutral-500 font-normal font-['Google_Sans',sans-serif]">Current Balance</span>
                <span className="text-[16px] font-bold text-[#111c2d] font-['Google_Sans',sans-serif]">{(typeof profile?.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0).toLocaleString()} Tokens</span>
              </div>

              <div className="space-y-2 mb-4">
                {packs.map((pack) => (
                  <div 
                    key={pack.id}
                    onClick={() => setSelectedPack(pack.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${selectedPack === pack.id ? 'border-[#A6DDB1] bg-[#A6DDB1]/10 shadow-xs' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${pack.bg} flex items-center justify-center shrink-0`}>
                        <pack.icon size={16} className={pack.color} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[16px] font-bold text-[#111c2d] font-['Google_Sans',sans-serif] leading-snug">{pack.name}</span>
                        <span className="text-[12px] text-neutral-500 font-normal font-['Google_Sans',sans-serif]">
                          {pack.streakFreezes ? `+${pack.streakFreezes} Streak Freezes` : `+${pack.tokens.toLocaleString()} Tokens`}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className="text-[16px] font-bold text-[#111c2d] font-['Google_Sans',sans-serif]">{pack.priceAED} AED</span>
                    </div>
                  </div>
                ))}
              </div>

              {selectedPack ? (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleApplePayPurchase}
                    disabled={isProcessing}
                    className="w-full py-2.5 rounded-xl bg-black text-white text-[12px] font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 hover:bg-neutral-900 transition-colors font-['Google_Sans',sans-serif]"
                  >
                    {isProcessing ? (
                      <span className="animate-pulse">Processing...</span>
                    ) : (
                      <>
                        <span className="text-[14px] leading-none mt-[-1px]"></span> Pay
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleGooglePlayPurchase}
                    disabled={isProcessing}
                    className="w-full py-2.5 rounded-xl bg-[#008744] text-white text-[12px] font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 hover:bg-[#007038] transition-colors font-['Google_Sans',sans-serif]"
                  >
                    {isProcessing ? (
                      <span className="animate-pulse">Processing...</span>
                    ) : (
                      <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4.3 22.4l11.4-11.4-11.4-11.4c-.2.2-.3.6-.3 1.1v20.6c0 .5.1.9.3 1.1z"/>
                          <path d="M16.9 12.1l-1.2-1.2-11.4 11.4 12.6-7.2c.4-.2.6-.6.6-1 0-.4-.2-.8-.6-1z"/>
                        </svg>
                        Google Play
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleStandardPurchase}
                    disabled={isProcessing}
                    className="w-full py-2.5 rounded-xl bg-white border border-neutral-200 text-neutral-900 text-[12px] font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 hover:bg-neutral-50 transition-colors font-['Google_Sans',sans-serif]"
                  >
                    {isProcessing ? (
                      <span className="animate-pulse">Processing...</span>
                    ) : (
                      <>
                        <CreditCard size={16} />
                        Credit Card
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  disabled
                  className="w-full py-2.5 rounded-xl bg-neutral-100 text-neutral-400 text-[12px] font-bold flex items-center justify-center gap-1.5 font-['Google_Sans',sans-serif]"
                >
                  Select a pack to continue
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
