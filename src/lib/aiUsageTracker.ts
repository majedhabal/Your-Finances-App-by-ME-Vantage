import { doc, setDoc, increment } from 'firebase/firestore';
import { db } from './firebase';

export async function logAIUsage(
  featureKey: 'shouldIBuy' | 'vantageAIChat' | 'aiTransactionsSearch' | 'aiReceiptScanner' | 'vantageAIForecast' | 'otherAIFeatures'
) {
  try {
    const ref = doc(db, 'adminMetrics', 'aiUsage');
    await setDoc(
      ref,
      {
        [featureKey]: increment(1),
        lastUpdated: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Failed to log AI usage:', err);
  }
}
