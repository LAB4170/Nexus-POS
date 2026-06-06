import { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  ShoppingCart, FileText, Download, RefreshCw, AlertTriangle, CheckCircle
} from 'lucide-react';
import api from '../services/api';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useBusiness } from '../context/BusinessContext';
import { useSocket } from '../context/SocketContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 });

// ── Metric Card ──
const MetricCard = ({ title, value, sub, icon: Icon, color, border }) => (
  <div className="card-elevated" style={{ padding: '20px 24px', borderLeft: border ? `4px solid ${color}` : undefined }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>{title}</span>
        <h2 style={{ fontSize: '26px', fontWeight: 800, margin: '6px 0 4px', color: color || 'var(--text)' }}>{value}</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{sub}</p>
      </div>
      {Icon && (
        <div style={{ width: 42, height: 42, borderRadius: '10px', background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={20} />
        </div>
      )}
    </div>
  </div>
);

// ── Custom Tooltip ──
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', boxShadow: 'var(--shadow-lg)' }}>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ fontSize: '14px', fontWeight: 700, color: p.color }}>KSh {fmt(p.value)}</p>
      ))}
    </div>
  );
};

export default function Reports() {
  const { business } = useBusiness();
  const [data, setData] = useState(null);
  const [allSales, setAllSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState([null, null]);
  const [startDate, endDate] = dateRange;
  const backoffRef = useRef(false);
  const socket = useSocket();

  const fetchReports = async () => {
    if (backoffRef.current) return;
    try {
      setLoading(true);
      let queryParams = '';
      if (startDate && endDate) {
        // Adjust end date to capture end of the selected day
        const to = new Date(endDate);
        to.setHours(23, 59, 59, 999);
        queryParams = `?date_from=${startDate.toISOString()}&date_to=${to.toISOString()}`;
      }

      const [statsRes, chartsRes, salesRes] = await Promise.allSettled([
        api.get(`/dashboard/stats${queryParams}`),
        api.get(`/dashboard/charts${queryParams}`),
        api.get(`/sales${queryParams ? queryParams + '&' : '?'}sortBy=created_at&sortDir=desc`)
      ]);

      // Handle 429
      const hit429 = [statsRes, chartsRes, salesRes].some(r => r.status === 'rejected' && r.reason?.response?.status === 429);
      if (hit429) {
        backoffRef.current = true;
        setTimeout(() => { backoffRef.current = false; }, 30000);
        return;
      }

      const stats = statsRes.status === 'fulfilled' ? statsRes.value.data.data : {};
      const charts = chartsRes.status === 'fulfilled' ? chartsRes.value.data.data : {};
      const sales  = salesRes.status  === 'fulfilled' ? (salesRes.value.data.data || []) : [];

      setData({ stats, charts });
      setAllSales(sales);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 60000);
    return () => clearInterval(interval);
  }, [startDate, endDate]);

  useEffect(() => {
    if (!socket) return;
    const debounced = () => {
      clearTimeout(window._reportDebounce);
      window._reportDebounce = setTimeout(fetchReports, 600);
    };
    socket.on('data-update', debounced);
    socket.on('data-refresh', debounced);
    return () => {
      socket.off('data-update', debounced);
      socket.off('data-refresh', debounced);
    };
  }, [socket]);

  // ── CSV Export ──
  const exportCSV = () => {
    if (!allSales.length) return;
    setExporting(true);
    const headers = ['Date', 'Product', 'Qty', 'Unit Price', 'Total', 'Payment', 'Status'];
    const rows = allSales.map(s => {
      let itemDesc = 'Unknown';
      let totalQty = s.quantity || 0;
      let uPrice = s.unitPrice || s.unit_price || 0;
      if (s.items && s.items.length > 0) {
        itemDesc = s.items.map(i => `${i.product_name || i.productName} (x${i.quantity})`).join('; ');
        totalQty = s.items.reduce((sum, i) => sum + Number(i.quantity), 0);
        if (s.items.length === 1) uPrice = s.items[0].unit_price || s.items[0].unitPrice || uPrice;
      } else if (s.productName || s.product_name) {
        itemDesc = s.productName || s.product_name;
      }
      return [
        new Date(s.createdAt || s.created_at).toLocaleString('en-KE'),
        itemDesc,
        totalQty,
        uPrice,
        s.total,
        s.paymentMethod || s.payment_method,
        s.status
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const prefix = business?.name ? `${business.name.toLowerCase().replace(/\s+/g, '-')}-` : '';
    a.download = `${prefix}sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    setExporting(false);
  };

  // ── PDF Export ──
  const exportPDF = () => {
    if (!allSales.length) return;
    setExporting(true);
    try {
      const doc = new jsPDF();
      const prefix = business?.name ? business.name : 'Business';

      // Header: Premium look
      doc.setFontSize(26);
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.text(prefix.toUpperCase(), 14, 22);
      
      doc.setFontSize(14);
      doc.setTextColor(100, 116, 139); // Slate 500
      doc.text('FINANCIAL INTELLIGENCE REPORT', 14, 30);

      // Date Range Info + Generated stamp aligned right
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const generatedStamp = `Generated: ${new Date().toLocaleString()}`;
      const rangeText = startDate && endDate 
        ? `Snapshot Period: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}` 
        : `Snapshot Period: All-Time`;
      
      doc.text(rangeText, 14, 38);
      doc.text(generatedStamp, doc.internal.pageSize.width - 14, 38, { align: 'right' });
      
      // Decorative line
      doc.setDrawColor(226, 232, 240); // Slate 200
      doc.setLineWidth(0.5);
      doc.line(14, 42, doc.internal.pageSize.width - 14, 42);

      const totalRevenue = data?.stats?.sales?.total_revenue || 0;
      const totalCOGS    = data?.stats?.sales?.total_cogs    || 0;
      const grossProfit  = totalRevenue - totalCOGS;
      const totalExpenses = data?.stats?.expenses?.total_expenses || 0;
      const trueNetProfit = grossProfit - totalExpenses;

      // Financial Summary Block — GAAP-structured P&L
      autoTable(doc, {
        startY: 50,
        head: [['Metric', 'Amount (KSh)']],
        body: [
          ['(+) Total Revenue',       `KSh ${fmt(totalRevenue)}`],
          ['(-) Cost of Goods Sold',  `KSh ${fmt(totalCOGS)}`],
          ['(=) Gross Profit',        `KSh ${fmt(grossProfit)}`],
          ['(-) Operating Expenses',  `KSh ${fmt(totalExpenses)}`],
          ['(=) Net Profit',          `KSh ${fmt(trueNetProfit)}`],
          ['    Gross Margin %',      `${totalRevenue ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0}%`],
          ['    Net Margin %',        `${totalRevenue ? ((trueNetProfit / totalRevenue) * 100).toFixed(1) : 0}%`],
          ['Outstanding Debt',        `KSh ${fmt(data?.stats?.debts?.total_outstanding)}`],
          ['Total Transactions',      `${allSales.length} sales`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 11, cellPadding: 4 },
        columnStyles: { 0: { fontStyle: 'bold', minCellWidth: 60 } },
        margin: { top: 10, bottom: 10 }
      });

      // Split Analytics section
      doc.setFontSize(14);
      doc.setTextColor(40, 40, 40);
      doc.text('Operational Analytics', 14, doc.lastAutoTable.finalY + 14);

      // Payment Breakdown & Expenses (Side by Side simulation or stacked if simple)
      const payDist = data?.charts?.payment_distribution || {};
      const breakdownBody = [
        ['Cash', `KSh ${fmt(payDist.cash || 0)}`],
        ['M-Pesa', `KSh ${fmt(payDist.mpesa || 0)}`],
        ['Debt', `KSh ${fmt(payDist.debt || 0)}`]
      ];

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Payment Method', 'Collected']],
        body: breakdownBody,
        theme: 'striped',
        headStyles: { fillColor: [245, 158, 11] },
        styles: { fontSize: 9 },
        margin: { right: 110 } // Left side table
      });
      const breakdownFinalY = doc.lastAutoTable.finalY;

      const expensesData = (data?.charts?.expenses_by_category || []).map(e => [e.category, `KSh ${fmt(e.total_amount)}`]);
      let expensesFinalY = doc.lastAutoTable.finalY;
      
      if (expensesData.length > 0) {
        autoTable(doc, {
          startY: doc.lastAutoTable.finalY - breakdownBody.length * 10 - 15, // Align with left table
          head: [['Expense Category', 'Outflow']],
          body: expensesData,
          theme: 'striped',
          headStyles: { fillColor: [239, 68, 68] },
          styles: { fontSize: 9 },
          margin: { left: 110 } // Right side table
        });
        expensesFinalY = doc.lastAutoTable.finalY;
      }

      const maxY = Math.max(breakdownFinalY, expensesFinalY);

      // Top Products Table
      const topProductsData = (data?.charts?.top_products || []).slice(0, 5).map(p => [
        (p.productName || p.product_name || 'Unknown Item').substring(0, 30),
        p.quantity_sold,
        `KSh ${fmt(p.revenue)}`
      ]);

      if (topProductsData.length > 0) {
        doc.text('Top Performing Products', 14, maxY + 14);
        autoTable(doc, {
          startY: maxY + 20,
          head: [['Product', 'Units Sold', 'Total Revenue']],
          body: topProductsData,
          theme: 'grid',
          headStyles: { fillColor: [139, 92, 246] },
          styles: { fontSize: 9 }
        });
      }

      // Full Transactions Ledger
      doc.addPage();
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text('Detailed Transaction Ledger', 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('Itemized receipt of all recorded interactions matching this snapshot.', 14, 26);

      const tableColumn = ["Date", "Item Sold", "Qty", "Unit Price", "Pmt Method", "Total"];
      const tableRows = [];

      allSales.forEach(sale => {
        // Multi-item formatting: Combine all items into a single descriptive string
        let itemDescription = 'Unknown Item';
        if (sale.items && sale.items.length > 0) {
          itemDescription = sale.items.map(i => `${i.product_name || i.productName} (x${i.quantity})`).join('\n');
        } else if (sale.productName || sale.product_name) {
          itemDescription = `${sale.productName || sale.product_name} (x${sale.quantity || 1})`;
        }

        const saleData = [
          new Date(sale.createdAt || sale.created_at).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' }),
          itemDescription,
          sale.items?.length > 0 ? `${sale.items.reduce((s, i) => s + Number(i.quantity), 0)}` : `${sale.quantity || 1}`,
          sale.items?.length === 1 ? `KSh ${fmt(sale.items[0].unit_price || sale.items[0].unitPrice)}` : 'Mixed',
          (sale.paymentMethod || sale.payment_method || '').toUpperCase(),
          `KSh ${fmt(sale.total)}`
        ];
        tableRows.push(saleData);
      });

      autoTable(doc, {
        startY: 34,
        head: [tableColumn],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        styles: { fontSize: 9, cellPadding: 4 },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });

      doc.save(`${prefix.toLowerCase().replace(/\s+/g, '-')}-financial-report.pdf`);
    } catch (err) {
      console.error(err);
      setError('Failed to generate PDF. Make sure all files are loaded.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Generating Financial Insights...</span>
    </div>
  );

  if (error) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <AlertTriangle size={40} style={{ color: 'var(--danger)', marginBottom: 12 }} />
      <h3 style={{ marginBottom: 8 }}>Failed to load reports</h3>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>{error}</p>
      <button className="btn-primary" onClick={fetchReports}>
        <RefreshCw size={14} /> Retry
      </button>
    </div>
  );

  const { stats = {}, charts = {} } = data || {};
  const salesStats = stats?.sales || {};
  const expStats   = stats?.expenses || {};
  const debtStats  = stats?.debts || {};
  const invStats   = stats?.inventory || {};

  const totalRevenue = salesStats.total_revenue || 0;
  const totalCOGS    = salesStats.total_cogs    || 0;
  const grossProfit  = totalRevenue - totalCOGS;
  const totalExpenses = expStats.total_expenses  || 0;
  const netProfit    = grossProfit - totalExpenses;
  const grossMarginPct = totalRevenue ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';
  const netMarginPct   = totalRevenue ? ((netProfit   / totalRevenue) * 100).toFixed(1) : '0.0';
  const debtRatio = salesStats.total_revenue
    ? Math.round((debtStats.total_outstanding / salesStats.total_revenue) * 100)
    : 0;

  const paymentPieData = [
    { name: 'Cash',   value: salesStats.cash_sales  || 0 },
    { name: 'M-Pesa', value: salesStats.mpesa_sales || 0 },
    { name: 'Debt',   value: salesStats.debt_sales  || 0 }
  ].filter(d => d.value > 0);

  const dailySales = charts?.daily_sales || [];
  const expByCategory = charts?.expenses_by_category || [];
  const topProducts = charts?.top_products || [];
  const lowStock = invStats?.low_stock_products || [];

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* ── Header ── */}
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800 }}>Financial Intelligence</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Real-time auditing and historical reporting</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => { const today = new Date(); setDateRange([today, today]); }} style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: 'var(--text)' }}>Today</button>
            <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); setDateRange([d, new Date()]); }} style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: 'var(--text)' }}>Last 7 Days</button>
            <button onClick={() => { const d = new Date(); d.setMonth(d.getMonth() - 1); setDateRange([d, new Date()]); }} style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: 'var(--text)' }}>Last Month</button>
            <button onClick={() => { const d = new Date(new Date().getFullYear(), 0, 1); setDateRange([d, new Date()]); }} style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: 'var(--text)' }}>This Year</button>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '2px', overflow: 'hidden' }}>
              <DatePicker
                selectsRange={true}
                startDate={startDate}
                endDate={endDate}
                onChange={(update) => setDateRange(update)}
                isClearable={true}
                placeholderText="Select Custom Date Range"
                className="date-picker-input custom-input"
              />
            </div>
            <button onClick={fetchReports} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: '10px', background: 'var(--surface-hover)', border: '1px solid var(--border)', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>
              <RefreshCw size={14} /> Refresh
            </button>
            <div style={{ display: 'flex', background: 'var(--surface-hover)', borderRadius: '10px', overflow: 'hidden', padding: 2 }}>
              <button onClick={exportCSV} disabled={exporting || !allSales.length} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer', border: 'none', opacity: !allSales.length ? 0.5 : 1 }}>
                <Download size={14} /> CSV
              </button>
              <button onClick={exportPDF} disabled={exporting || !allSales.length} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: '8px', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', border: 'none', opacity: !allSales.length ? 0.5 : 1 }}>
                <Download size={14} /> PDF
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <MetricCard title="Gross Profit" value={`KSh ${fmt(grossProfit)}`} sub={`Margin: ${grossMarginPct}%`} icon={grossProfit >= 0 ? TrendingUp : TrendingDown} color={grossProfit >= 0 ? '#10B981' : '#EF4444'} border />
        <MetricCard title="Net Profit" value={`KSh ${fmt(netProfit)}`} sub={`Margin: ${netMarginPct}%`} icon={netProfit >= 0 ? TrendingUp : TrendingDown} color={netProfit >= 0 ? '#3B82F6' : '#EF4444'} border />
        <MetricCard title="Total Revenue" value={`KSh ${fmt(totalRevenue)}`} sub={`${salesStats.total_sales || 0} transactions`} icon={ShoppingCart} color="#8B5CF6" border />
        <MetricCard title="Total COGS" value={`KSh ${fmt(totalCOGS)}`} sub="Cost of goods sold" icon={TrendingDown} color="#F59E0B" border />
        <MetricCard title="Operating Expenses" value={`KSh ${fmt(totalExpenses)}`} sub="All recorded expenses" icon={TrendingDown} color="#EF4444" border />
        <MetricCard title="Debt Outstanding" value={`KSh ${fmt(debtStats.total_outstanding)}`} sub={`${debtRatio}% of revenue`} icon={FileText} color="#6366F1" border />
      </div>

      {/* ── Charts Row 1: Revenue Trend + Payment Mix ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, marginBottom: 20, overflow: 'hidden' }}>
        <section className="card-elevated" style={{ padding: '24px', minWidth: 0, minHeight: 0 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: 6 }}>Revenue Trend</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 20 }}>Daily sales revenue for selected period</p>
          {dailySales.length === 0 ? (
            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <TrendingUp size={30} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sales data for the last 7 days</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={dailySales} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="date" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false}
                  tickFormatter={d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short' }); } catch { return d; } }}
                />
                <YAxis fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} width={68}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="total_revenue" stroke="#10B981" strokeWidth={2.5}
                  fill="url(#rGrad)" dot={{ r: 4, fill: '#10B981', strokeWidth: 0 }} name="Revenue" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="card-elevated" style={{ padding: '24px', minWidth: 0, minHeight: 0 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: 6 }}>Payment Method Mix</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 12 }}>All-time breakdown</p>
          {paymentPieData.length === 0 ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <DollarSign size={30} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No payment data yet</span>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={paymentPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    paddingAngle={4} dataKey="value">
                    {paymentPieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `KSh ${fmt(v)}`} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
                {paymentPieData.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i] }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{d.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>KSh {fmt(d.value)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ── Charts Row 2: Top Products + Expense Categories ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20, overflow: 'hidden' }}>
        <section className="card-elevated" style={{ padding: '24px', minWidth: 0, minHeight: 0 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: 20 }}>Top Selling Products</h3>
          {topProducts.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <ShoppingCart size={28} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No product sales yet</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProducts.slice(0, 6)} layout="vertical" margin={{ left: 4, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="product_name" type="category" width={90} fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <Tooltip formatter={v => `KSh ${fmt(v)}`} cursor={{ fill: 'var(--border)', opacity: 0.4 }} />
                <Bar dataKey="total_revenue" fill="#3B82F6" radius={[0, 6, 6, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="card-elevated" style={{ padding: '24px', minWidth: 0, minHeight: 0 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: 20 }}>Expense Categories</h3>
          {expByCategory.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <TrendingDown size={28} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No expense data yet</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={expByCategory} layout="vertical" margin={{ left: 4, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="category" type="category" width={90} fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <Tooltip formatter={v => `KSh ${fmt(v)}`} cursor={{ fill: 'var(--border)', opacity: 0.4 }} />
                <Bar dataKey="total_amount" fill="#F59E0B" radius={[0, 6, 6, 0]} name="Amount" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      {/* ── Inventory Health ── */}
      <section className="card-elevated" style={{ padding: '24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Inventory Health Report</h3>
          {invStats.low_stock_count > 0 ? (
            <span style={{ fontSize: 12, fontWeight: 700, background: '#FEF2F218', color: '#EF4444', borderRadius: 6, padding: '4px 10px', border: '1px solid #EF444430' }}>
              ⚠ {invStats.low_stock_count} Critical Items
            </span>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, background: '#10B98118', color: '#10B981', borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle size={12} /> All Healthy
            </span>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="pos-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Est. Value</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>All inventory levels are healthy ✓</td></tr>
              ) : lowStock.map((p, i) => {
                const stock = p.stock_quantity ?? p.stock ?? 0;
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>{stock} units</td>
                    <td>
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, background: '#EF44441A', color: '#EF4444' }}>CRITICAL</span>
                    </td>
                    <td style={{ fontWeight: 700 }}>KSh {((stock) * (p.selling_price || p.price || 0)).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Recent Transactions Table ── */}
      <section className="card-elevated" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Recent Transactions</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{allSales.length} total records</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="pos-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Method</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {allSales.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No transactions recorded yet.</td></tr>
              ) : allSales.slice(0, 15).map((s, i) => {
                const pmColor = s.paymentMethod === 'mpesa' ? '#3B82F6' : s.paymentMethod === 'debt' ? '#F59E0B' : '#10B981';
                const pmLabel = s.paymentMethod === 'mpesa' ? 'M-PESA' : s.paymentMethod === 'debt' ? 'DEBT' : 'CASH';
                
                let itemDesc = 'Unknown';
                let totalQty = s.quantity || 0;
                if (s.items && s.items.length > 0) {
                  itemDesc = s.items.map(it => `${it.product_name || it.productName}`).join(', ');
                  totalQty = s.items.reduce((sum, it) => sum + Number(it.quantity), 0);
                } else if (s.productName || s.product_name) {
                  itemDesc = s.productName || s.product_name;
                }

                return (
                  <tr key={i}>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {(() => { try { return new Date(s.createdAt || s.created_at).toLocaleString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } })()}
                    </td>
                    <td style={{ fontWeight: 600 }}>{itemDesc}</td>
                    <td>{totalQty}</td>
                    <td style={{ fontWeight: 800 }}>KSh {fmt(s.total)}</td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, background: `${pmColor}18`, color: pmColor, borderRadius: 4, padding: '2px 7px' }}>{pmLabel}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, background: s.status === 'completed' ? '#10B98118' : '#F59E0B18', color: s.status === 'completed' ? '#10B981' : '#F59E0B', borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase' }}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {allSales.length > 15 && (
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            Showing 15 of {allSales.length} — <button onClick={exportCSV} style={{ color: 'var(--accent)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>Export all as CSV</button>
          </p>
        )}
      </section>
    </div>
  );
}
