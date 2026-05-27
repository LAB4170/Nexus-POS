import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, DollarSign, MessageSquare, X } from 'lucide-react';
import './AdminNotifications.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const SOCKET_URL = API_BASE.startsWith('http') ? API_BASE.replace('/api', '') : window.location.origin;

export default function AdminNotifications() {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!currentUser) return;

    let socket;

    const connectSocket = async () => {
      const token = await currentUser.getIdToken();
      socket = io(`${SOCKET_URL}/admin`, {
        auth: { token },
        transports: ['websocket', 'polling']
      });

      socket.on('adminAlert', (alert) => {
        const id = Date.now() + Math.random();
        setNotifications(prev => [...prev, { id, ...alert }]);
        
        // Auto dismiss after 5s
        setTimeout(() => {
          removeNotification(id);
        }, 5000);
      });
    };

    connectSocket();

    return () => {
      if (socket) socket.disconnect();
    };
  }, [currentUser]);

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getIcon = (type) => {
    switch (type) {
      case 'newTicket': return <MessageSquare size={18} color="#3b82f6" />;
      case 'highValueSale': return <DollarSign size={18} color="#10b981" />;
      case 'businessStatusChange': return <AlertCircle size={18} color="#f59e0b" />;
      default: return <AlertCircle size={18} color="#8b5cf6" />;
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="admin-notifications-container">
      {notifications.map(notif => (
        <div key={notif.id} className="admin-notification-toast">
          <div className="toast-icon">
            {getIcon(notif.type)}
          </div>
          <div className="toast-content">
            <h4 className="toast-title">{notif.type === 'newTicket' ? 'New Support Ticket' : notif.type === 'highValueSale' ? 'High Value Sale' : 'System Alert'}</h4>
            <p className="toast-message">{notif.data?.message || JSON.stringify(notif.data)}</p>
          </div>
          <button className="toast-close" onClick={() => removeNotification(notif.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
