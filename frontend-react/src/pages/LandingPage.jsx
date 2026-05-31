// LandingPage.jsx – Optimized for performance with memoization and lazy loading
import React, { useEffect, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Store, BarChart3, Users,
  ShieldCheck, Smartphone, Zap, CheckCircle2,
  Sun, Moon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function LandingPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();

  const features = useMemo(() => (
    [
      { icon: BarChart3, title: 'Real-time Analytics', desc: 'Watch your revenue grow in real-time with stunning, auto-updating charts and KPIs.', image: '/assets/analytics.png' },
      { icon: Users, title: 'Customer Debts', desc: 'Never lose track of unpaid balances. Manage customer credit limits and partial repayments.', image: '/assets/debts.png' },
      { icon: Zap, title: 'Fractional Sales', desc: 'Sell by the kilogram, liter, or pieces. Native UoM support for extreme accuracy.', image: '/assets/fractional.png' },
      { icon: ShieldCheck, title: 'Multi-Tenant Security', desc: 'True SaaS isolation ensures your data is hermetically sealed within your business scope.', image: '/assets/analytics.png' },
      { icon: Store, title: 'Multi-Store Ready', desc: 'Easily expand across locations while maintaining central visibility into stock levels.', image: '/assets/debts.png' },
      { icon: Smartphone, title: 'Mobile Optimized', desc: 'Manage your store from your iPad or mobile device with a highly responsive glass-morphism UI.', image: '/assets/fractional.png' },
    ]
  ), []);


  // Memoized feature card to avoid re-renders when props unchanged
  const FeatureCard = memo(({ feature, index }) => (
    <div className="feature-card glass reveal" style={{ transitionDelay: `${index * 100}ms`, padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '200px', overflow: 'hidden' }}>
        <img src={feature.image} alt={feature.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
      </div>
      <div style={{ padding: '24px' }}>
        <div className="feature-icon-wrapper" style={{ marginBottom: '16px' }}>
          <feature.icon size={24} />
        </div>
        <h3 className="feature-title">{feature.title}</h3>
        <p className="feature-desc">{feature.desc}</p>
      </div>
    </div>
  ));

  // Reveal animations on scroll
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('show');
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleCTA = () => {
    navigate('/login');
  };

  return (
    <div className="landing-root">
      {/* Atmosphere Background Blobs */}
      <div className="fancy-bg-blob blob-1"/><div className="fancy-bg-blob blob-2"/>

      <div className="landing-frame-container">
        {/* Navigation */}
        <nav className="landing-nav glass">
          <div className="landing-nav-inner">
            <div className="landing-brand">
              <div className="landing-logo"><Store size={24} color="white"/></div>
              <span className="brand-text">NexusPOS</span>
            </div>
            <div className="landing-nav-links">
              <button onClick={toggleTheme} style={{ background: 'transparent', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', cursor: 'pointer' }} title="Toggle Theme">
                {isDarkMode ? <Sun size={22}/> : <Moon size={22}/>}
              </button>
              <a href="#features">Features</a>
              <button className="btn-secondary" onClick={() => navigate('/login')}>Login</button>
              <button className="btn-primary" onClick={handleCTA}>Get Started <ArrowRight size={16}/></button>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-background-glow"/>
          <div className="hero-content reveal">
            <div className="hero-badge">Next-Generation POS Software</div>
            <h1 className="hero-title">Run Your Business <br/> <span className="text-gradient">Without the Chaos</span></h1>
            <p className="hero-subtitle">The all-in-one Multi-Tenant Point of Sale built for modern retailers. Handle fractional sales, track outstanding debts, and monitor real-time revenues in one stunning dashboard.</p>
            <div className="hero-cta-group">
              <button className="hero-btn-primary" onClick={handleCTA}>Start for Free <ArrowRight size={20}/></button>
              <button className="hero-btn-secondary" onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth'})}>View Features</button>
            </div>
            <div className="hero-stats">
              <div className="stat-item"><CheckCircle2 size={16} color="var(--accent)"/> No Credit Card Required</div>
              <div className="stat-item"><CheckCircle2 size={16} color="var(--accent)"/> Instant Setup</div>
              <div className="stat-item"><CheckCircle2 size={16} color="var(--accent)"/> Enterprise Analytics</div>
            </div>
          </div>
          {/* Professional 3D Hero Dashboard Image */}
          <div className="hero-visual reveal">
            <div className="hero-image-container glass" style={{ padding: '0', overflow: 'hidden', borderRadius: '24px' }}>
              <img src="/assets/hero.png" alt="Nexus POS Dashboard" loading="lazy" style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="features-section">
          <div className="features-header reveal">
            <h2>Enterprise‑grade tools, <br/>built for growth.</h2>
            <p>Everything you need to manage your inventory, sales, and customers natively.</p>
          </div>
          <div className="features-grid">
            {features.map((feature, i) => (
              <FeatureCard key={i} feature={feature} index={i} />
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="pricing-section reveal">
          <div className="pricing-card glass">
            <h2>Ready to transform your retail operations?</h2>
            <p>Join hundreds of businesses scaling with NexusPOS today.</p>
            <button className="hero-btn-primary mx-auto" onClick={handleCTA} style={{ marginTop: '32px' }}>Get Started Now <ArrowRight size={20}/></button>
          </div>
        </section>

        <footer className="landing-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', padding: '40px' }}>
          <p>© {new Date().getFullYear()} NexusPOS SaaS. All rights reserved.</p>
          <div style={{ display: 'flex', gap: '24px' }}>
            <button onClick={() => navigate('/admin/login')} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', border: 'none', opacity: 0.7, fontWeight: 500 }} className="hover:opacity-100 transition-opacity">Admin Portal</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
