import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const proposalId = 'ba3cf700-8f67-473a-9041-c0e1fc82c46c';
  
  // 1. Fetch the user's dynamic articles from their settings
  const articles = await prisma.masterContract.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
  });

  if (articles.length === 0) {
    console.log('---------------------------------------------------------');
    console.log('WARNING: Your Master Contract settings table is empty.');
    console.log('Please add at least one article in your Admin Settings first.');
    console.log('---------------------------------------------------------');
    return;
  }

  // 2. Attach the current dynamic articles to the proposal
  const contractSections = articles.map((s) => ({
    articleKey: s.articleKey,
    title: s.title,
    content: s.content,
    order: s.order,
  }));

  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      contractSections,
    },
  });

  console.log(`Success: Attached ${articles.length} dynamic articles to proposal ${proposalId}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
