import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  authReady: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authReady: false,
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthReady(true);
      },
      (error) => {
        console.warn('[Vantage Auth] Auth state listener error:', error);
        setUser(null);
        setAuthReady(true);
      }
    );

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      await fbSignOut(auth);
      localStorage.removeItem('vantage_user_profile');
      sessionStorage.clear();
      setUser(null);
    } catch (err) {
      console.error('[Vantage Auth] Sign-out error:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, authReady, signOut }}>
      {authReady ? (
        children
      ) : (
        <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1117' }}>
          <img
            src="/icons/Your_Finances_Logo_Loading.png"
            alt="Loading..."
            style={{ width: 80, height: 80, animation: 'pulse 1.5s infinite' }}
          />
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);