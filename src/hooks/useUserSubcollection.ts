import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, DocumentData } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export function useUserSubcollection<T = DocumentData>(subcollectionName: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentUser = auth.currentUser;

    // HARD GUARD: Do not query if auth is not fully established
    if (!currentUser) {
      setData([]);
      setLoading(false);
      return;
    }

    const colRef = collection(db, 'users', currentUser.uid, subcollectionName);
    const q = query(colRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        })) as T[];
        setData(items);
        setLoading(false);
      },
      (error) => {
        // Suppress console flood if disconnected or logging out
        console.warn(`[Firestore Stream] ${subcollectionName} paused:`, error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [auth.currentUser?.uid, subcollectionName]);

  return { data, loading };
}
