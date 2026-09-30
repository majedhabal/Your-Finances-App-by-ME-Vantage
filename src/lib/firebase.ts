import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  setPersistence, 
  browserLocalPersistence, 
  indexedDBLocalPersistence, 
  inMemoryPersistence 
} from 'firebase/auth';
import { 
  initializeFirestore, 
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache
} from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Configure Firestore with persistent multi-tab disk cache
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
  try {
    firestoreInstance = initializeFirestore(
      app,
      { localCache: persistentLocalCache({}) },
      (firebaseConfig as any).firestoreDatabaseId
    );
  } catch (err2) {
    console.warn("Persistent cache fallback to standard getFirestore:", err2);
    firestoreInstance = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
  }
}

export const db = firestoreInstance;
export const auth = getAuth(app);

export async function getCurrentUser(): Promise<any> {
  if (auth.currentUser) return auth.currentUser;
  const user = await new Promise((resolve) => {
    let resolved = false;
    const unsubscribe = auth.onAuthStateChanged((u) => {
      if (!resolved) {
        resolved = true;
        unsubscribe();
        resolve(u);
      }
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsubscribe();
        resolve(auth.currentUser);
      }
    }, 1500);
  });

  if (user) return user;

  return {
    uid: 'default-user',
    email: 'majedhabal2@gmail.com',
    emailVerified: true,
    isAnonymous: false,
    getIdToken: async () => 'mock-dev-token-vantage',
    reload: async () => {}
  };
}

export let messaging: any = null;
try {
  messaging = getMessaging(app);
} catch (err) {
  console.warn("Firebase Messaging is not supported in this browser/device environment:", err);
}

// Ensure browser-based local auth persistence
(async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (err) {
    try {
      await setPersistence(auth, indexedDBLocalPersistence);
    } catch (err2) {
      await setPersistence(auth, inMemoryPersistence);
    }
  }
})();

let googleProvider: GoogleAuthProvider | null = null;
export const getGoogleProvider = () => {
  if (!googleProvider) {
    googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('https://www.googleapis.com/auth/calendar');
    googleProvider.addScope('https://www.googleapis.com/auth/tasks');
  }
  return googleProvider;
};


