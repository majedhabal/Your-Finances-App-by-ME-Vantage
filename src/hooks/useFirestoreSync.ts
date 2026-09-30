import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export const useUserCollection = <T>(subcollectionName: string) => {
  const { user, authReady } = useAuth();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // CRITICAL: Block execution if auth has not completed or user is logged out
    if (!authReady || !user) {
      setData([]);
      setLoading(!authReady);
      return;
    }

    const colRef = collection(db, 'users', user.uid, subcollectionName);
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
        setError(null);
      },
      (err) => {
        console.warn(`[Firestore Safe Fallback]: ${subcollectionName} stream paused`, err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, authReady, subcollectionName]);

  return { data, loading, error };
};
