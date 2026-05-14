import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.masterContract.count();
  console.log('MasterContract count:', count);

  const articles = await prisma.masterContract.findMany();
  console.log('Articles:', JSON.stringify(articles, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
