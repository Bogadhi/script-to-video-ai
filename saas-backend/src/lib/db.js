const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
});

console.log("DB CONNECTED SQLITE");

module.exports = prisma;

