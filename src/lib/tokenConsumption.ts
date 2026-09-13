import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface TokenBalanceInfo {
  giftTokens: number;
  creditTokens: number;
  totalTokens: number;
  receiptScans: number;
}

export function getTokenAndScanInfo(profile: any): TokenBalanceInfo {
  const giftTokens = typeof profile?.giftTokens === 'number' ? profile.giftTokens : (typeof profile?.freeAiTokens === 'number' ? profile.freeAiTokens : 0);
  const creditTokens = typeof profile?.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0;
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
  const info = getTokenAndScanInfo(profile);

  // Priority 1: Free scan receipts over tokens
  const scansUsingFree = Math.min(info.receiptScans, receiptScanCount);
  const scansUsingTokens = receiptScanCount - scansUsingFree;
  const effectiveTokenCost = tokenCost + (scansUsingTokens * 4500);

  // Priority 2: Free gift tokens over user credit (vantageAiTokens)
  const totalAvailableTokens = info.giftTokens + info.creditTokens;
  if (totalAvailableTokens < effectiveTokenCost) {
    throw new Error(
      `Insufficient AI tokens remaining. Operation requires ${effectiveTokenCost.toLocaleString()} tokens (Free Gift: ${info.giftTokens.toLocaleString()}, Credit: ${info.creditTokens.toLocaleString()}). Please upgrade or claim free gift tokens.`
    );
  }

  const deductGift = Math.min(info.giftTokens, effectiveTokenCost);
  const remainingCost = effectiveTokenCost - deductGift;

  const nextGiftTokens = info.giftTokens - deductGift;
  const nextCreditTokens = info.creditTokens - remainingCost;
  const nextReceiptScans = info.receiptScans - scansUsingFree;

  if (uid) {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      giftTokens: nextGiftTokens,
      vantageAiTokens: nextCreditTokens,
      receiptScans: nextReceiptScans,
      updatedAt: serverTimestamp()
    });
  }

  return {
    giftTokens: nextGiftTokens,
    creditTokens: nextCreditTokens,
    receiptScans: nextReceiptScans
  };
}
