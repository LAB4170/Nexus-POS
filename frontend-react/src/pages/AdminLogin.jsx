import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { setPersistence, browserLocalPersistence } from 'firebase/auth';
import { ShieldAlert, ArrowLeft, Sun, Moon, Eye, EyeOff, Lock } from 'lucide-react';

export default function AdminLogin() {
  const { currentUser, loginWithEmail, logout, auth } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  
  // Strict Admin Check
  useEffect(() => {
    const checkAdmin = async () => {
      if (currentUser) {
        try {
          const idTokenResult = await currentUser.getIdTokenResult(true);
          if (idTokenResult.claims.role === 'admin') {
            navigate('/admin');
          } else {
            // Not an admin! Kick them out.
            await logout();
            setError('Access Denied: This account does not have administrator privileges.');
          }
        } catch (err) {
          console.error('Admin verification failed:', err);
          setError('Security verification failed. Please try again.');
        }
      }
    };
    checkAdmin();
  }, [currentUser, navigate, logout]);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);

      // Use local persistence — session survives page refresh.
      // The 15-minute inactivity timer in AuthContext handles actual logout.
      if (auth) {
        await setPersistence(auth, browserLocalPersistence);
      }

      await loginWithEmail(email, password);
      // useEffect handles the role check and navigation
    } catch (err) {
      console.error('Admin Login Error:', err);
      setError('Invalid credentials or connection error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page admin-login-bg" style={{ 
      position: 'relative', 
      background: isDarkMode ? '#020617' : '#f8fafc',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        position: 'absolute', top: 16, left: 16, right: 16,
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', zIndex: 10
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'transparent', color: 'var(--text-muted)',
            fontWeight: 600, fontSize: '14px', padding: '8px 4px',
            border: 'none', cursor: 'pointer'
          }}
        >
          <ArrowLeft size={18} /> Public Site
        </button>
        <button
          onClick={toggleTheme}
          style={{ background: 'transparent', color: 'var(--text-muted)', padding: '8px', border: 'none', cursor: 'pointer' }}
        >
          {isDarkMode ? <Sun size={22} /> : <Moon size={22} />}
        </button>
      </div>

      <div className="login-card glass" style={{ 
        maxWidth: '400px', 
        width: '90%',
        padding: '2.5rem',
        borderRadius: '1.5rem',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div className="login-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ 
            width: '64px', height: '64px', borderRadius: '1rem',
            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem', color: 'white',
            boxShadow: '0 10px 15px -3px rgba(239, 68, 68, 0.3)'
          }}>
            <Lock size={32} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>Admin Command</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Secure Authorization Required</p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            color: '#ef4444',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
            fontSize: '0.85rem',
            display: 'flex',
            gap: '8px',
            alignItems: 'center'
          }}>
            <ShieldAlert size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleAdminLogin}>
          <div className="input-group" style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Admin Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="admin@nexus.com"
              style={{
                width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          <div className="input-group" style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Secure Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                  border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: '12px', top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)'
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
              background: '#ef4444', color: 'white', fontWeight: 700,
              border: 'none', cursor: 'pointer',
              transition: 'all 0.2s',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Authenticating...' : 'Authorize Entry'}
          </button>
        </form>
      </div>
    </div>
  );
}
