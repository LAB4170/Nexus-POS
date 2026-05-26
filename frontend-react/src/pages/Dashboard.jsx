import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Package, DollarSign, AlertCircle,
  ArrowUpRight, ArrowDownRight, ShoppingCart, CreditCard
} from 'lucide-react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useBusiness } from '../context/BusinessContext';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';

const fmt = (val) => Number(val || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const StatCard = ({ title, value, icon: Icon, color, subtitle, badge }) => (
  <div className="card-elevated" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{title}</span>
      <h3 style={{ margin: '8px 0 4px', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>{value}</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {badge && (
          <span style={{ fontSize: '10px', fontWeight: 700, background: `${color}20`, color, borderRadius: '4px', padding: '2px 6px' }}>
            {badge}
          </span>
        )}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{subtitle}</span>
      </div>
    </div>
    <div style={{ 
      width: 44, height: 44, borderRadius: '12px', flexShrink: 0, marginLeft: 12,
      background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' 
    }}>
      <Icon size={22} />
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', boxShadow: 'var(--shadow-lg)' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
          {label ? new Date(label + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}
        </p>
        <p style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent)' }}>KSh {fmt(payload[0]?.value)}</p>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{payload[0]?.payload?.total_sales || 0} transactions</p>
      </div>
    );
  }
  return null;
};

const MultiLineTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const fmt = v => Number(v || 0).toLocaleString('en-KE');
  const colors = { 'Total': '#10B981', 'Cash': '#3B82F6', 'M-Pesa': '#8B5CF6', 'Debt': '#F59E0B' };
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', boxShadow: 'var(--shadow-lg)', minWidth: 180 }}>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>
        {label ? (() => { try { return new Date(label + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'long', month: 'short', day: 'numeric' }); } catch { return label; } })() : ''}
      </p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '4px' }}>
          <span style={{ fontSize: '12px', color: colors[p.name] || p.color, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[p.name] || p.color, display: 'inline-block' }} />
            {p.name}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 800 }}>KSh {fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const { currentUser } = useAuth();
  const { theme } = useTheme();
  const { business } = useBusiness();
  
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const socket = useSocket();
  const navigate = useNavigate();

  // Tracks whether we're currently back-off waiting after a 429
  const backoffRef = useRef(false);
  // Debounce timer for socket-triggered refreshes
  const debounceRef = useRef(null);

  const fetchDashboardData = async () => {
    if (backoffRef.current) return; // Don't pile up during back-off

    try {
      const [statsRes, chartsRes, activitiesRes, alertsRes] = await Promise.allSettled([
        api.get('/dashboard/stats'),
        api.get('/dashboard/charts'),
        api.get('/dashboard/recent-activities?limit=8'),
        api.get('/dashboard/alerts')
      ]);

      // Check for 429 on any response — if hit, back off for 30s
      const responses = [statsRes, chartsRes, activitiesRes, alertsRes];
      const hit429 = responses.some(r => r.status === 'rejected' && r.reason?.response?.status === 429);
      if (hit429) {
        console.warn('⏳ Rate limited (429). Backing off for 30s...');
        backoffRef.current = true;
        setTimeout(() => { backoffRef.current = false; }, 30000);
        return;
      }

      if (statsRes.status === 'fulfilled' && statsRes.value.data.success) {
        setStats(statsRes.value.data.data);
      } else if (statsRes.status === 'rejected') {
        console.error('Stats fetch failed:', statsRes.reason?.message);
      }

      if (chartsRes.status === 'fulfilled' && chartsRes.value.data.success) {
        setChartData(chartsRes.value.data.data.daily_sales || []);
        setCategoryData(chartsRes.value.data.data.expenses_by_category || []);
      } else if (chartsRes.status === 'rejected') {
        console.error('Charts fetch failed:', chartsRes.reason?.message);
      }

      if (activitiesRes.status === 'fulfilled' && activitiesRes.value.data.success) {
        setRecentActivities(activitiesRes.value.data.data || []);
      } else if (activitiesRes.status === 'rejected') {
        console.error('Activities fetch failed:', activitiesRes.reason?.message);
      }

      if (alertsRes.status === 'fulfilled' && alertsRes.value.data.success) {
        setAlerts(alertsRes.value.data.data || []);
      } else if (alertsRes.status === 'rejected') {
        console.error('Alerts fetch failed:', alertsRes.reason?.message);
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch dashboard data', error);
    } finally {
      setLoading(false);
    }
  };

  // Debounced fetch — socket events trigger this to collapse rapid updates
  const debouncedFetch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchDashboardData(), 500);
  };

  useEffect(() => {
    fetchDashboardData();

    // Auto-refresh every 60 seconds (not 30s to reduce request pressure)
    const refreshInterval = setInterval(fetchDashboardData, 60000);

    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleDataUpdate = (data) => {
      console.log('🔄 Real-time update:', data.type);
      debouncedFetch();
    };

    socket.on('data-update', handleDataUpdate);
    socket.on('data-refresh', debouncedFetch);

    return () => {
      socket.off('data-update', handleDataUpdate);
      socket.off('data-refresh', debouncedFetch);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [socket]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Syncing analytics...</span>
    </div>
  );

  const todayRevenue = stats?.sales?.today_revenue || 0;
  const todayCash = stats?.sales?.today_cash || 0;
  const todayMpesa = stats?.sales?.today_mpesa || 0;
  const todayDebt = stats?.sales?.today_debt || 0;
  const monthlyRevenue = stats?.sales?.monthly_revenue || 0;
  const monthlyDebt = stats?.debts?.monthly_debts || 0;

  // Chart Y-axis: smart formatter
  const yAxisFmt = (val) => {
    if (val >= 1000000) return `KSh ${(val/1000000).toFixed(1)}M`;
    if (val >= 1000) return `KSh ${(val/1000).toFixed(0)}k`;
    return `KSh ${val}`;
  };

  const formatActivityTime = (iso) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  const pmColor = (pm) => {
    if (pm === 'mpesa') return '#3B82F6';
    if (pm === 'debt') return '#F59E0B';
    return '#10B981'; // cash
  };

  const pmLabel = (pm) => {
    if (pm === 'mpesa') return 'M-PESA';
    if (pm === 'debt') return 'DEBT';
    if (pm === null) return 'EXPENSE';
    return 'CASH';
  };

  return (
    <div className="dashboard">
      {/* Page Header */}
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
        <div>
          <h2>Dashboard Overview</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Real-time analytics for {business?.name || 'your business'}.</p>
        </div>
        <div className="glass" style={{ padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
          Live • {lastUpdated.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      {/* ── TODAY'S STATS ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <StatCard title="Today's Revenue" value={`KSh ${fmt(todayRevenue)}`} icon={TrendingUp} color="#10B981" subtitle="Total gross today" badge="LIVE" />
        <StatCard title="Today's Cash" value={`KSh ${fmt(todayCash)}`} icon={DollarSign} color="#059669" subtitle="Cash collected" badge="LIVE" />
        <StatCard title="Today's M-Pesa" value={`KSh ${fmt(todayMpesa)}`} icon={CreditCard} color="#3B82F6" subtitle="Mobile payments" badge="LIVE" />
        <StatCard title="Today's Debt" value={`KSh ${fmt(todayDebt)}`} icon={AlertCircle} color="#F59E0B" subtitle="New credit sales" badge="LIVE" />
      </div>

      {/* ── MONTHLY STATS ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <StatCard title="Monthly Revenue" value={`KSh ${fmt(monthlyRevenue)}`} icon={Package} color="#8B5CF6" subtitle="Since 1st of month" badge="MTD" />
        <StatCard title="Monthly Debt" value={`KSh ${fmt(monthlyDebt)}`} icon={ArrowDownRight} color="#EF4444" subtitle="Total pending this month" badge="MTD" />
      </div>

      {/* ── CHARTS SECTION ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '24px', overflow: 'hidden' }}>
        
        {/* Revenue Performance */}
        <section className="card-elevated" style={{ padding: '28px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 800 }}>Revenue Performance</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 2 }}>Cash • M-Pesa • Debt — last 7 days</p>
            </div>
            <button
              onClick={() => navigate('/app/sales/history')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '12px', border: 'none', cursor: 'pointer' }}
            >
              View Records →
            </button>
          </div>

          {/* Legend pills */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            {[{ label: 'Total', color: '#10B981' }, { label: 'Cash', color: '#3B82F6' }, { label: 'M-Pesa', color: '#8B5CF6' }, { label: 'Debt', color: '#F59E0B' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>

          <div style={{ width: '100%', minWidth: 0, minHeight: 0 }}>
            {chartData.length === 0 || chartData.every(d => d.total_revenue === 0) ? (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                <TrendingUp size={32} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sales data for the last 7 days</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10B981" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.02}/>
                    </linearGradient>
                    <linearGradient id="gCash" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02}/>
                    </linearGradient>
                    <linearGradient id="gMpesa" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.02}/>
                    </linearGradient>
                    <linearGradient id="gDebt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#F59E0B" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={str => { try { return new Date(str + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric' }); } catch { return str; } }}
                  />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={yAxisFmt} width={72} />
                  <Tooltip content={<MultiLineTooltip />} />
                  {/* Total — thick green base */}
                  <Area type="monotone" dataKey="total_revenue" stroke="#10B981" strokeWidth={3}
                    fill="url(#gTotal)" dot={{ r: 4, fill: '#10B981', strokeWidth: 0 }}
                    activeDot={{ r: 6 }} name="Total" />
                  {/* Cash — blue line */}
                  <Line type="monotone" dataKey="cash" stroke="#3B82F6" strokeWidth={2}
                    dot={{ r: 3, fill: '#3B82F6', strokeWidth: 0 }} name="Cash" />
                  {/* M-Pesa — purple line */}
                  <Line type="monotone" dataKey="mpesa" stroke="#8B5CF6" strokeWidth={2}
                    dot={{ r: 3, fill: '#8B5CF6', strokeWidth: 0 }} name="M-Pesa" strokeDasharray="5 3" />
                  {/* Debt — amber dashed */}
                  <Line type="monotone" dataKey="debt" stroke="#F59E0B" strokeWidth={2}
                    dot={{ r: 3, fill: '#F59E0B', strokeWidth: 0 }} name="Debt" strokeDasharray="3 3" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Expense Distribution */}
        <section className="card-elevated" style={{ padding: '28px', minWidth: 0 }}>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 800 }}>Expense Distribution</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 2 }}>By category</p>
          </div>
          <div style={{ width: '100%', minWidth: 0, minHeight: 0 }}>
            {categoryData.length === 0 ? (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                <Package size={28} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No expense data yet</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="category" type="category" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} width={80} />
                  <Tooltip 
                    cursor={{ fill: 'var(--border)', opacity: 0.4 }}
                    formatter={(val) => [`KSh ${fmt(val)}`, 'Amount']}
                  />
                  <Bar dataKey="total_amount" radius={[0, 6, 6, 0]} fill="var(--accent-secondary)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {categoryData.slice(0, 4).map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-secondary)', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>{item.category}</span>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>KSh {fmt(item.total_amount)}</span>
              </div>
            ))}
            {categoryData.length === 0 && <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>No categories yet</p>}
          </div>
        </section>
      </div>

      {/* ── ACTIVITIES & ALERTS ── */}
      <div className="dashboard-grid">
        {/* Recent Activities */}
        <section className="dashboard-section glass">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontWeight: 800 }}>Recent Activities</h3>
            <button className="btn-text" style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 700 }}>View Records</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recentActivities.length === 0 ? (
              <p className="empty-placeholder">No recent activities found.</p>
            ) : recentActivities.slice(0, 6).map((act, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 }}>
                  <div style={{ 
                    width: 38, height: 38, flexShrink: 0, borderRadius: '10px', 
                    background: act.type === 'sale' ? `${pmColor(act.payment_method)}18` : 'var(--danger-bg, #FEF2F2)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    color: act.type === 'sale' ? pmColor(act.payment_method) : 'var(--danger)' 
                  }}>
                    {act.type === 'sale' ? <ShoppingCart size={16} /> : <ArrowDownRight size={16} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                      {act.description}
                    </h4>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatActivityTime(act.created_at)}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                  <p style={{ fontWeight: 800, fontSize: '14px', marginBottom: '2px' }}>KSh {fmt(act.amount)}</p>
                  <span style={{ 
                    fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', 
                    background: act.type === 'sale' ? `${pmColor(act.payment_method)}18` : 'var(--danger-bg, #FEF2F2)',
                    color: act.type === 'sale' ? pmColor(act.payment_method) : 'var(--danger)',
                    borderRadius: '4px', padding: '2px 6px'
                  }}>
                    {act.type === 'sale' ? pmLabel(act.payment_method) : 'EXPENSE'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* System Alerts */}
        <section className="dashboard-section glass">
          <h3 style={{ fontWeight: 800, marginBottom: '20px' }}>System Alerts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#10B98118', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <ArrowUpRight size={18} style={{ color: '#10B981' }} />
                </div>
                <p style={{ fontWeight: 700, fontSize: '14px', color: '#10B981' }}>All systems healthy</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>No alerts at this time</p>
              </div>
            ) : alerts.map((alert, i) => (
              <div key={i} className="glass" style={{ padding: '12px 16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <AlertCircle size={18} style={{ color: alert.type === 'error' ? 'var(--danger)' : 'var(--accent-secondary)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 700 }}>{alert.title}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{alert.message}</p>
                  </div>
                </div>
                <button style={{ padding: '5px 10px', background: 'var(--surface-hover)', borderRadius: '6px', fontSize: '11px', fontWeight: 800, flexShrink: 0, marginLeft: 8 }}>Manage</button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
