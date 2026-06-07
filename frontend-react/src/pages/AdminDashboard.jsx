import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Users, 
  ShoppingBag, 
  TrendingUp, 
  ChevronRight, 
  Lock, 
  Store,
  RefreshCw,
  Search,
  DollarSign,
  ArrowLeft,
  Calendar,
  Activity,
  Sun,
  Moon,
  PieChart as PieChartIcon,
  Globe,
  Clock,
  ArrowUpRight,
  LayoutDashboard,
  Zap,
  ShieldCheck,
  AlertCircle,
  MessageSquare,
  Headphones
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import AdminNotifications from '../components/AdminNotifications';
import { io } from 'socket.io-client';

// Ensure API_BASE is absolute to prevent path drift in sub-routes
const API_BASE = (import.meta.env.VITE_API_URL || '/api').startsWith('http') 
  ? (import.meta.env.VITE_API_URL || '/api') 
  : `/${(import.meta.env.VITE_API_URL || 'api').replace(/^\//, '')}`;

const SOCKET_URL = API_BASE.replace('/api', '');

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function AdminDashboard() {
  const { theme, toggleTheme } = useTheme();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [activities, setActivities] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [replyContent, setReplyContent] = useState('');
  const [systemHealth, setSystemHealth] = useState(null);

  // Always get a fresh token — Firebase caches internally and only refreshes when needed
  const getAuthConfig = async () => {
    const freshToken = await currentUser.getIdToken();
    return { headers: { 'Authorization': `Bearer ${freshToken}` } };
  };

  const fetchAdminData = async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      setError('');
      const config = await getAuthConfig();
      const [overviewRes, businessesRes, activitiesRes, usersRes] = await Promise.all([
        axios.get(`${API_BASE}/admin/overview`, config),
        axios.get(`${API_BASE}/admin/businesses`, config),
        axios.get(`${API_BASE}/admin/activities`, config),
        axios.get(`${API_BASE}/admin/users`, config),
      ]);
      setOverview(overviewRes.data.data);
      setBusinesses(businessesRes.data.data);
      setActivities(activitiesRes.data.data);
      setUsers(usersRes.data.data);
      
      // Non-blocking fetches
      axios.get(`${API_BASE}/admin/support/tickets`, config)
        .then(r => setTickets(r.data.data))
        .catch(e => console.warn('Support tickets fetch failed:', e.message));
      axios.get(`${API_BASE}/health`)
        .then(r => setSystemHealth(r.data))
        .catch(() => setSystemHealth({ status: 'UNKNOWN', database: 'Unknown' }));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load. Check your admin privileges.');
    } finally {
      setLoading(false);
    }
  };

  const fetchBusinessDetail = async (id) => {
    try {
      setDetailLoading(true);
      const config = await getAuthConfig();
      const res = await axios.get(`${API_BASE}/admin/businesses/${id}`, config);
      setSelectedBusiness(res.data.data);
      setAdminNotes(res.data.data.business.admin_notes || '');
      setShowDetail(true);
    } catch (err) {
      console.error("Detail fetch failed", err);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchAdminData();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    let socket;
    const connectSocket = async () => {
      const token = await currentUser.getIdToken();
      socket = io(`${SOCKET_URL}/admin`, {
        auth: { token },
        transports: ['websocket', 'polling']
      });

      socket.on('data-refresh', () => {
        refreshTickets();
        fetchAdminData(); // refreshing the whole admin data silently
      });
    };
    connectSocket();
    return () => {
      if (socket) socket.disconnect();
    };
  }, [currentUser]);

  const handleLoginRedirect = () => {
    navigate('/admin/login');
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (err) {
      console.error(err);
    }
  };

  const filteredBusinesses = businesses.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.owner_email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSuspendToggle = async (bId, currentStatus) => {
    try {
      const config = await getAuthConfig();
      await axios.post(`${API_BASE}/admin/businesses/${bId}/status`, {
        is_suspended: !currentStatus,
        admin_notes: adminNotes
      }, config);
      alert(`Business ${!currentStatus ? 'suspended' : 'activated'} successfully.`);
      fetchAdminData();
      fetchBusinessDetail(bId);
    } catch (err) {
      alert('Failed to update status.');
    }
  };

  const handleExtendTrial = async (bId) => {
    try {
      const config = await getAuthConfig();
      await axios.post(`${API_BASE}/admin/businesses/${bId}/extend-trial`, { days: 7 }, config);
      alert('Trial extended by 7 days.');
      fetchAdminData();
      fetchBusinessDetail(bId);
    } catch (err) {
      alert('Failed to extend trial.');
    }
  };

  const fetchTicketDetail = async (id) => {
    try {
      const config = await getAuthConfig();
      const res = await axios.get(`${API_BASE}/admin/support/tickets/${id}`, config);
      setSelectedTicket(res.data.data.ticket);
      setTicketMessages(res.data.data.messages);
    } catch (err) {
      console.error(err);
    }
  };

  const refreshTickets = async () => {
    try {
      const config = await getAuthConfig();
      const res = await axios.get(`${API_BASE}/admin/support/tickets`, config);
      setTickets(res.data.data);
    } catch (err) {
      console.warn('Ticket refresh failed:', err.message);
    }
  };

  const handleAdminReply = async (e) => {
    e.preventDefault();
    if (!replyContent.trim() || !selectedTicket) return;

    try {
      const config = await getAuthConfig();
      await axios.post(`${API_BASE}/admin/support/tickets/${selectedTicket.id}/reply`, { content: replyContent }, config);
      setReplyContent('');
      fetchTicketDetail(selectedTicket.id);
      refreshTickets(); // Refresh ticket list only
    } catch (err) {
      alert('Failed to send reply');
    }
  };

  const handleUpdateTicketStatus = async (id, status) => {
    try {
      const config = await getAuthConfig();
      await axios.patch(`${API_BASE}/admin/support/tickets/${id}/status`, { status }, config);
      refreshTickets();
      if (selectedTicket?.id === id) fetchTicketDetail(id);
    } catch (err) {
      alert('Failed to update status');
    }
  };

  const handleImpersonate = async (bId) => {
    if (!window.confirm('Impersonate this merchant? This action is fully audited.')) return;
    try {
      const config = await getAuthConfig();
      const res = await axios.post(`${API_BASE}/admin/businesses/${bId}/impersonate`, {}, config);
      const impersonationToken = res.data.customToken;
      // Pass via URL hash (not sent to server). The /impersonate page reads it and signs in.
      window.open(`/impersonate#${encodeURIComponent(impersonationToken)}`, '_blank');
    } catch (err) {
      alert('Impersonation failed: ' + (err.response?.data?.message || err.message));
    }
  };

  if (loading && !overview) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw size={32} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Initializing Command Center...</p>
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', padding: '40px', maxWidth: '400px' }}>
          <p style={{ color: '#ef4444', fontWeight: 700, marginBottom: '16px' }}>{error}</p>
          <button onClick={fetchAdminData} className="btn-primary">Retry</button>
          <button onClick={handleLogout} style={{ display: 'block', margin: '12px auto 0', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="layout-root" style={{ 
      background: 'var(--bg)', color: 'var(--text)', 
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', sans-serif"
    }}>
      <AdminNotifications />
      {/* Responsive Header */}
      <header className="glass" style={{
        padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100, background: 'var(--surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ 
            width: '42px', height: '42px', borderRadius: '12px', 
            background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px var(--accent-glow)'
          }}>
            <ShieldCheck size={24} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 900, margin: 0, letterSpacing: '-0.03em', color: 'var(--text)' }}>NEXUS MASTER TERMINAL</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="dot-pulse"></span>
              <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 900, letterSpacing: '0.1em' }}>GOD MODE ACTIVE</span>
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="hide-mobile" style={{ textAlign: 'right', marginRight: '12px' }}>
             <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)' }}>RETENTION</div>
             <div style={{ fontSize: '14px', fontWeight: 800 }}>{overview?.retentionRate}%</div>
          </div>
          <button onClick={toggleTheme} className="btn-icon-premium">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button onClick={() => fetchAdminData()} className="btn-icon-premium"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={handleLogout} style={{ 
            fontSize: '11px', fontWeight: 800, padding: '8px 16px', borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>LOGOUT</button>
        </div>
      </header>

      {/* Navigation */}
      <nav style={{ 
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', padding: '0 24px', position: 'sticky', top: '61px', zIndex: 99
      }}>
        {[
          { id: 'overview', icon: <LayoutDashboard size={18} />, label: 'SYSTEM OVERVIEW' },
          { id: 'businesses', icon: <Store size={18} />, label: 'MERCHANT FLEET' },
          { id: 'users', icon: <Users size={18} />, label: 'USER DIRECTORY' },
          { id: 'support', icon: <Headphones size={18} />, label: 'SUPPORT DESK' },
          { id: 'activities', icon: <Activity size={18} />, label: 'GLOBAL TELEMETRY' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '18px 24px', display: 'flex', alignItems: 'center', gap: '10px',
              fontSize: '12px', fontWeight: 700, background: 'transparent',
              borderBottom: activeTab === tab.id ? '3px solid var(--accent)' : '3px solid transparent',
              color: activeTab === tab.id ? 'var(--text)' : 'var(--text-muted)',
              borderRadius: 0, transition: 'all 0.3s ease'
            }}
          >
            {tab.icon}
            <span className="hide-mobile">{tab.label}</span>
          </button>
        ))}
      </nav>

      <main style={{ padding: '32px 24px', flex: 1, maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        
        {activeTab === 'overview' && (
          <div className="fade-in">
             {/* Stats Grid */}
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                {[
                  { label: 'HUMAN FOOTPRINT', val: overview?.userStats?.totalUsers, sub: `${overview?.userStats?.newUsersToday} New Today`, icon: <Users />, highlight: 'var(--accent)' },
                  { label: 'ACTIVE MERCHANTS', val: overview?.totalBusinesses, sub: `${overview?.growth?.activeTenants} Active (30D)`, icon: <Store />, highlight: '#3b82f6' },
                  { label: 'NETWORK VOLUME', val: `KSh ${overview?.totalRevenue?.toLocaleString()}`, sub: `${overview?.growth?.revenue}% MoM`, icon: <TrendingUp />, pos: overview?.growth?.revenue >= 0, highlight: '#8b5cf6' },
                  { label: 'TRANSACTION VELOCITY', val: overview?.totalSalesCount?.toLocaleString(), sub: 'Global Transactions', icon: <Zap />, highlight: '#f59e0b' }
                ].map((stat, idx) => (
                  <div key={idx} className="card-premium" style={{ 
                    padding: '24px', 
                    borderLeft: `4px solid ${stat.highlight}`,
                    background: `linear-gradient(135deg, var(--surface) 0%, ${stat.highlight}05 100%)` 
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                       <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{stat.label}</span>
                       <div style={{ color: 'var(--accent)' }}>{stat.icon}</div>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 800, marginBottom: '8px' }}>{stat.val}</div>
                    <div style={{ 
                      fontSize: '11px', fontWeight: 700, 
                      color: stat.pos === undefined ? 'var(--text-muted)' : (stat.pos ? '#10b981' : '#ef4444'),
                      display: 'flex', alignItems: 'center', gap: '4px'
                    }}>
                      {stat.pos !== undefined && <ArrowUpRight size={12} style={{ transform: stat.pos ? 'none' : 'rotate(90deg)' }} />}
                      {stat.sub}
                    </div>
                  </div>
                ))}
             </div>

             <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }} className="grid-mobile-1">
                {/* Main Growth Chart */}
                <div className="card-premium" style={{ padding: '24px' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Network Growth Dynamics</h3>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>LAST 7 DAYS</div>
                   </div>
                   <div style={{ height: '350px', width: '100%', minWidth: 0, position: 'relative' }}>
                      {overview?.salesTrend?.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={overview?.salesTrend}>
                            <defs>
                              <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'var(--text-muted)'}} tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, { weekday: 'short' })} />
                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'var(--text-muted)'}} tickFormatter={(val) => `KSh ${val/1000}k`} />
                            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                            <Area type="monotone" dataKey="amount" stroke="var(--accent)" fillOpacity={1} fill="url(#colorRev)" strokeWidth={3} />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Waiting for telemetry...</div>
                      )}
                   </div>
                </div>

                {/* Market Share */}
                <div className="card-premium" style={{ padding: '24px' }}>
                   <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '24px' }}>Payment Modality</h3>
                   <div style={{ height: '300px', width: '100%', minWidth: 0, position: 'relative' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={overview?.paymentBreakdown || []} innerRadius={70} outerRadius={90} paddingAngle={8} dataKey="value" nameKey="name">
                            {(overview?.paymentBreakdown || []).map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} stroke="transparent" />)}
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                      </ResponsiveContainer>
                   </div>
                </div>
             </div>

             {/* NEW: Network Health Deep Dive */}
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginTop: '24px' }}>
                <div className="card-premium" style={{ padding: '24px' }}>
                   <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
                      <AlertCircle size={20} color="#ef4444" />
                      <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Critical Merchant Risk</h3>
                   </div>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {businesses.filter(b => b.healthStatus !== 'HEALTHY').slice(0, 4).map(b => (
                        <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '10px' }}>
                           <div>
                              <div style={{ fontSize: '13px', fontWeight: 700 }}>{b.name}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{b.daysSinceActivity} days inactive</div>
                           </div>
                           <span className={`badge-status status-${b.healthStatus.toLowerCase()}`}>{b.healthStatus}</span>
                        </div>
                      ))}
                      {businesses.filter(b => b.healthStatus !== 'HEALTHY').length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>Network health is optimal.</div>
                      )}
                   </div>
                </div>

                <div className="card-premium" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
                   <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
                      <MessageSquare size={20} color="var(--accent)" />
                      <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Command Broadcast</h3>
                   </div>
                   <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Push a system-wide notification to all merchant dashboards instantly.</p>
                   <div style={{ display: 'flex', gap: '10px' }}>
                      <input 
                        placeholder="Platform maintenance at 22:00..." 
                        style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px' }}
                      />
                      <button className="btn-primary" style={{ padding: '0 16px', borderRadius: '8px' }}>PUSH</button>
                   </div>
                   <div style={{ position: 'absolute', bottom: '-20px', right: '-20px', opacity: 0.05 }}>
                      <Globe size={120} />
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* Tab 2: MERCHANT FLEET */}
        {activeTab === 'businesses' && (
          <div className="fade-in">
              <div className="card-premium" style={{ padding: '0', overflow: 'hidden' }}>
               <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="grid-mobile-1">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Fleet Management</h3>
                    <a href={`${API_BASE}/admin/export/businesses`} target="_blank" rel="noreferrer" className="btn-secondary" style={{ fontSize: '11px', padding: '6px 12px', borderRadius: '6px', textDecoration: 'none' }}>
                      Export CSV
                    </a>
                  </div>
                  <div className="search-box-premium">
                    <Search size={16} color="var(--text-muted)" />
                    <input placeholder="Search identifier or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
               </div>
               
               <div style={{ overflowX: 'auto' }}>
                 <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                   <thead>
                     <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                       <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>MERCHANT</th>
                       <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>HEALTH</th>
                       <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>ACTIVITY</th>
                       <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textAlign: 'right' }}>VOLUME (KSh)</th>
                       <th style={{ padding: '16px 24px' }}></th>
                     </tr>
                   </thead>
                   <tbody>
                     {filteredBusinesses.map(b => (
                       <tr key={b.id} className="fleet-row" onClick={() => fetchBusinessDetail(b.id)}>
                         <td style={{ padding: '16px 24px' }}>
                           <div style={{ fontWeight: 700, fontSize: '14px' }}>{b.name}</div>
                           <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{b.owner_email}</div>
                         </td>
                         <td style={{ padding: '16px 24px' }}>
                           <span className={`badge-status status-${b.healthStatus.toLowerCase()}`}>
                             {b.healthStatus}
                           </span>
                           {b.is_suspended && (
                             <span className="badge-status" style={{ background: '#7f1d1d', color: '#fca5a5', marginLeft: '6px' }}>
                               SUSPENDED
                             </span>
                           )}
                         </td>
                         <td style={{ padding: '16px 24px' }}>
                            <div style={{ fontSize: '13px' }}>{b.sales_count} Sales</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {b.daysSinceActivity === 0 ? 'Active today' : `${b.daysSinceActivity}d ago`}
                            </div>
                         </td>
                         <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>
                           {b.total_revenue?.toLocaleString()}
                         </td>
                         <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                           <ChevronRight size={18} color="var(--border)" />
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </div>
          </div>
        )}

        {/* Tab: SUPPORT DESK */}
        {activeTab === 'support' && (
          <div className="fade-in">
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="grid-mobile-1">
                {/* Tickets List */}
                <div className="card-premium">
                   <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Support Queue</h3>
                   </div>
                   <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                      {tickets.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No active support tickets.</div>
                      ) : (
                        tickets.map(t => (
                          <div 
                            key={t.id} 
                            onClick={() => fetchTicketDetail(t.id)}
                            style={{ 
                              padding: '16px 24px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                              background: selectedTicket?.id === t.id ? 'rgba(16, 185, 129, 0.05)' : 'transparent'
                            }}
                          >
                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span className={`badge-status status-${t.status.replace('_', '')}`}>{t.status.toUpperCase()}</span>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(t.updated_at).toLocaleString()}</span>
                             </div>
                             <div style={{ fontWeight: 700, fontSize: '14px' }}>{t.subject}</div>
                             <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{t.business_name} • {t.owner_email}</div>
                          </div>
                        ))
                      )}
                   </div>
                </div>

                {/* Conversation Thread */}
                <div className="card-premium" style={{ display: 'flex', flexDirection: 'column' }}>
                   {selectedTicket ? (
                     <>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <div>
                              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>{selectedTicket.subject}</h3>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{selectedTicket.business_name}</div>
                           </div>
                           <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'resolved')} style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer' }}>RESOLVE</button>
                              <button onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'closed')} style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px', background: '#6b7280', color: '#fff', border: 'none', cursor: 'pointer' }}>CLOSE</button>
                           </div>
                        </div>
                        <div style={{ flex: 1, padding: '24px', overflowY: 'auto', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '400px' }}>
                           {ticketMessages.map(msg => (
                             <div key={msg.id} style={{
                               alignSelf: msg.sender_role === 'admin' ? 'flex-end' : 'flex-start',
                               maxWidth: '85%',
                               padding: '12px 16px',
                               borderRadius: '12px',
                               background: msg.sender_role === 'admin' ? 'var(--accent)' : 'var(--surface)',
                               color: msg.sender_role === 'admin' ? '#fff' : 'var(--text)',
                               border: msg.sender_role === 'admin' ? 'none' : '1px solid var(--border)'
                             }}>
                               <div style={{ fontSize: '13px' }}>{msg.content}</div>
                               <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.7 }}>{new Date(msg.created_at).toLocaleTimeString()}</div>
                             </div>
                           ))}
                        </div>
                        <div style={{ padding: '20px', borderTop: '1px solid var(--border)' }}>
                           <form onSubmit={handleAdminReply} style={{ display: 'flex', gap: '10px' }}>
                              <input 
                                placeholder="Type your response..."
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                              />
                              <button type="submit" className="btn-primary" style={{ padding: '0 20px' }}>REPLY</button>
                           </form>
                        </div>
                     </>
                   ) : (
                     <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        Select a ticket to begin supporting
                     </div>
                   )}
                </div>
             </div>
          </div>
        )}

        {/* Tab 3: USER DIRECTORY */}
        {activeTab === 'users' && (
          <div className="fade-in">
             <div className="card-premium" style={{ padding: '0', overflow: 'hidden' }}>
               <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Identity Management</h3>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>{users.length} Identities Linked</div>
               </div>
               
               <div style={{ overflowX: 'auto' }}>
                 <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                   <thead>
                     <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                       <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>IDENTITY</th>
                       <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>ROLE</th>
                       <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>CREATED</th>
                       <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>LAST LOGIN</th>
                       <th style={{ padding: '16px 24px' }}></th>
                     </tr>
                   </thead>
                   <tbody>
                     {users.map(u => (
                       <tr key={u.uid} className="fleet-row">
                         <td style={{ padding: '16px 24px' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                             <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                               <Users size={14} color="var(--text-muted)" />
                             </div>
                             <div>
                               <div style={{ fontWeight: 700, fontSize: '14px' }}>{u.displayName || 'Unnamed User'}</div>
                               <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.email}</div>
                             </div>
                           </div>
                         </td>
                         <td style={{ padding: '16px 24px' }}>
                           <span className={`badge-status status-${u.role}`}>
                             {u.role.toUpperCase()}
                           </span>
                         </td>
                         <td style={{ padding: '16px 24px', fontSize: '13px' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                         <td style={{ padding: '16px 24px', fontSize: '13px' }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}</td>
                         <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                           <ShieldCheck size={18} color="var(--border)" />
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </div>
          </div>
        )}

        {/* Tab 4: TELEMETRY */}
        {activeTab === 'activities' && (
          <div className="fade-in">
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginBottom: '24px' }} className="grid-mobile-1">
                <div className="card-premium" style={{ padding: '24px' }}>
                   <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '20px' }}>Hourly Sales Velocity</h3>
                   <div style={{ height: '220px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                         <AreaChart data={overview?.hourlyVelocity || []}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                            <XAxis dataKey="hour" tick={{fontSize: 10}} tickFormatter={(h) => `${h}:00`} />
                            <YAxis tick={{fontSize: 10}} />
                            <Tooltip />
                            <Area type="stepAfter" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                         </AreaChart>
                      </ResponsiveContainer>
                   </div>
                </div>
                <div className="card-premium" style={{ padding: '24px' }}>
                   <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '20px' }}>Inventory Health Report</h3>
                   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                      {overview?.inventoryHealth?.map((h, i) => (
                        <div key={i} style={{ textAlign: 'center', padding: '16px', borderRadius: '12px', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                           <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '8px' }}>{h.status.toUpperCase()}</div>
                           <div style={{ fontSize: '24px', fontWeight: 900, color: h.status === 'instock' ? 'var(--accent)' : '#ef4444' }}>{h.count}</div>
                           <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Products</div>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
             
             <div className="card-premium" style={{ padding: '0' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
                   <h3 style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Activity size={20} color="var(--accent)" /> Real-time System Telemetry
                   </h3>
                </div>
                <div style={{ padding: '8px' }}>
                   {activities.length > 0 ? (
                     <div className="telemetry-grid">
                        {activities.map(act => (
                          <div key={act.id} className="telemetry-item">
                             <div className="telemetry-brand">{act.business_name}</div>
                             <div className="telemetry-content">
                                <span className="telemetry-qty">{act.quantity}x</span>
                                <span className="telemetry-prod">{act.product_name}</span>
                             </div>
                             <div className="telemetry-footer">
                                <span className="telemetry-val">KSh {parseFloat(act.total).toLocaleString()}</span>
                                <span className="telemetry-time">{new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                             </div>
                          </div>
                        ))}
                     </div>
                   ) : (
                     <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>No live data detected.</div>
                   )}
                </div>
             </div>
          </div>
        )}

      </main>

      {/* Deep Dive Modal */}
      {showDetail && selectedBusiness && (
        <div className="modal-overlay" onClick={() => setShowDetail(false)}>
           <div className="side-panel-premium" onClick={e => e.stopPropagation()}>
              <div className="panel-header">
                <button className="btn-back" onClick={() => setShowDetail(false)}>
                  <ArrowLeft size={18} /> RETURN
                </button>
                <div style={{display: 'flex', gap: '8px'}}>
                  {selectedBusiness.business.is_suspended && (
                    <div className="status-pill" style={{background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)'}}>
                      SUSPENDED
                    </div>
                  )}
                  <div className={`status-pill ${selectedBusiness.business.subscription_status}`}>
                    {selectedBusiness.business.subscription_status?.toUpperCase()}
                  </div>
                </div>
              </div>
              
              <div style={{ padding: '32px' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px' }}>
                    <div className="business-avatar">
                       <Store size={32} color="var(--accent)" />
                    </div>
                    <div>
                       <h2 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>{selectedBusiness.business.name}</h2>
                       <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>UID: {selectedBusiness.business.id.split('-')[0]}...</p>
                    </div>
                 </div>

                 <div className="panel-section">
                    <h4 className="section-title">PERFORMANCE TREND (30D)</h4>
                    <div style={{ height: '180px', marginBottom: '24px', width: '100%', minWidth: 0, position: 'relative' }}>
                       <ResponsiveContainer width="100%" height="100%">
                         <AreaChart data={selectedBusiness.revenueTrend}>
                           <Area type="monotone" dataKey="amount" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.1} strokeWidth={2} />
                           <Tooltip />
                         </AreaChart>
                       </ResponsiveContainer>
                    </div>
                 </div>

                 <div className="panel-section">
                    <h4 className="section-title">EQUITY LEADERS</h4>
                    <div className="top-products-list">
                       {selectedBusiness.topProducts.map((p, i) => (
                         <div key={i} className="top-product-item">
                            <span className="prod-name">{p.product_name}</span>
                            <span className="prod-rev">KSh {parseFloat(p.revenue).toLocaleString()}</span>
                         </div>
                       ))}
                    </div>
                 </div>

                 <div className="panel-section">
                    <h4 className="section-title">RECENT LEDGER ENTRIES</h4>
                    <div className="recent-sales-list">
                       {selectedBusiness.recentSales.map((s, i) => (
                         <div key={i} className="sale-item">
                            <div className="sale-info">
                               <div className="sale-prod">{s.product_name}</div>
                               <div className="sale-time">{new Date(s.created_at).toLocaleString()}</div>
                            </div>
                            <div className="sale-total">KSh {parseFloat(s.total).toLocaleString()}</div>
                         </div>
                       ))}
                    </div>
                 </div>
                  {/* ACTION BAR */}
                  <div className="panel-section" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '32px' }}>
                     <button onClick={() => handleImpersonate(selectedBusiness.business.id)} className="btn-primary" style={{ flex: 1, minWidth: '140px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                        <Globe size={16} /> Impersonate
                     </button>
                     <button onClick={() => handleExtendTrial(selectedBusiness.business.id)} className="btn-secondary" style={{ flex: 1, minWidth: '140px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', background: 'var(--bg)', border: '1px solid var(--border)', cursor: 'pointer', borderRadius: '8px' }}>
                        <Clock size={16} /> Extend Trial
                     </button>
                     <button onClick={() => handleSuspendToggle(selectedBusiness.business.id, selectedBusiness.business.is_suspended)} className="btn-secondary" style={{ flex: 1, minWidth: '140px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', cursor: 'pointer', borderRadius: '8px', background: selectedBusiness.business.is_suspended ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: selectedBusiness.business.is_suspended ? '#10b981' : '#ef4444', border: `1px solid ${selectedBusiness.business.is_suspended ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` }}>
                        <AlertCircle size={16} /> {selectedBusiness.business.is_suspended ? 'Reactivate' : 'Suspend'}
                     </button>
                  </div>

                  {/* CRM NOTES */}
                  <div className="panel-section">
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 className="section-title" style={{ margin: 0 }}>CRM NOTES (Auto-saves on action)</h4>
                     </div>
                     <textarea 
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Internal notes for this merchant..."
                        style={{ width: '100%', height: '80px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text)', fontSize: '13px', resize: 'vertical' }}
                     />
                  </div>

              </div>
           </div>
        </div>
      )}

      {/* Enhanced Styles */}
      <style>{`
        :root {
          --accent: #10b981;
          --accent-glow: rgba(16, 185, 129, 0.4);
          --surface: ${theme === 'dark' ? '#111827' : '#ffffff'};
          --bg: ${theme === 'dark' ? '#0B0F19' : '#F9FAFB'};
          --border: ${theme === 'dark' ? '#1F2937' : '#E5E7EB'};
          --text: ${theme === 'dark' ? '#F9FAFB' : '#111827'};
          --text-muted: ${theme === 'dark' ? '#9CA3AF' : '#6B7280'};
          --panel-shadow: ${theme === 'dark' ? '0 20px 50px rgba(0,0,0,0.5)' : '0 20px 50px rgba(0,0,0,0.1)'};
        }

        .card-premium {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          min-width: 0;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .card-premium:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }

        .search-box-premium {
          display: flex; align-items: center; gap: 10px;
          background: var(--bg); border: 1px solid var(--border);
          padding: 8px 16px; border-radius: 12px; width: 300px;
        }
        .search-box-premium input {
          background: transparent; border: none; outline: none; color: var(--text); font-size: 13px; width: 100%;
        }

        .fleet-row {
          border-bottom: 1px solid var(--border);
          cursor: pointer;
          transition: background 0.2s;
        }
        .fleet-row:hover { background: rgba(16, 185, 129, 0.03); }

        .badge-status {
          padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.02em;
        }
        .status-healthy { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .status-at_risk { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .status-dormant { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .status-new { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
        .status-admin { background: #111827; color: var(--accent); border: 1px solid var(--accent); }
        .status-merchant { background: rgba(16, 185, 129, 0.1); color: #10b981; }

        .btn-icon-premium {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          border-radius: 10px; background: var(--surface); border: 1px solid var(--border);
          color: var(--text-muted); cursor: pointer; transition: all 0.2s;
        }
        .btn-icon-premium:hover { 
          background: var(--bg); color: var(--text); border-color: var(--accent);
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.2);
        }

        .side-panel-premium {
          width: 520px; height: 100%; background: var(--surface);
          box-shadow: -10px 0 30px rgba(0,0,0,0.2);
          animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .business-avatar {
          width: 64px; height: 64px; border-radius: 18px; background: var(--bg);
          display: flex; align-items: center; justify-content: center; border: 1px solid var(--border);
        }
        .panel-header {
           padding: 24px; border-bottom: 1px solid var(--border);
           display: flex; justify-content: space-between; align-items: center;
        }

        .dot-pulse {
          width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }

        .telemetry-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px;
        }
        .telemetry-item {
          padding: 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
          transition: border-color 0.3s;
        }
        .telemetry-item:hover { border-color: var(--accent); }
        .telemetry-brand { font-size: 10px; font-weight: 800; color: var(--accent); margin-bottom: 8px; text-transform: uppercase; }
        .telemetry-content { display: flex; gap: 8px; font-weight: 700; margin-bottom: 12px; }
        .telemetry-qty { color: var(--text-muted); }
        .telemetry-footer { display: flex; justify-content: space-between; align-items: center; }
        .telemetry-val { font-size: 14px; font-weight: 800; }
        .telemetry-time { font-size: 10px; color: var(--text-muted); }

        .top-product-item {
          display: flex; justify-content: space-between; padding: 12px; 
          background: var(--bg); border-radius: 8px; margin-bottom: 8px; font-size: 13px;
          border-left: 3px solid var(--accent);
        }
        .sale-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 0; border-bottom: 1px dashed var(--border);
        }
        .sale-prod { font-weight: 700; font-size: 14px; }
        .sale-time { font-size: 10px; color: var(--text-muted); }
        .sale-total { font-weight: 800; color: var(--accent); }

        @media (max-width: 768px) {
          .grid-mobile-1 { grid-template-columns: 1fr !important; }
          .side-panel-premium { width: 100%; }
        }
      `}</style>
    </div>
  );
}
