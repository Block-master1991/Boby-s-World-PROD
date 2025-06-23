import Redis from 'ioredis';

// سيقرأ الرابط من متغير البيئة REDIS_URL
const redis = new Redis(process.env.REDIS_URL as string);

export default redis;