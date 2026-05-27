const { admin } = require('./config/firebase');

let adminIo = null;

const initAdminSocket = (io) => {
  adminIo = io.of('/admin');

  // Middleware to authenticate admin socket connections
  adminIo.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }
      
      const decodedToken = await admin.auth().verifyIdToken(token);
      if (decodedToken.role !== 'admin') {
        return next(new Error('Authentication error: Not an admin'));
      }
      
      socket.adminUid = decodedToken.uid;
      socket.adminEmail = decodedToken.email;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  adminIo.on('connection', (socket) => {
    console.log(`[Admin Socket] Admin connected: ${socket.adminEmail}`);
    socket.on('disconnect', () => {
      console.log(`[Admin Socket] Admin disconnected: ${socket.adminEmail}`);
    });
  });
};

const emitAdminAlert = (eventType, data) => {
  if (adminIo) {
    adminIo.emit('adminAlert', { type: eventType, data, timestamp: new Date() });
  }
};

module.exports = { initAdminSocket, emitAdminAlert };
