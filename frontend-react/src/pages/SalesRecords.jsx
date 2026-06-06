import { useState, useEffect, useRef } from 'react';
import { Search, Download, Pencil, Trash2, Eye, X, Save, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useBusiness } from '../context/BusinessContext';

const METHOD_COLORS = {
  cash:  { bg: '#10B98118', color: '#10B981', label: 'CASH' },
  mpesa: { bg: '#3B82F618', color: '#3B82F6', label: 'M-PESA' },
  debt:  { bg: '#F59E0B18', color: '#F59E0B', label: 'DEBT' },
};
const statusColor = s => s === 'completed' ? { bg: '#10B98118', color: '#10B981' } : { bg: '#F59E0B18', color: '#F59E0B' };

/** Derive a readable product label from a sale object (handles multi-item) */
function getItemLabel(sale) {
  if (sale.items && sale.items.length > 0) {
    return sale.items.map(it => `${it.product_name || it.productName || 'Unknown'} (x${it.quantity})`).join(', ');
  }
  if (sale.productName || sale.product_name) {
    return `${sale.productName || sale.product_name} (x${sale.quantity || 1})`;
  }
  return 'Unknown';
}

// ── Confirmation Dialog ──
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div className="card-elevated" style={{ padding: '32px', borderRadius: '16px', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <AlertTriangle size={40} style={{ color: '#EF4444', marginBottom: '16px' }} />
        <h3 style={{ marginBottom: '8px', fontSize: '18px' }}>Confirm Delete</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '14px' }}>{message}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button onClick={onCancel} style={{ padding: '10px 24px', borderRadius: '10px', background: 'var(--surface-hover)', border: '1px solid var(--border)', fontWeight: 700, cursor: 'pointer', color: 'var(--text)' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '10px 24px', borderRadius: '10px', background: '#EF4444', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── View Modal ──
function ViewModal({ sale, onClose }) {
  if (!sale) return null;
  const m = METHOD_COLORS[sale.paymentMethod] || METHOD_COLORS.cash;
  const sc = statusColor(sale.status);
  const itemsDisplay = sale.items && sale.items.length > 0
    ? sale.items.map(it => `${it.product_name || it.productName} ×${it.quantity} @ KSh ${Number(it.unit_price || it.unitPrice || 0).toLocaleString()}`).join('\n')
    : getItemLabel(sale);

  const rows = [
    ['Sale ID', `#${sale.id.slice(0, 8).toUpperCase()}`],
    ['Items', <pre style={{ fontFamily: 'inherit', margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>{itemsDisplay}</pre>],
    ['Total', `KSh ${Number(sale.total || 0).toLocaleString()}`],
    ['Payment Method', <span style={{ background: m.bg, color: m.color, borderRadius: '6px', padding: '2px 10px', fontWeight: 800, fontSize: 12 }}>{m.label}</span>],
    ['Customer', sale.customerName || '—'],
    ['Customer Phone', sale.customerPhone || '—'],
    ['M-Pesa Code', sale.mpesaCode || '—'],
    ['Status', <span style={{ background: sc.bg, color: sc.color, borderRadius: '6px', padding: '2px 10px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase' }}>{sale.status}</span>],
    ['Notes', sale.notes || '—'],
    ['Date', new Date(sale.createdAt).toLocaleString('en-KE')],
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
      <div className="card-elevated" style={{ padding: '32px', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800 }}>Sale Details</h3>
          <button onClick={onClose} style={{ background: 'var(--surface-hover)', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--text)', display: 'flex' }}><X size={18} /></button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 0', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 700, width: '40%', verticalAlign: 'top' }}>{k}</td>
                <td style={{ padding: '10px 0', fontSize: '14px', fontWeight: 600 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Edit Modal ──
function EditModal({ sale, onClose, onSaved }) {
  const [form, setForm] = useState({
    paymentMethod: sale.paymentMethod || 'cash',
    customerName: sale.customerName || '',
    customerPhone: sale.customerPhone || '',
    mpesaCode: sale.mpesaCode || '',
    notes: sale.notes || '',
    status: sale.status || 'completed',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/sales/${sale.id}`, {
        paymentMethod: form.paymentMethod,
        customerName: form.customerName || null,
        customerPhone: form.customerPhone || null,
        mpesaCode: form.mpesaCode || null,
        notes: form.notes || null,
        status: form.status,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update sale.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label, key, type = 'text', opts = {}) => (
    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</label>
      {opts.select ? (
        <select value={form[key]} onChange={e => set(key, e.target.value)}
          style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '14px', fontWeight: 600 }}>
          {opts.select.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} value={form[key]} onChange={e => set(key, e.target.value)}
          style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '14px', fontWeight: 600 }} />
      )}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
      <div className="card-elevated" style={{ padding: '32px', borderRadius: '16px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: 800 }}>Edit Sale</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>#{sale.id.slice(0, 8).toUpperCase()} — KSh {Number(sale.total || 0).toLocaleString()}</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface-hover)', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--text)', display: 'flex' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          {field('Payment Method', 'paymentMethod', 'text', { select: [{ value: 'cash', label: 'Cash' }, { value: 'mpesa', label: 'M-Pesa' }, { value: 'debt', label: 'Debt' }] })}
          {field('Status', 'status', 'text', { select: [{ value: 'completed', label: 'Completed' }, { value: 'pending', label: 'Pending' }, { value: 'cancelled', label: 'Cancelled' }] })}
          {field('Customer Name', 'customerName')}
          {field('Customer Phone', 'customerPhone', 'tel')}
          {field('M-Pesa Code', 'mpesaCode')}
          {field('Notes', 'notes')}
        </div>

        {error && <div style={{ color: '#EF4444', background: '#EF444418', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px', fontWeight: 700 }}>{error}</div>}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: '10px', background: 'var(--surface-hover)', border: '1px solid var(--border)', fontWeight: 700, cursor: 'pointer', color: 'var(--text)' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', borderRadius: '10px', background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: saving ? 0.7 : 1 }}>
            <Save size={15} />{saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

const PER_PAGE = 20;

// ── Main Component ──
export default function SalesRecords() {
  const { business } = useBusiness();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMethod, setFilterMethod] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [viewSale, setViewSale] = useState(null);
  const [editSale, setEditSale] = useState(null);
  const [deleteSale, setDeleteSale] = useState(null);
  const [toast, setToast] = useState(null);
  const debounceRef = useRef(null);
  const searchDebRef = useRef(null);
  const socket = useSocket();

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSales = async (pg = page, method = filterMethod, search = searchTerm) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pg,
        perPage: PER_PAGE,
        sortBy: 'created_at',
        sortDir: 'desc',
      });
      if (method !== 'all') params.set('payment_method', method);
      if (search.trim()) params.set('customer_name', search.trim());

      const { data } = await api.get(`/sales?${params.toString()}`);
      setSales(data.data || []);
      if (data.meta) {
        setTotalPages(data.meta.totalPages || 1);
        setTotalCount(data.meta.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch sales', err);
    } finally {
      setLoading(false);
    }
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    clearTimeout(searchDebRef.current);
    searchDebRef.current = setTimeout(() => {
      setPage(1);
      fetchSales(1, filterMethod, searchTerm);
    }, 400);
  }, [searchTerm, filterMethod]);

  // Refetch on page change
  useEffect(() => {
    fetchSales(page, filterMethod, searchTerm);
  }, [page]);

  useEffect(() => {
    if (!socket) return;
    const debounced = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSales(page, filterMethod, searchTerm), 500);
    };
    socket.on('data-update', debounced);
    socket.on('data-refresh', debounced);
    return () => { socket.off('data-update', debounced); socket.off('data-refresh', debounced); };
  }, [socket, page, filterMethod, searchTerm]);

  const handleDelete = async () => {
    try {
      await api.delete(`/sales/${deleteSale.id}`);
      setDeleteSale(null);
      showToast('Sale deleted successfully.');
      fetchSales(page, filterMethod, searchTerm);
    } catch (err) {
      setDeleteSale(null);
      showToast(err.response?.data?.message || 'Failed to delete sale.', 'error');
    }
  };

  const handleSaved = () => {
    setEditSale(null);
    showToast('Sale updated successfully!');
    fetchSales(page, filterMethod, searchTerm);
  };

  const handleExport = async () => {
    try {
      // Fetch ALL sales for export (no pagination)
      const params = new URLSearchParams({ sortBy: 'created_at', sortDir: 'desc' });
      if (filterMethod !== 'all') params.set('payment_method', filterMethod);
      const { data } = await api.get(`/sales?${params.toString()}`);
      const all = data.data || [];
      if (!all.length) return;

      const headers = ['ID', 'Items', 'Total', 'Method', 'Customer', 'Phone', 'Status', 'Date'];
      const rows = all.map(s => [
        s.id,
        getItemLabel(s),
        s.total,
        s.paymentMethod,
        s.customerName || '',
        s.customerPhone || '',
        s.status,
        new Date(s.createdAt).toLocaleString('en-KE'),
      ]);
      const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const prefix = business?.name ? `${business.name.toLowerCase().replace(/\s+/g, '-')}-` : '';
      a.href = url; a.download = `${prefix}sales-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  const totalShown = sales.reduce((a, s) => a + Number(s.total || 0), 0);

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* ── Modals ── */}
      {viewSale && <ViewModal sale={viewSale} onClose={() => setViewSale(null)} />}
      {editSale && <EditModal sale={editSale} onClose={() => setEditSale(null)} onSaved={handleSaved} />}
      {deleteSale && (
        <ConfirmDialog
          message={`Delete this sale of KSh ${Number(deleteSale.total).toLocaleString()}? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteSale(null)}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 99999, background: toast.type === 'error' ? '#EF4444' : '#10B981', color: '#fff', padding: '12px 20px', borderRadius: '12px', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          <CheckCircle size={16} />
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800 }}>Sales Ledger</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Complete audit history — {totalCount} total transactions</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div className="search-box card-elevated" style={{ background: 'var(--surface)', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '10px' }}>
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search customer, ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '13px', width: '180px' }}
            />
          </div>
          <select value={filterMethod} onChange={e => { setFilterMethod(e.target.value); setPage(1); }}
            style={{ padding: '8px 14px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700, fontSize: '13px' }}>
            <option value="all">All Methods</option>
            <option value="cash">Cash</option>
            <option value="mpesa">M-Pesa</option>
            <option value="debt">Debt</option>
          </select>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '13px', border: 'none', cursor: 'pointer' }}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </header>

      {/* ── Summary row ── */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { label: 'This Page', value: sales.length, suffix: `records (of ${totalCount})` },
          { label: 'Page Total', value: `KSh ${totalShown.toLocaleString()}`, suffix: '' },
        ].map(c => (
          <div key={c.label} className="card-elevated" style={{ padding: '12px 20px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '160px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{c.label}</span>
            <span style={{ fontSize: '16px', fontWeight: 800 }}>{c.value} <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{c.suffix}</span></span>
          </div>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="card-elevated" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="pos-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Items Sold</th>
                <th>Total</th>
                <th>Method</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Date & Time</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading sales records…</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No sales match your filters.</td></tr>
              ) : sales.map(sale => {
                const m = METHOD_COLORS[sale.paymentMethod] || METHOD_COLORS.cash;
                const sc = statusColor(sale.status);
                return (
                  <tr key={sale.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, fontFamily: 'monospace' }}>
                      #{(sale.id || '').slice(0, 8).toUpperCase()}
                    </td>
                    <td style={{ fontWeight: 600, maxWidth: '220px' }}>
                      <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {getItemLabel(sale)}
                      </span>
                    </td>
                    <td style={{ fontWeight: 800 }}>KSh {Number(sale.total || 0).toLocaleString()}</td>
                    <td>
                      <span style={{ background: m.bg, color: m.color, borderRadius: '6px', padding: '2px 10px', fontWeight: 800, fontSize: '11px' }}>{m.label}</span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{sale.customerName || '—'}</td>
                    <td>
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: '6px', padding: '2px 10px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase' }}>{sale.status}</span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {(() => { try { return new Date(sale.createdAt).toLocaleString('en-KE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } })()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button title="View" onClick={() => setViewSale(sale)} style={{ background: '#3B82F618', color: '#3B82F6', border: 'none', borderRadius: '7px', padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Eye size={14} />
                        </button>
                        <button title="Edit" onClick={() => setEditSale(sale)} style={{ background: '#10B98118', color: '#10B981', border: 'none', borderRadius: '7px', padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Pencil size={14} />
                        </button>
                        <button title="Delete" onClick={() => setDeleteSale(sale)} style={{ background: '#EF444418', color: '#EF4444', border: 'none', borderRadius: '7px', padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
              Page {page} of {totalPages} &nbsp;·&nbsp; {totalCount} records
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px', borderRadius: '8px', background: page === 1 ? 'var(--surface-hover)' : 'var(--accent)', color: page === 1 ? 'var(--text-muted)' : '#fff', border: 'none', fontWeight: 700, fontSize: '13px', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
              >
                <ChevronLeft size={16} /> Prev
              </button>

              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pg;
                if (totalPages <= 5) {
                  pg = i + 1;
                } else if (page <= 3) {
                  pg = i + 1;
                } else if (page >= totalPages - 2) {
                  pg = totalPages - 4 + i;
                } else {
                  pg = page - 2 + i;
                }
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    style={{ width: 36, height: 36, borderRadius: '8px', border: 'none', background: pg === page ? 'var(--accent)' : 'var(--surface-hover)', color: pg === page ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                  >
                    {pg}
                  </button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px', borderRadius: '8px', background: page === totalPages ? 'var(--surface-hover)' : 'var(--accent)', color: page === totalPages ? 'var(--text-muted)' : '#fff', border: 'none', fontWeight: 700, fontSize: '13px', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
