require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const url = process.env.DATABASE_URL;
console.log('DATABASE_URL present:', !!url);
if (url) {
  // Print without the password.
  console.log('target:', url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@').slice(0, 120));
}

(async () => {
  const prisma = new PrismaClient();
  const started = Date.now();
  try {
    await prisma.$connect();
    const rows = await prisma.$queryRaw`SELECT 1 as ok`;
    console.log(`CONNECT OK in ${Date.now() - started}ms`, rows);
  } catch (err) {
    console.log(`FAILED after ${Date.now() - started}ms`);
    console.log('  errorCode:', err.errorCode);
    console.log('  message  :', String(err.message).split('\n').filter(Boolean).slice(0, 4).join(' | '));
  } finally {
    await prisma.$disconnect();
  }
})();
