import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDY-zEP_8HDEwz9QcIo2y7Ck1fDpSBJ54I",
  authDomain: "eobordtech-pos.firebaseapp.com",
  projectId: "eobordtech-pos",
  storageBucket: "eobordtech-pos.firebasestorage.app",
  messagingSenderId: "821131892978",
  appId: "1:821131892978:web:3bdb96f2749f1d160c986b",
  measurementId: "G-9M62DRFQ5M"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Inactivity Config ────────────────────────────────────────────────────────
const INACTIVITY_MS   = 15 * 60 * 1000; // 15 minutes
const WARNING_MS      = 60 * 1000;       // warn 60s before logout
const THROTTLE_MS     = 1000;            // activity throttle

// ─── Warning Toast ────────────────────────────────────────────────────────────
function InactivityWarning({ secondsLeft, onStay }) {
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 99999,
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      border: '1px solid rgba(239,68,68,0.5)', borderRadius: '16px',
      padding: '20px 24px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(239,68,68,0.2)',
      color: '#f1f5f9', maxWidth: '340px', width: '100%',
      animation: 'inactSlide 0.3s ease',
    }}>
      <style>{`
        @keyframes inactSlide {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', flexShrink: 0,
        }}>⏱️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>Session Expiring Soon</div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Due to inactivity</div>
        </div>
      </div>
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '8px' }}>
          You will be logged out in{' '}
          <span style={{ color: '#f87171', fontWeight: 700, fontSize: '15px' }}>{secondsLeft}s</span>
        </div>
        <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
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
      <button
        onClick={onStay}
        style={{
          width: '100%', padding: '10px',
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          color: 'white', border: 'none', borderRadius: '10px',
          fontWeight: 700, fontSize: '13px', cursor: 'pointer',
        }}
      >
        ✓ Stay Logged In
      </button>
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(undefined); // undefined = still loading
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  const warningTimerRef = useRef(null);
  const logoutTimerRef  = useRef(null);
  const countdownRef    = useRef(null);
  const warningActiveRef = useRef(false); // readable from event handlers without stale closure

  // Sync ref with state
  useEffect(() => { warningActiveRef.current = showWarning; }, [showWarning]);

  // Firebase auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user ?? null);
    });
    return unsub;
  }, []);

  // ── Stable memoized auth actions ──────────────────────────────────────────
  const loginWithEmail  = useCallback((e, p) => signInWithEmailAndPassword(auth, e, p), []);
  const signupWithEmail = useCallback((e, p) => createUserWithEmailAndPassword(auth, e, p), []);
  const loginWithGoogle = useCallback(() => signInWithPopup(auth, googleProvider), []);
  const logout          = useCallback(() => signOut(auth), []);

  // ── Inactivity timer ──────────────────────────────────────────────────────
  const clearTimers = useCallback(() => {
    clearTimeout(warningTimerRef.current);
    clearTimeout(logoutTimerRef.current);
    clearInterval(countdownRef.current);
  }, []);

  const doLogout = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    console.warn('🔒 Logged out due to 15 min inactivity.');
    signOut(auth);
  }, [clearTimers]);

  const resetTimer = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    setSecondsLeft(60);

    // At 14:00 → show warning
    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setSecondsLeft(60);

      countdownRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) { clearInterval(countdownRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);

      // At 15:00 → logout
      logoutTimerRef.current = setTimeout(doLogout, WARNING_MS);
    }, INACTIVITY_MS - WARNING_MS);
  }, [clearTimers, doLogout]);

  // Activity listeners — only active while logged in
  useEffect(() => {
    if (!currentUser) {
      clearTimers();
      setShowWarning(false);
      return;
    }

    resetTimer();

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    let throttle = null;

    const onActivity = () => {
      if (throttle || warningActiveRef.current) return; // stop resetting once warning shows
      throttle = setTimeout(() => {
        resetTimer();
        throttle = null;
      }, THROTTLE_MS);
    };

    events.forEach(e => window.addEventListener(e, onActivity));
    return () => {
      clearTimers();
      if (throttle) clearTimeout(throttle);
      events.forEach(e => window.removeEventListener(e, onActivity));
    };
  }, [currentUser, resetTimer, clearTimers]);

  // Still initializing Firebase auth (prevent flash of login page)
  if (currentUser === undefined) return null;

  return (
    <AuthContext.Provider value={{ currentUser, loginWithEmail, signupWithEmail, loginWithGoogle, logout, auth }}>
      {children}
      {currentUser && showWarning && (
        <InactivityWarning secondsLeft={secondsLeft} onStay={resetTimer} />
      )}
    </AuthContext.Provider>
  );
}
