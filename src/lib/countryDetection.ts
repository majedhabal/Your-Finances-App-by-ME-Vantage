import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

/**
 * Utility functions to detect and assign country via backend API
 */

export interface DetectedCountryResult {
  countryCode: string;
  countryName: string;
  city?: string;
  region?: string;
  ip?: string;
  source?: string;
}

export interface AssignCountryResponse {
  success: boolean;
  uid: string;
  country: string;
  countryCode: string;
  savedToFirestore?: boolean;
  details?: DetectedCountryResult;
}

/**
 * Calls backend to detect caller's country without saving to Firestore
 */
export async function detectCountryFromBackend(): Promise<DetectedCountryResult> {
  try {
    const res = await fetch('/api/detect-country');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[CountryDetection] Failed to detect country from backend:', err);
    return {
      countryCode: 'AE',
      countryName: 'United Arab Emirates',
      source: 'fallback'
    };
  }
}

/**
 * Calls backend to detect caller's country and automatically assign it to users/{uid} in Firestore
 */
export async function assignUserCountryFromBackend(uid: string, forceCountry?: string, forceCountryCode?: string): Promise<AssignCountryResponse | null> {
  if (!uid) return null;
  try {
    const res = await fetch('/api/user/assign-country', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uid,
        forceCountry,
        forceCountryCode,
      }),
    });

    if (!res.ok) {
      console.warn(`[CountryDetection] Backend assign-country returned status ${res.status}`);
    }

    const data: AssignCountryResponse = res.ok ? await res.json() : {
      success: false,
      uid,
      country: forceCountry || 'United Arab Emirates',
      countryCode: forceCountryCode || 'AE'
    };

    console.log('[CountryDetection] Backend assign-country response:', data);

    // Sync country directly from client-side where user IS authenticated and allowed by Firestore security rules
    if (data.country && data.countryCode && auth.currentUser && auth.currentUser.uid === uid) {
      try {
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, {
          country: data.country,
          countryCode: data.countryCode,
          updatedAt: serverTimestamp()
        }, { merge: true });
        console.log('[CountryDetection] Successfully synced country to user profile in Firestore from client auth session.');
      } catch (fsErr) {
        console.warn('[CountryDetection] Client-side Firestore country sync warning:', fsErr);
      }
    }

    return data;
  } catch (err) {
    console.error('[CountryDetection] Error assigning country from backend:', err);
    return null;
  }
}

