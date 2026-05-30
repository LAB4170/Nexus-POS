import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDY-zEP_8HDEwz9QcIo2y7Ck1fDpSBJ54I",
  authDomain: "eobordtech-pos.firebaseapp.com",
  projectId: "eobordtech-pos",
  storageBucket: "eobordtech-pos.firebasestorage.app",
  messagingSenderId: "821131892978",
  appId: "1:821131892978:web:3bdb96f2749f1d160c986b",
  measurementId: "G-9M62DRFQ5M"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const logoutTimerRef = useRef(null);

  // Automatically sync Firebase user state to React State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Secure Auto-Logout mechanism (15 mins inactivity)
  const handleLogout = useCallback(() => {
    console.warn('Session expired due to inactivity. Logging out...');
    signOut(auth);
  }, []);

  const resetTimer = useCallback(() => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    // 15 minutes = 15 * 60 * 1000 = 900000 ms
    logoutTimerRef.current = setTimeout(handleLogout, 900000);
  }, [handleLogout]);

  useEffect(() => {
    // Only track inactivity if the user is actually logged in
    if (!currentUser) {
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      return;
    }

    // Start timer on login/mount
    resetTimer();

    // Listeners for user activity
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    
    // Throttle the resets slightly so we don't call clearTimeout 1000 times a second on mousemove
    let throttleTimer;
    const handleActivity = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        resetTimer();
        throttleTimer = null;
      }, 1000); // Only reset the 15min timer max once per second
    };

    events.forEach(event => window.addEventListener(event, handleActivity));

    // Cleanup on unmount or when user logs out
    return () => {
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (throttleTimer) clearTimeout(throttleTimer);
      events.forEach(event => window.removeEventListener(event, handleActivity));
    };
  }, [currentUser, resetTimer]);

  const value = {
    currentUser,
    loginWithEmail: (email, password) => signInWithEmailAndPassword(auth, email, password),
    signupWithEmail: (email, password) => createUserWithEmailAndPassword(auth, email, password),
    loginWithGoogle: () => signInWithPopup(auth, googleProvider),
    logout: () => signOut(auth),
    auth
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
