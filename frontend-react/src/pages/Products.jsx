import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, X, Package, Tag, DollarSign, List } from 'lucide-react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';

export default function Products() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({ name: '', category: '', price: '', costPrice: '', stockQuantity: '', unit: 'pcs' });

  const socket = useSocket();

  useEffect(() => {
    fetchProducts();
    const handleDataUpdate = (data) => {
      if (data.type === 'product' || data.type === 'sale') fetchProducts();
    };

    if (socket) {
      socket.on('data-update', handleDataUpdate);
    }
    return () => socket?.off('data-update', handleDataUpdate);
  }, [socket]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/products');
      setProducts(response.data.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({ 
        name: product.name, 
        category: product.category, 
        price: product.price, 
        costPrice: product.costPrice || '',
        stockQuantity: product.stockQuantity,
        unit: product.unit || 'pcs'
      });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', category: '', price: '', costPrice: '', stockQuantity: '', unit: 'pcs' });
    }
    setIsModalOpen(true);
  };

  const [productToDelete, setProductToDelete] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, formData);
      } else {
        await api.post('/products', formData);
      }
      setIsModalOpen(false);
      fetchProducts();
    } catch (err) {
      alert(err.response?.data?.message || 'Action failed');
    }
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;
    try {
      await api.delete(`/products/${productToDelete.id}`);
      fetchProducts();
      setProductToDelete(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed');
      setProductToDelete(null);
    }
  };

  const handleDeleteClick = (product) => {
    setProductToDelete(product);
  };

  if (loading) return <div className="loading-state">Syncing Inventory...</div>;

  return (
    <div className="products">
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Inventory Management</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Monitor and manage your grocery stock levels.</p>
        </div>
        <div className="header-actions">
          <div className="search-box card-elevated" style={{ background: 'var(--surface)', border: 'none' }}>
             <Search size={18} style={{ color: 'var(--text-muted)' }} />
             <input type="text" placeholder="Search by name or category..." />
          </div>
          <button onClick={() => handleOpenModal()} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}>
            <Plus size={20} /> Add Product
          </button>
        </div>
      </header>

      <div className="card-elevated" style={{ overflow: 'hidden', padding: '0' }}>
        <table className="pos-table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Category</th>
              <th>Cost Price</th>
              <th>Selling Price</th>
              <th>Margin</th>
              <th>Stock Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan="5" className="empty-row">No active products found in the database.</td></tr>
            ) : (
              products.map(product => (
                <tr key={product.id} style={{ transition: 'var(--transition)' }}>
                  <td className="product-name" style={{ padding: '20px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                       <div style={{ width: 32, height: 32, background: 'var(--bg)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                         <Package size={16} />
                       </div>
                       {product.name}
                    </div>
                  </td>
                  <td data-label="Category" style={{ color: 'var(--text-muted)' }}>{product.category}</td>
                  <td data-label="Cost Price" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    {product.costPrice > 0 ? `KSh ${Number(product.costPrice).toLocaleString()}` : <span style={{ opacity: 0.4 }}>—</span>}
                  </td>
                  <td data-label="Selling Price" className="price" style={{ fontWeight: 800 }}>KSh {Number(product.price).toLocaleString()}</td>
                  <td data-label="Margin">
                    {product.costPrice > 0 ? (
                      (() => {
                        const margin = ((product.price - product.costPrice) / product.price) * 100;
                        const isGood = margin >= 20;
                        return (
                          <span style={{
                            background: isGood ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                            color: isGood ? 'var(--accent)' : 'var(--danger)',
                            padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700
                          }}>{margin.toFixed(1)}%</span>
                        );
                      })()
                    ) : <span style={{ opacity: 0.4, fontSize: '12px' }}>No cost set</span>}
                  </td>
                  <td data-label="Stock Status">
                    <div className="stock-badge" style={{ 
                      backgroundColor: product.stockQuantity < 10 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      color: product.stockQuantity < 10 ? 'var(--danger)' : 'var(--accent)',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700
                    }}>
                      {product.unit === 'pcs' ? Math.round(product.stockQuantity) : Number(product.stockQuantity).toFixed(2)} {product.unit || 'pcs'} left
                    </div>
                  </td>
                  <td data-label="Actions">
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleOpenModal(product)} className="glass" style={{ padding: '8px', borderRadius: '8px', color: 'var(--accent)' }}>
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDeleteClick(product)} className="glass" style={{ padding: '8px', borderRadius: '8px', color: 'var(--danger)' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay glass" style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
          <div className="card-elevated" style={{ width: '100%', maxWidth: '480px', padding: '32px', position: 'relative' }}>
            <button onClick={() => setIsModalOpen(false)} style={{ position: 'absolute', top: '24px', right: '24px', background: 'transparent', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
            <h2 style={{ marginBottom: '24px', fontSize: '24px' }}>{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
            
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '20px' }}>
              <div className="input-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Tag size={14} /> Product Name</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  required 
                  placeholder="e.g. Fresh Milk 1L"
                />
              </div>
              <div className="input-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><List size={14} /> Category</label>
                <input 
                  type="text" 
                  value={formData.category} 
                  onChange={e => setFormData({...formData, category: e.target.value})} 
                  required 
                  placeholder="e.g. Dairy"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: 'var(--surface-hover)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div className="input-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontWeight: 700 }}><DollarSign size={14} /> Cost Price (KSh)</label>
                  <input 
                    type="number" 
                    value={formData.costPrice} 
                    onChange={e => setFormData({...formData, costPrice: e.target.value})} 
                    placeholder="Your buying price"
                  />
                  {formData.costPrice && formData.price && (
                    <small style={{ color: 'var(--accent)', marginTop: '4px', display: 'block' }}>
                      Margin: {(((formData.price - formData.costPrice) / formData.price) * 100).toFixed(1)}%
                    </small>
                  )}
                </div>
                <div className="input-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontWeight: 700 }}><DollarSign size={14} /> Selling Price (KSh)</label>
                  <input 
                    type="number" 
                    value={formData.price} 
                    onChange={e => setFormData({...formData, price: e.target.value})} 
                    required 
                  />
                </div>
              </div>
              <div className="input-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontWeight: 700 }}><Package size={14} /> Stock Qty</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="number" 
                      step={formData.unit === 'pcs' ? "1" : "0.01"}
                      value={formData.stockQuantity} 
                      onChange={e => setFormData({...formData, stockQuantity: e.target.value})} 
                      required 
                      style={{ flex: 1 }}
                    />
                    <select 
                      value={formData.unit} 
                      onChange={e => setFormData({...formData, unit: e.target.value})}
                      style={{ width: 'auto', flex: '0 0 72px', padding: '0 8px', fontSize: '12px' }}
                    >
                      <option value="pcs">pcs</option>
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="l">L</option>
                      <option value="ml">ml</option>
                    </select>
                  </div>
              </div>
              <button type="submit" className="btn-primary" style={{ padding: '14px', fontSize: '16px', marginTop: '12px' }}>
                {editingProduct ? 'Update Changes' : 'Create Product'}
              </button>
            </form>
          </div>
        </div>
      )}
      {productToDelete && (
        <div className="modal-overlay glass" style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
          <div className="card-elevated" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', margin: '0 auto 20px' }}>
              <Trash2 size={32} />
            </div>
            <h2 style={{ fontSize: '20px', marginBottom: '12px' }}>Delete Product</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{productToDelete.name}</strong>? 
              <br/><br/>
              <span style={{ fontSize: '13px', opacity: 0.8 }}>
                <strong>Note:</strong> If this product has been sold before, the database will block deletion to protect your historical sales receipts. In that case, you should edit the product and set stock to 0 instead.
              </span>
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setProductToDelete(null)} 
                className="btn-secondary" 
                style={{ flex: 1, padding: '12px' }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete} 
                className="btn-primary" 
                style={{ flex: 1, padding: '12px', background: 'var(--danger)', border: 'none' }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
