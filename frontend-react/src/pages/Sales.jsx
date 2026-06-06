import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Search, Plus, Minus, Trash2, CreditCard, Wallet, User, Phone, CheckCircle, AlertCircle, CloudOff, Cloud, Clock, X, ChevronRight } from 'lucide-react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { getProductsLocal, saveProductsLocal, queueSaleOffline } from '../utils/db';

export default function Sales() {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customer, setCustomer] = useState({ name: '', phone: '' });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showProductModal, setShowProductModal] = useState(false);
  const [recentSales, setRecentSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(true);

  const socket = useSocket();
  const searchInputRef = useRef(null);

  // ── INIT & SOCKETS ──
  useEffect(() => {
    let isMounted = true;
    
    const fetchWrapper = () => {
      if (isMounted) fetchProducts();
    };

    const fetchSalesWrapper = () => {
      if (isMounted) fetchRecentSales();
    };

    fetchWrapper();
    fetchSalesWrapper();

    const handleDataUpdate = (data) => {
      if (data.type === 'product') fetchWrapper();
      if (data.type === 'sale') fetchSalesWrapper(); // Refresh ledger on new sale
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (socket) {
      socket.on('data-update', handleDataUpdate);
      socket.on('data-refresh', handleDataUpdate);
    }
    
    return () => {
      isMounted = false;
      if (socket) {
        socket.off('data-update', handleDataUpdate);
        socket.off('data-refresh', handleDataUpdate);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [socket]);

  // ── BARCODE SCANNER GLOBAL LISTENER ──
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyPress = (e) => {
      const now = Date.now();
      if (now - lastKeyTime > 50) {
        barcodeBuffer = ''; // Reset if slow typing (human)
      }
      lastKeyTime = now;

      // Ignore if typing inside an input field unless we want to intercept, 
      // but usually barcode scanners fire so fast the time-gap catches it.
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 3) {
           const match = products.find(p => p.id === barcodeBuffer || p.sku === barcodeBuffer);
           if (match) {
             addToCart(match);
             // Provide small haptic feedback or sound if possible
             setSuccessMessage(`Scanned: ${match.name}`);
             setTimeout(() => setSuccessMessage(''), 2000);
           }
        }
        barcodeBuffer = '';
      } else if (e.key !== 'Shift') {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [products, cart]);

  // Focus search input automatically when modal opens
  useEffect(() => {
    if (showProductModal && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showProductModal]);


  // ── DATA FETCHING ──
  const fetchProducts = async () => {
    try {
      if (navigator.onLine) {
        const { data } = await api.get('/products');
        const items = data.data.filter(p => p.stockQuantity > 0) || [];
        setProducts(items);
        saveProductsLocal(items);
      } else {
        const localItems = await getProductsLocal();
        setProducts(localItems);
      }
    } catch (err) {
      console.error('Failed to fetch products', err);
      const localItems = await getProductsLocal();
      setProducts(localItems);
    }
  };

  const fetchRecentSales = async () => {
    try {
      setLoadingSales(true);
      // Fetch today's sales
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const query = `?date_from=${today.toISOString()}&sortBy=created_at&sortDir=desc`;
      const { data } = await api.get(`/sales${query}`);
      setRecentSales(data.data || []);
    } catch (err) {
      console.error('Failed to fetch recent sales', err);
    } finally {
      setLoadingSales(false);
    }
  };


  // ── LOGIC ──
  const filteredProducts = products.filter(p => {
    const s = searchTerm.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(s)) || 
      (p.category && p.category.toLowerCase().includes(s)) ||
      (p.sku && p.sku.toLowerCase().includes(s))
    );
  });

  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.quantity >= product.stockQuantity) {
        alert('Cannot add more than available stock');
        return;
      }
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const setQuantity = (id, newQty) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        let val = parseFloat(newQty);
        if (isNaN(val)) return item;
        
        if (item.unit === 'pcs') val = Math.round(val);

        const product = products.find(p => p.id === id);
        if (val > product.stockQuantity) val = product.stockQuantity;
        
        return val >= 0 ? { ...item, quantity: val } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (id) => setCart(cart.filter(item => item.id !== id));
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === 'debt' && (!customer.name || !customer.phone)) {
      setError('Customer name and phone are required for debt sales.');
      return;
    }

    setIsProcessing(true);
    setError('');

    const payload = {
      items: cart.map(item => ({
        productId: item.id,
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        total: item.price * item.quantity
      })),
      paymentMethod: paymentMethod,
      customerName: customer.name || null,
      customerPhone: customer.phone || null,
      status: 'completed',
      createdAt: new Date().toISOString()
    };

    try {
      if (isOnline) {
        await api.post('/sales', payload);
        setSuccessMessage('Sale completed successfully!');
        fetchProducts();
        fetchRecentSales();
      } else {
        await queueSaleOffline(payload);
        setSuccessMessage('Offline: Sale saved locally and will sync when online.');
      }
      
      setCart([]);
      setCustomer({ name: '', phone: '' });
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      if (!isOnline || err.code === 'ERR_NETWORK') {
         await queueSaleOffline(payload);
         setSuccessMessage('Network error: Sale saved to local outbox.');
         setCart([]);
      } else {
         setError(err.response?.data?.message || 'Transaction failed. Please check stock levels.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (isoString) => {
    try {
      return new Date(isoString).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  };


  return (
    <div className="sales-terminal" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', height: 'calc(100vh - 120px)' }}>
      
      {/* ── LEFT COLUMN: ACTIVE REGISTER ── */}
      <section className="card-elevated" style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)', padding: '0', overflow: 'hidden' }}>
        
        {/* Register Header */}
        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShoppingCart size={22} style={{ color: 'var(--accent)' }} /> Active Register
            </h2>
            {!isOnline ? (
               <span style={{ fontSize: '11px', background: 'var(--danger)', color: 'white', padding: '4px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                 <CloudOff size={12} /> OFFLINE
               </span>
             ) : (
               <span style={{ fontSize: '11px', background: 'var(--accent)18', color: 'var(--accent)', padding: '4px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                 <Cloud size={12} /> SYNCED
               </span>
             )}
          </div>
          
          <button 
            className="btn-primary" 
            onClick={() => setShowProductModal(true)}
            style={{ width: '100%', padding: '14px', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Plus size={20} /> Add Item to Cart
          </button>
        </div>

        {/* Cart Items Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
          {cart.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <ShoppingCart size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
              <p style={{ fontWeight: 600 }}>Cart is empty</p>
              <p style={{ fontSize: '13px', opacity: 0.7, marginTop: '4px' }}>Click 'Add Item' or scan a barcode</p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: '12px 0' }}>
              {cart.map(item => (
                <li key={item.id} className="glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', marginBottom: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>{item.name}</h4>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>KSh {item.price} / {item.unit || 'pcs'}</span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                      <button onClick={() => setQuantity(item.id, item.quantity - 1)} style={{ padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}><Minus size={14}/></button>
                      <input 
                        type="number" 
                        value={item.quantity} 
                        onChange={(e) => setQuantity(item.id, e.target.value)}
                        style={{ width: '50px', textAlign: 'center', border: 'none', background: 'transparent', fontSize: '15px', fontWeight: 700, color: 'var(--text)', outline: 'none', appearance: 'textfield' }}
                      />
                      <button onClick={() => setQuantity(item.id, item.quantity + 1)} style={{ padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}><Plus size={14}/></button>
                    </div>
                    
                    <div style={{ width: '80px', textAlign: 'right', fontWeight: 800, fontSize: '16px' }}>
                      KSh {(item.price * item.quantity).toLocaleString()}
                    </div>
                    
                    <button onClick={() => removeFromCart(item.id)} style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Checkout Panel */}
        <div style={{ background: 'var(--bg)', padding: '24px', borderTop: '1px solid var(--border)' }}>
          {/* Payment Method Selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: paymentMethod === 'debt' ? '16px' : '24px' }}>
            {[
              { id: 'cash', icon: Wallet, label: 'Cash' },
              { id: 'mpesa', icon: CreditCard, label: 'M-Pesa' },
              { id: 'debt', icon: User, label: 'Debt' }
            ].map(method => (
              <button
                key={method.id}
                onClick={() => setPaymentMethod(method.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px', borderRadius: '12px',
                  background: paymentMethod === method.id ? 'var(--accent)' : 'var(--surface)',
                  color: paymentMethod === method.id ? '#fff' : 'var(--text)',
                  border: `1px solid ${paymentMethod === method.id ? 'var(--accent)' : 'var(--border)'}`,
                  cursor: 'pointer', fontWeight: 700, transition: 'var(--transition)'
                }}
              >
                <method.icon size={20} />
                {method.label}
              </button>
            ))}
          </div>

          {paymentMethod === 'debt' && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="text" placeholder="Customer Name *" value={customer.name} onChange={(e) => setCustomer({...customer, name: e.target.value})}
                  style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                />
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <Phone size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="tel" placeholder="Phone Number *" value={customer.phone} onChange={(e) => setCustomer({...customer, phone: e.target.value})}
                  style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                />
              </div>
            </div>
          )}

          {(error || successMessage) && (
            <div style={{ padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px',
              background: error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              color: error ? 'var(--danger)' : '#10B981'
            }}>
              {error ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
              {error || successMessage}
            </div>
          )}

          <button 
            className="btn-primary"
            onClick={handleCheckout}
            disabled={isProcessing || cart.length === 0}
            style={{ 
              width: '100%', padding: '20px', fontSize: '20px', fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: cart.length === 0 ? 'var(--surface-hover)' : 'var(--accent)',
              color: cart.length === 0 ? 'var(--text-muted)' : '#fff',
              border: 'none'
            }}
          >
            <span>{isProcessing ? 'Processing...' : 'Complete Sale'}</span>
            <span>KSh {total.toLocaleString()}</span>
          </button>
        </div>
      </section>

      {/* ── RIGHT COLUMN: LIVE LEDGER ── */}
      <section className="card-elevated" style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg)', padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={20} style={{ color: 'var(--text-muted)' }} /> Today's Transactions
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Real-time feed of completed sales</p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loadingSales ? (
             <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading ledger...</div>
          ) : recentSales.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No transactions today.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recentSales.map(sale => {
                 let itemDesc = 'Unknown';
                 if (sale.items && sale.items.length > 0) {
                   itemDesc = sale.items.map(it => `${it.product_name || it.productName} (x${it.quantity})`).join(', ');
                 } else if (sale.productName || sale.product_name) {
                   itemDesc = `${sale.productName || sale.product_name} (x${sale.quantity || 1})`;
                 }

                 const mColor = sale.paymentMethod === 'mpesa' ? '#3B82F6' : sale.paymentMethod === 'debt' ? '#F59E0B' : '#10B981';

                 return (
                   <div key={sale.id} className="glass" style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--surface)' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                       <div>
                         <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                           {formatTime(sale.createdAt || sale.created_at)}
                         </span>
                         <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>
                           {itemDesc}
                         </span>
                       </div>
                       <div style={{ textAlign: 'right' }}>
                         <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', display: 'block' }}>
                           KSh {Number(sale.total || 0).toLocaleString()}
                         </span>
                         <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: mColor, background: `${mColor}15`, padding: '2px 6px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>
                           {sale.paymentMethod || sale.payment_method}
                         </span>
                       </div>
                     </div>
                   </div>
                 );
              })}
            </div>
          )}
        </div>
        
        {/* Quick link to full history */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)', textAlign: 'center' }}>
          <a href="/app/sales/history" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            View Complete Sales History <ChevronRight size={14} />
          </a>
        </div>
      </section>

      {/* ── PRODUCT SELECTION MODAL ── */}
      {showProductModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="card-elevated" style={{ width: '100%', maxWidth: '800px', height: '80vh', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: '20px', overflow: 'hidden' }}>
            
            {/* Modal Header & Search */}
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div className="search-box" style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px' }}>
                <Search size={20} style={{ color: 'var(--text-muted)' }} />
                <input 
                  ref={searchInputRef}
                  type="text" 
                  placeholder="Search products to add..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: '16px', color: 'var(--text)', fontWeight: 600 }}
                />
              </div>
              <button 
                onClick={() => setShowProductModal(false)}
                style={{ width: 48, height: 48, borderRadius: '12px', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text)' }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Product Grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--bg)' }}>
              {filteredProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                  <Search size={48} style={{ opacity: 0.2, marginBottom: '16px', margin: '0 auto' }} />
                  <p style={{ fontWeight: 600, fontSize: '16px' }}>No products found</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                  {filteredProducts.map(p => {
                    const isLowStock = p.stockQuantity < 5;
                    return (
                      <div 
                        key={p.id} 
                        className="glass product-selection-card" 
                        onClick={() => {
                          addToCart(p);
                          // Optional: Auto-close after adding, or keep open. Keeping open is faster for multiple items.
                        }}
                        style={{ padding: '20px', borderRadius: '16px', cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border)', transition: 'transform 0.1s' }}
                      >
                        <div style={{ width: 40, height: 40, background: 'var(--accent)15', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', color: 'var(--accent)' }}>
                          <Plus size={20} />
                        </div>
                        <h4 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '4px', color: 'var(--text)' }}>{p.name}</h4>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>{p.category}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                          <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text)' }}>KSh {p.price}</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: isLowStock ? 'var(--danger)' : 'var(--text-muted)' }}>
                            {p.stockQuantity} {p.unit || 'pcs'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>
                {cart.length} unique items in cart
              </span>
              <button 
                className="btn-primary" 
                onClick={() => setShowProductModal(false)}
                style={{ padding: '10px 24px' }}
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
