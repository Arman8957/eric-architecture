
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Project Requests ---');
  const prs = await prisma.projectRequest.findMany({
    select: { id: true, projectName: true, status: true, assignedManagerId: true, isArchived: true }
  });
  console.dir(prs, { depth: null });

  console.log('\n--- Project Stages ---');
  const stages = await prisma.projectStage.findMany({
    select: { id: true, name: true, status: true, proposalId: true, projectRequestId: true, assignedToId: true }
  });
  console.dir(stages, { depth: null });

  console.log('\n--- Proposals ---');
  const proposals = await prisma.proposal.findMany({
    select: { id: true, title: true, status: true, projectRequestId: true }
  });
  console.dir(proposals, { depth: null });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
