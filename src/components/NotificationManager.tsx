import { useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, query, where, updateDoc, doc } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';
import { messaging } from '../lib/firebase';

export const NotificationManager = ({ uid }: { uid: string }) => {
  useEffect(() => {
    // 🛡️ CRITICAL GUARD: Abort if Firebase Auth is not active
    if (!uid || !auth.currentUser) return;
    const userId = auth.currentUser.uid;

    const requestPermission = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          console.log('Notification permission granted.');
          try {
            let swRegistration: ServiceWorkerRegistration | undefined;
            if ('serviceWorker' in navigator) {
              swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            }
            const token = await getToken(messaging, swRegistration ? { serviceWorkerRegistration: swRegistration } : undefined);
            if (token) {
              await updateDoc(doc(db, `users/${userId}`), {
                fcmToken: token
              });
              console.log('FCM token stored.');
            }
          } catch (tokenErr) {
            console.error('Error getting FCM token:', tokenErr);
          }
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
      }
    };

    requestPermission();

    const notificationsRef = collection(db, `users/${uid}/notifications`);
    const q = query(notificationsRef, where('isRead', '==', false));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          // Just mark as read in database for badge count synchronization, leaving push/service worker to handle notification display cleanly
          updateDoc(doc(db, `users/${uid}/notifications`, change.doc.id), { isRead: true });
        }
      });
    });

    return () => unsubscribe();
  }, [uid]);

  return <div className="absolute z-[9999]" />;
};

