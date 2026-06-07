const { createClient } = require('redis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const redisUrl = process.env.REDIS_URL;

let client = null;
let pubClient = null;
let subClient = null;
let isRedisEnabled = false;

if (redisUrl) {
  console.log('🌐 Redis URL detected, enabling distributed caching...');
  client = createClient({ url: redisUrl });
  pubClient = createClient({ url: redisUrl });
  subClient = pubClient.duplicate();

  client.on('error', (err) => console.warn('⚠️ Redis Client Error (Fallback to Memory):', err.message));
  pubClient.on('error', (err) => console.warn('⚠️ Redis Pub Client Error:', err.message));
  subClient.on('error', (err) => console.warn('⚠️ Redis Sub Client Error:', err.message));
  
  isRedisEnabled = true;
} else {
  console.log('ℹ️ No Redis URL found. Using In-Memory Caching (Development Fallback).');
}

const initRedis = async () => {
  if (!isRedisEnabled) return;
  try {
    await Promise.all([
      client.connect(),
      pubClient.connect(),
      subClient.connect()
    ]);
    console.log('✅ Redis Cluster Connected — Distributed Caching Active');
  } catch (err) {
    console.warn('⚠️ Redis Connection Failed. System will use local memory fallback.');
    isRedisEnabled = false;
  }
};

module.exports = {
  client,
  pubClient,
  subClient,
  initRedis,
  isRedisEnabled
};

