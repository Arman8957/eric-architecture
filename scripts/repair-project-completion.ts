/**
 * Repairs projects that were auto-completed by the old per-proposal check.
 *
 * Before the fix, finishing every phase of ANY single proposal marked the whole
 * project COMPLETED — so completing an amendment's one phase closed a project
 * that still had its original contract's phases outstanding, and progress
 * jumped to 100%.
 *
 * This finds projects stored as COMPLETED that still have unfinished phases
 * across their accepted proposals and puts them back to ACTIVE.
 *
 * Dry run (default, writes nothing):
 *   npx ts-node -r tsconfig-paths/register scripts/repair-project-completion.ts
 *
 * Apply:
 *   npx ts-node -r tsconfig-paths/register scripts/repair-project-completion.ts --apply
 */
import { PrismaClient, RequestStatus, ProposalStatus, StageStatus } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  const completedProjects = await prisma.projectRequest.findMany({
    where: { status: RequestStatus.COMPLETED },
    select: { id: true, projectName: true },
  });

  const broken: { id: string; projectName: string; done: number; total: number }[] = [];

  for (const project of completedProjects) {
    const acceptedProposals = await prisma.proposal.findMany({
      where: { projectRequestId: project.id, status: ProposalStatus.ACCEPTED },
      include: { projectStages: { select: { status: true } } },
    });

    const stages = acceptedProposals.flatMap((p) => p.projectStages);
    if (stages.length === 0) continue;

    const done = stages.filter((s) => s.status === StageStatus.COMPLETED).length;
    if (done < stages.length) {
      broken.push({ ...project, done, total: stages.length });
    }
  }

  if (broken.length === 0) {
    console.log('No projects need repair.');
    return;
  }

  console.log(
    `${broken.length} project(s) marked COMPLETED with phases still outstanding:\n`,
  );
  for (const p of broken) {
    console.log(`  ${p.projectName} (${p.id}) — ${p.done}/${p.total} phases done`);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to fix these.');
    return;
  }

  for (const p of broken) {
    await prisma.projectRequest.update({
      where: { id: p.id },
      data: {
        status: RequestStatus.ACTIVE,
        projectCompletedAt: null,
        totalDurationMonths: null,
      },
    });
    console.log(`Reverted ${p.projectName} to ACTIVE`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
