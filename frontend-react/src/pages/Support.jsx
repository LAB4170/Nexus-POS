import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  Plus, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  LifeBuoy
} from 'lucide-react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';

export default function Support() {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewTicket, setShowNewTicket] = useState(false);
  
  // New Ticket Form
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Reply Form
  const [reply, setReply] = useState('');
  
  const socket = useSocket();

  useEffect(() => {
    fetchTickets();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleDataUpdate = (d) => {
      if (d.type === 'support') {
        fetchTickets();
        if (selectedTicket) {
          // Check if this update relates to the currently open ticket
          const ticketIdToRefresh = d.data?.ticketId || selectedTicket.id;
          if (ticketIdToRefresh === selectedTicket.id) {
             fetchTicketDetail({ id: selectedTicket.id });
          }
        }
      }
    };
    socket.on('data-update', handleDataUpdate);
    return () => socket.off('data-update', handleDataUpdate);
  }, [socket, selectedTicket]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await api.get('/support/tickets');
      setTickets(res.data.data);
    } catch (err) {
      console.error("Failed to fetch tickets", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTicketDetail = async (ticket) => {
    try {
      const res = await api.get(`/support/tickets/${ticket.id}`);
      setSelectedTicket(res.data.data.ticket);
      setMessages(res.data.data.messages);
      setShowNewTicket(false);
    } catch (err) {
      console.error("Failed to fetch ticket detail", err);
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!subject || !message) return;

    try {
      setSending(true);
      const res = await api.post('/support/tickets', { subject, message });
      setTickets([res.data.data, ...tickets]);
      setShowNewTicket(false);
      setSubject('');
      setMessage('');
      fetchTicketDetail(res.data.data);
    } catch (err) {
      alert("Failed to create ticket");
    } finally {
      setSending(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim() || !selectedTicket) return;

    try {
      const res = await api.post(`/support/tickets/${selectedTicket.id}/messages`, { content: reply });
      setMessages([...messages, res.data.data]);
      setReply('');
    } catch (err) {
      alert("Failed to send message");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'open': return <span className="badge status-at_risk">OPEN</span>;
      case 'in_progress': return <span className="badge status-healthy" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>IN PROGRESS</span>;
      case 'resolved': return <span className="badge status-healthy">RESOLVED</span>;
      case 'closed': return <span className="badge status-dormant">CLOSED</span>;
      default: return null;
    }
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <LifeBuoy size={28} color="var(--accent)" /> Support Center
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '14px' }}>Need help? Our engineers are ready to assist you.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNewTicket(true)}>
          <Plus size={18} /> New Ticket
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px', height: 'calc(100vh - 250px)' }}>
        {/* Tickets List */}
        <div className="card-premium" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
            Active Discussions
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}><Clock className="animate-spin" /></div>
            ) : tickets.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <HelpCircle size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <p>No support history yet.</p>
              </div>
            ) : (
              tickets.map(ticket => (
                <div 
                  key={ticket.id} 
                  className={`ticket-item ${selectedTicket?.id === ticket.id ? 'active' : ''}`}
                  onClick={() => fetchTicketDetail(ticket)}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: selectedTicket?.id === ticket.id ? 'rgba(16, 185, 129, 0.05)' : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    {getStatusBadge(ticket.status)}
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(ticket.updated_at).toLocaleDateString()}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>{ticket.subject}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Priority: {ticket.priority.toUpperCase()}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="card-premium" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {showNewTicket ? (
            <div style={{ padding: '32px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '24px' }}>Create New Support Ticket</h2>
              <form onSubmit={handleCreateTicket}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 700 }}>Subject</label>
                  <input 
                    className="glass" 
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                    placeholder="Briefly describe your issue..."
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  />
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 700 }}>Message</label>
                  <textarea 
                    className="glass" 
                    style={{ width: '100%', height: '150px', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', resize: 'none' }}
                    placeholder="Tell us more about what's happening..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="submit" className="btn-primary" disabled={sending} style={{ flex: 1 }}>
                    {sending ? 'Submitting...' : 'Submit Ticket'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setShowNewTicket(false)} style={{ flex: 1 }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : selectedTicket ? (
            <>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>{selectedTicket.subject}</h3>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ticket ID: {selectedTicket.id}</div>
                </div>
                {getStatusBadge(selectedTicket.status)}
              </div>
              
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg)' }}>
                {messages.map(msg => (
                  <div 
                    key={msg.id} 
                    style={{ 
                      alignSelf: msg.sender_role === 'merchant' ? 'flex-end' : 'flex-start',
                      maxWidth: '80%',
                      padding: '12px 16px',
                      borderRadius: msg.sender_role === 'merchant' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                      background: msg.sender_role === 'merchant' ? 'var(--accent)' : 'var(--surface)',
                      color: msg.sender_role === 'merchant' ? '#fff' : 'var(--text)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                      border: msg.sender_role === 'merchant' ? 'none' : '1px solid var(--border)'
                    }}
                  >
                    <div style={{ fontSize: '13px', lineHeight: '1.5' }}>{msg.content}</div>
                    <div style={{ fontSize: '9px', marginTop: '4px', textAlign: 'right', opacity: 0.7 }}>
                      {msg.sender_role === 'admin' ? 'Nexus Support' : 'You'} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '12px' }}>
                  <input 
                    className="glass" 
                    style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                    placeholder="Type your response..."
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <button type="submit" className="btn-primary" style={{ padding: '0 20px', borderRadius: '12px' }}>
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <MessageSquare size={64} style={{ opacity: 0.1, marginBottom: '24px' }} />
              <p>Select a ticket to view conversation</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .ticket-item:hover {
          background: rgba(16, 185, 129, 0.02);
        }
        .badge {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 9px;
          font-weight: 800;
        }
        .status-at_risk { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .status-healthy { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .status-dormant { background: rgba(100, 116, 139, 0.1); color: #64748b; }
      `}</style>
    </div>
  );
}
