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

// ─── Inactivity Config ────────────────────────────────────────────────────────
const INACTIVITY_LIMIT_MS  = 15 * 60 * 1000; // 15 minutes total
const WARNING_BEFORE_MS    = 60 * 1000;       // show warning 1 min before logout
const ACTIVITY_THROTTLE_MS = 1000;            // throttle activity resets to 1/sec

// ─── Warning Toast Component ──────────────────────────────────────────────────
function InactivityWarning({ secondsLeft, onStayLoggedIn }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 99999,
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      border: '1px solid rgba(239,68,68,0.5)',
      borderRadius: '16px',
      padding: '20px 24px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(239,68,68,0.2)',
      color: '#f1f5f9',
      maxWidth: '340px',
      width: '100%',
      animation: 'slideInRight 0.3s ease',
    }}>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', flexShrink: 0,
        }}>⏱️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#f1f5f9' }}>
            Session Expiring Soon
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
            Due to inactivity
          </div>
        </div>
      </div>

      {/* Countdown */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '8px' }}>
          You will be logged out in{' '}
          <span style={{ color: '#f87171', fontWeight: 700, fontSize: '15px' }}>
            {secondsLeft}s
          </span>
        </div>
        {/* Progress bar */}
        <div style={{
          height: '4px', borderRadius: '2px',
          background: 'rgba(255,255,255,0.1)', overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            width: `${(secondsLeft / 60) * 100}%`,
            background: secondsLeft > 30
              ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
              : 'linear-gradient(90deg, #ef4444, #f87171)',
            borderRadius: '2px',
            transition: 'width 1s linear, background 0.5s ease',
          }} />
        </div>
      </div>

      {/* Button */}
      <button
        onClick={onStayLoggedIn}
        style={{
          width: '100%', padding: '10px',
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          color: 'white', border: 'none', borderRadius: '10px',
          fontWeight: 700, fontSize: '13px', cursor: 'pointer',
          transition: 'opacity 0.2s',
        }}
        onMouseOver={e => e.target.style.opacity = '0.85'}
        onMouseOut={e => e.target.style.opacity = '1'}
      >
        ✓ Stay Logged In
      </button>
    </div>
  );
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser]       = useState(null);
  const [loading, setLoading]               = useState(true);
  const [showWarning, setShowWarning]       = useState(false);
  const [secondsLeft, setSecondsLeft]       = useState(60);

  const logoutTimerRef   = useRef(null);
  const warningTimerRef  = useRef(null);
  const countdownRef     = useRef(null);
  const showWarningRef   = useRef(false); // ref mirror so event handlers can read it

  // Keep ref in sync with state
  useEffect(() => { showWarningRef.current = showWarning; }, [showWarning]);

  // Automatically sync Firebase user state to React State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const doLogout = useCallback(() => {
    console.warn('🔒 Session expired due to inactivity. Logging out...');
    setShowWarning(false);
    clearInterval(countdownRef.current);
    signOut(auth);
  }, []);

  const clearAllTimers = useCallback(() => {
    clearTimeout(logoutTimerRef.current);
    clearTimeout(warningTimerRef.current);
    clearInterval(countdownRef.current);
  }, []);

  const resetTimer = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    setSecondsLeft(60);

    // Warn 1 minute before logout (at 14-minute mark)
    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setSecondsLeft(60);

      // Countdown tick every second
      countdownRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Final logout after 1 more minute
      logoutTimerRef.current = setTimeout(doLogout, WARNING_BEFORE_MS);
    }, INACTIVITY_LIMIT_MS - WARNING_BEFORE_MS);
  }, [clearAllTimers, doLogout]);

  const handleStayLoggedIn = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  // Inactivity tracking — only resets timer when warning is NOT showing
  useEffect(() => {
    if (!currentUser) {
      clearAllTimers();
      setShowWarning(false);
      return;
    }

    resetTimer();

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    let throttleTimer = null;

    const handleActivity = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        // Once the warning is visible, only the button resets — not mouse movement
        if (!showWarningRef.current) resetTimer();
        throttleTimer = null;
      }, ACTIVITY_THROTTLE_MS);
    };

    events.forEach(event => window.addEventListener(event, handleActivity));

    return () => {
      clearAllTimers();
      if (throttleTimer) clearTimeout(throttleTimer);
      events.forEach(event => window.removeEventListener(event, handleActivity));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

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
      {currentUser && showWarning && (
        <InactivityWarning
          secondsLeft={secondsLeft}
          onStayLoggedIn={handleStayLoggedIn}
        />
      )}
    </AuthContext.Provider>
  );
}
