import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  setPersistence, 
  browserLocalPersistence, 
  indexedDBLocalPersistence 
} from 'firebase/auth';
import { 
  initializeFirestore, 
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

// Singleton App Initialization
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Configure Firestore with persistent multi-tab disk cache safely
let firestoreInstance: any;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    },
    (firebaseConfig as any).firestoreDatabaseId
  );
} catch (err) {
  firestoreInstance = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
}

export const db = firestoreInstance;
export const auth = getAuth(app);

// Configure Local Persistence
if (typeof window !== 'undefined') {
  setPersistence(auth, indexedDBLocalPersistence).catch(() => {
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('[Vantage Firebase] Persistence configuration warning:', err);
    });
  });
}

export async function getCurrentUser(): Promise<any> {
  if (auth.currentUser) return auth.currentUser;
  
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      unsubscribe();
      resolve(u);
    });
    setTimeout(() => {
      unsubscribe();
      resolve(auth.currentUser);
    }, 2000);
  });
}

export let messaging: any = null;
try {
  if (typeof window !== 'undefined') {
    messaging = getMessaging(app);
  }
} catch (err) {
  console.warn('[Vantage Firebase] Messaging unavailable in this environment:', err);
}

let googleProvider: GoogleAuthProvider | null = null;
export const getGoogleProvider = () => {
  if (!googleProvider) {
    googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('https://www.googleapis.com/auth/calendar');
    googleProvider.addScope('https://www.googleapis.com/auth/tasks');
  }
  return googleProvider;
};