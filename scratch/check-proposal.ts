import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const proposalId = 'ba3cf700-8f67-473a-9041-c0e1fc82c46c';
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      proposalNumber: true,
      contractSections: true,
      status: true,
    },
  });

  console.log('Proposal:', JSON.stringify(proposal, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
