import mongoose from '../lib/mongoose.js';
import { env } from './env.js';

export async function connectDB(uri = env.MONGODB_URI) {
  mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.info('[db] MongoDB reconnected'));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.info(`[db] Connected to MongoDB (${mongoose.connection.name})`);
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
