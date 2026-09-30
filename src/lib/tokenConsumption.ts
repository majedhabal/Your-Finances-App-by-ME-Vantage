import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface TokenBalanceInfo {
  giftTokens: number;
  creditTokens: number;
  totalTokens: number;
  receiptScans: number;
}

export function getEffectiveAiTokens(profile: any): number {
  if (typeof profile?.vantageAiTokens === 'number') {
    return profile.vantageAiTokens;
  }
  if (typeof profile?.aiTokens === 'number') {
    return profile.aiTokens;
  }
  return 0;
}

export function getTokenAndScanInfo(profile: any): TokenBalanceInfo {
  const giftTokens = typeof profile?.giftTokens === 'number' ? profile.giftTokens : (typeof profile?.freeAiTokens === 'number' ? profile.freeAiTokens : 0);
  const creditTokens = getEffectiveAiTokens(profile);
  const receiptScans = typeof profile?.receiptScans === 'number' ? profile.receiptScans : 0;
  return {
    giftTokens,
    creditTokens,
    totalTokens: giftTokens + creditTokens,
    receiptScans
  };
}

export async function consumeAiTokensAndScans(
  uid: string,
  profile: any,
  tokenCost: number,
  receiptScanCount: number = 0
): Promise<{ giftTokens: number; creditTokens: number; receiptScans: number }> {
  if (!uid) throw new Error("Authentication required for token billing.");

  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const currentProfile = snap.exists() ? snap.data() : profile;

  const giftTokens = typeof currentProfile?.giftTokens === 'number' ? currentProfile.giftTokens : (typeof currentProfile?.freeAiTokens === 'number' ? currentProfile.freeAiTokens : 0);
  const creditTokens = getEffectiveAiTokens(currentProfile);
  const receiptScans = typeof currentProfile?.receiptScans === 'number' ? currentProfile.receiptScans : 0;

  const scansUsingFree = Math.min(receiptScans, receiptScanCount);
  const scansUsingTokens = receiptScanCount - scansUsingFree;
  const effectiveTokenCost = tokenCost + (scansUsingTokens * 4500);

  const totalAvailable = giftTokens + creditTokens;
  if (totalAvailable < effectiveTokenCost) {
    throw new Error(
      `Insufficient AI tokens remaining. Operation requires ${effectiveTokenCost.toLocaleString()} tokens (Available: ${totalAvailable.toLocaleString()}). Please claim sandbox tokens or upgrade.`
    );
  }

  const deductGift = Math.min(giftTokens, effectiveTokenCost);
  const remainder = effectiveTokenCost - deductGift;

  const nextGiftTokens = giftTokens - deductGift;
  const nextCreditTokens = creditTokens - remainder;
  const nextReceiptScans = receiptScans - scansUsingFree;

  await updateDoc(userRef, {
    giftTokens: nextGiftTokens,
    vantageAiTokens: nextCreditTokens,
    aiTokens: nextCreditTokens,
    receiptScans: nextReceiptScans,
    updatedAt: serverTimestamp()
  });

  return {
    giftTokens: nextGiftTokens,
    creditTokens: nextCreditTokens,
    receiptScans: nextReceiptScans
  };
}


