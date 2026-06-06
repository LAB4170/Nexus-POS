import { useState, useEffect, useRef } from 'react';
import {
  ShoppingCart, Search, Plus, Minus, Trash2,
  CreditCard, Wallet, User, Phone,
  CheckCircle, AlertCircle, CloudOff, Cloud, X
} from 'lucide-react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { getProductsLocal, saveProductsLocal, queueSaleOffline } from '../utils/db';

const fmt = v => Number(v || 0).toLocaleString('en-KE');

export default function Sales() {
  const [products, setProducts]           = useState([]);
  const [searchTerm, setSearchTerm]       = useState('');
  const [cart, setCart]                   = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customer, setCustomer]           = useState({ name: '', phone: '' });
  const [isProcessing, setIsProcessing]   = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError]                 = useState('');
  const [isOnline, setIsOnline]           = useState(navigator.onLine);
  const [showModal, setShowModal]         = useState(false);

  const socket = useSocket();
  const searchRef = useRef(null);

  // ── Init ──
  useEffect(() => {
    let alive = true;
    const load = () => { if (alive) fetchProducts(); };
    load();

    const handleDataUpdate = d => { if (d.type === 'product') load(); };
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    if (socket) socket.on('data-update', handleDataUpdate);

    return () => {
      alive = false;
      if (socket) socket.off('data-update', handleDataUpdate);
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [socket]);

  // Focus search when modal opens
  useEffect(() => {
    if (showModal) setTimeout(() => searchRef.current?.focus(), 80);
    else setSearchTerm('');
  }, [showModal]);

  // ── Barcode scanner (global keypress) ──
  useEffect(() => {
    let buf = '', t0 = Date.now();
    const handler = e => {
      // Ignore if user is typing in a normal input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const now = Date.now();
      if (now - t0 > 50) buf = '';
      t0 = now;
      if (e.key === 'Enter') {
        if (buf.length > 3) {
          const hit = products.find(p => p.id === buf || p.sku === buf);
          if (hit) { addToCart(hit); setSuccessMessage(`Scanned: ${hit.name}`); setTimeout(() => setSuccessMessage(''), 2000); }
        }
        buf = '';
      } else if (e.key !== 'Shift') {
        buf += e.key;
      }
    };
    window.addEventListener('keypress', handler);
    return () => window.removeEventListener('keypress', handler);
  }, [products]);

  // ── Fetch ──
  const fetchProducts = async () => {
    try {
      if (navigator.onLine) {
        const { data } = await api.get('/products');
        const items = (data.data || []).filter(p => p.stockQuantity > 0);
        setProducts(items);
        saveProductsLocal(items);
      } else {
        setProducts(await getProductsLocal());
      }
    } catch {
      setProducts(await getProductsLocal());
    }
  };

  // ── Cart helpers ──
  const filteredProducts = products.filter(p => {
    const s = searchTerm.toLowerCase();
    return (p.name?.toLowerCase().includes(s)) || (p.category?.toLowerCase().includes(s)) || (p.sku?.toLowerCase().includes(s));
  });

  const addToCart = product => {
    setCart(prev => {
      const exists = prev.find(i => i.id === product.id);
      if (exists) {
        if (exists.quantity >= product.stockQuantity) { alert('Cannot exceed available stock'); return prev; }
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const setQuantity = (id, raw) => {
    setCart(prev => prev.map(item => {
      if (item.id !== id) return item;
      let val = parseFloat(raw);
      if (isNaN(val)) return item;
      if (item.unit === 'pcs') val = Math.round(val);
      const stock = products.find(p => p.id === id)?.stockQuantity ?? Infinity;
      val = Math.min(Math.max(val, 0), stock);
      return { ...item, quantity: val };
    }));
  };

  const removeFromCart = id => setCart(prev => prev.filter(i => i.id !== id));
  const clearCart = () => { setCart([]); setCustomer({ name: '', phone: '' }); };
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  // ── Checkout ──
  const handleCheckout = async () => {
    if (!cart.length) return;
    if (paymentMethod === 'debt' && (!customer.name || !customer.phone)) {
      setError('Customer name and phone are required for debt sales.');
      return;
    }
    setIsProcessing(true);
    setError('');

    const payload = {
      items: cart.map(i => ({
        productId: i.id,
        productName: i.name,
        quantity: i.quantity,
        unitPrice: i.price,
        total: i.price * i.quantity,
      })),
      paymentMethod,
      customerName: customer.name || null,
      customerPhone: customer.phone || null,
      status: 'completed',
      createdAt: new Date().toISOString(),
    };

    try {
      if (isOnline) {
        await api.post('/sales', payload);
        setSuccessMessage('✅ Sale completed successfully!');
        fetchProducts();
      } else {
        await queueSaleOffline(payload);
        setSuccessMessage('📴 Offline: Sale saved and will sync when online.');
      }
      clearCart();
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      if (!isOnline || err.code === 'ERR_NETWORK') {
        await queueSaleOffline(payload);
        setSuccessMessage('Network error. Sale saved to local outbox.');
        clearCart();
      } else {
        setError(err.response?.data?.message || 'Transaction failed. Check stock levels.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>

      {/* ── Page Header ── */}
      <header className="page-header" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShoppingCart size={24} style={{ color: 'var(--accent)' }} />
              New Sale
            </h1>
            <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 14 }}>
              Add items to the cart, choose payment, complete sale.
            </p>
          </div>
          {!isOnline ? (
            <span style={{ fontSize: '11px', background: 'var(--danger)', color: '#fff', padding: '4px 12px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <CloudOff size={12} /> OFFLINE
            </span>
          ) : (
            <span style={{ fontSize: '11px', background: 'var(--accent)18', color: 'var(--accent)', padding: '4px 12px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <Cloud size={12} /> SYNCED
            </span>
          )}
        </div>
      </header>

      {/* ── Register Card ── */}
      <div className="card-elevated" style={{ borderRadius: 20, overflow: 'hidden' }}>

        {/* Add Item Button */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <button
            className="btn-primary"
            onClick={() => setShowModal(true)}
            style={{ width: '100%', padding: '16px', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 12 }}
          >
            <Plus size={22} /> Add Item to Cart
          </button>
        </div>

        {/* Cart Area */}
        <div style={{ minHeight: 200, maxHeight: 340, overflowY: 'auto', padding: cart.length ? '12px 16px' : 0 }}>
          {cart.length === 0 ? (
            <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <ShoppingCart size={48} style={{ opacity: 0.15, marginBottom: 14 }} />
              <p style={{ fontWeight: 600 }}>Cart is empty</p>
              <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>Click "Add Item" or scan a barcode</p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cart.map(item => (
                <li key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: 'var(--surface)', borderRadius: 12,
                  border: '1px solid var(--border)', padding: '14px 16px'
                }}>
                  {/* Name + price/unit */}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{item.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>KSh {fmt(item.price)} / {item.unit || 'pcs'}</p>
                  </div>

                  {/* Qty stepper */}
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <button onClick={() => setQuantity(item.id, item.quantity - 1)}
                      style={{ padding: '8px 11px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}>
                      <Minus size={13} />
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => setQuantity(item.id, e.target.value)}
                      style={{ width: 44, textAlign: 'center', border: 'none', background: 'transparent', fontSize: 15, fontWeight: 700, color: 'var(--text)', outline: 'none', MozAppearance: 'textfield' }}
                    />
                    <button onClick={() => setQuantity(item.id, item.quantity + 1)}
                      style={{ padding: '8px 11px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}>
                      <Plus size={13} />
                    </button>
                  </div>

                  {/* Line total */}
                  <div style={{ width: 88, textAlign: 'right', fontWeight: 800, fontSize: 15 }}>
                    KSh {fmt(item.price * item.quantity)}
                  </div>

                  {/* Remove */}
                  <button onClick={() => removeFromCart(item.id)}
                    style={{ padding: 8, background: '#EF444415', color: '#EF4444', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex' }}>
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Checkout Panel ── */}
        <div style={{ padding: '24px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>

          {/* Payment method */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { id: 'cash',  icon: Wallet,     label: 'Cash' },
              { id: 'mpesa', icon: CreditCard, label: 'M-Pesa' },
              { id: 'debt',  icon: User,       label: 'Debt' },
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setPaymentMethod(id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 10px',
                  borderRadius: 12, cursor: 'pointer', fontWeight: 700, transition: 'var(--transition)',
                  background: paymentMethod === id ? 'var(--accent)' : 'var(--surface)',
                  color:      paymentMethod === id ? '#fff' : 'var(--text)',
                  border:     `1.5px solid ${paymentMethod === id ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
          </div>

          {/* Debt customer fields */}
          {paymentMethod === 'debt' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div style={{ position: 'relative' }}>
                <User size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text" placeholder="Customer Name *"
                  value={customer.name} onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))}
                  style={{ width: '100%', padding: '11px 12px 11px 36px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                />
              </div>
              <div style={{ position: 'relative' }}>
                <Phone size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="tel" placeholder="Phone Number *"
                  value={customer.phone} onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))}
                  style={{ width: '100%', padding: '11px 12px 11px 36px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                />
              </div>
            </div>
          )}

          {/* Feedback banner */}
          {(error || successMessage) && (
            <div style={{
              padding: '12px 16px', borderRadius: 10, marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14,
              background: error ? '#EF444415' : '#10B98115',
              color:      error ? 'var(--danger)' : '#10B981'
            }}>
              {error ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
              {error || successMessage}
            </div>
          )}

          {/* Grand Total + Complete button */}
          <button
            className="btn-primary"
            onClick={handleCheckout}
            disabled={isProcessing || cart.length === 0}
            style={{
              width: '100%', padding: '20px 24px', fontSize: 20, fontWeight: 800, borderRadius: 14,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: cart.length === 0 ? 'var(--surface-hover)' : 'var(--accent)',
              color:      cart.length === 0 ? 'var(--text-muted)' : '#fff',
              border: 'none', cursor: cart.length === 0 || isProcessing ? 'not-allowed' : 'pointer',
            }}
          >
            <span>{isProcessing ? 'Processing…' : 'Complete Sale'}</span>
            <span>KSh {fmt(total)}</span>
          </button>

          {cart.length > 0 && (
            <button
              onClick={clearCart}
              style={{ width: '100%', marginTop: 10, padding: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Clear Cart
            </button>
          )}
        </div>
      </div>

      {/* ── Product Selection Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="card-elevated" style={{ width: '100%', maxWidth: 820, height: '82vh', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: 20, overflow: 'hidden' }}>

            {/* Modal header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
                <Search size={20} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search by name, category or SKU…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: 'var(--text)', fontWeight: 600 }}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                    <X size={16} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text)' }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Product grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: 'var(--bg)' }}>
              {filteredProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                  <Search size={40} style={{ opacity: 0.15, margin: '0 auto 12px', display: 'block' }} />
                  <p style={{ fontWeight: 600 }}>{searchTerm ? 'No products match your search.' : 'No products in inventory.'}</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
                  {filteredProducts.map(p => {
                    const inCart = cart.find(c => c.id === p.id);
                    const lowStock = p.stockQuantity < 5;
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: 18, borderRadius: 14, transition: 'transform .1s, box-shadow .1s',
                          background: inCart ? 'var(--accent)10' : 'var(--surface)',
                          border: `1.5px solid ${inCart ? 'var(--accent)' : 'var(--border)'}`,
                          display: 'flex', flexDirection: 'column'
                        }}
                      >
                        <h4 style={{ fontSize: 15, fontWeight: 800, marginBottom: 3, color: 'var(--text)' }}>{p.name}</h4>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>{p.category}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 10, paddingBottom: 14 }}>
                          <span style={{ fontWeight: 800, fontSize: 15 }}>KSh {fmt(p.price)}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: lowStock ? 'var(--danger)' : 'var(--text-muted)' }}>
                            {p.stockQuantity} {p.unit || 'pcs'}
                          </span>
                        </div>
                        
                        <div style={{ marginTop: 'auto' }}>
                          {!inCart ? (
                            <button onClick={() => addToCart(p)} style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <Plus size={16} /> Add to Cart
                            </button>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--accent)' }}>
                              <button onClick={() => { if (inCart.quantity <= 1) removeFromCart(p.id); else setQuantity(p.id, inCart.quantity - 1); }}
                                style={{ flex: 1, padding: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}>
                                <Minus size={14} />
                              </button>
                              <input
                                type="number"
                                value={inCart.quantity}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === '' || val === '0') removeFromCart(p.id);
                                  else setQuantity(p.id, val);
                                }}
                                style={{ width: 50, textAlign: 'center', border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: 'var(--text)', outline: 'none' }}
                              />
                              <button onClick={() => setQuantity(p.id, inCart.quantity + 1)}
                                style={{ flex: 1, padding: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}>
                                <Plus size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                {cart.length} unique item{cart.length !== 1 ? 's' : ''} in cart &nbsp;·&nbsp; Total: <strong style={{ color: 'var(--text)' }}>KSh {fmt(total)}</strong>
              </span>
              <button className="btn-primary" onClick={() => setShowModal(false)} style={{ padding: '10px 26px', borderRadius: 10 }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
