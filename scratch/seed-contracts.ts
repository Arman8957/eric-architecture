import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const defaults = [
    {
      articleKey: 'article_1_definitions',
      title: 'Article 1 - Definitions',
      content: `To establish a clear understanding, the following terms are defined for use throughout this Agreement:

"Architect" refers to Architecture Simple, represented by Eric Rivera, AIA, who will provide professional architectural services as detailed in this Agreement.

"Work" refers to all architectural, engineering, and related professional services required for the design, development, and documentation of the Project, as set forth in the Scope of Services.

"Design Documents" (DDs) refers to the completed Schematic Design and Design Development documents, including all drawings, specifications, and other materials prepared by the Architect.

"Construction Documents" (CDs) refers to the completed set of final documents that provide the necessary details for construction and permitting, including plans, specifications, and other materials.

"Bidding Documents" refers to the final Construction Documents and any related documents issued to contractors or bidders.

"Substantial Completion" means the point in time when the Project is sufficiently complete in accordance with the Contract Documents, allowing the Owner to occupy or utilize the building for its intended use.

"Completion" refers to the final completion of all construction work, including punch list items and final inspections.`,
      order: 1,
    },
    {
      articleKey: 'article_2_scope',
      title: 'Article 2 - Scope of Services',
      content: 'The Architect agrees to provide the following services for the Project as outlined in the Proposal.',
      order: 2,
    },
    {
      articleKey: 'article_3_payment',
      title: 'Article 3 - Payment Terms',
      content: `3.3 Payment Terms

All invoices are due within 30 days. Late payments are subject to 1.5% monthly interest.`,
      order: 3,
    },
    {
      articleKey: 'article_4_additional',
      title: 'Article 4 - Additional Services',
      content: 'Additional services not specified in the Scope of Services may be provided upon request according to the Fee Schedule in Exhibit A.',
      order: 4,
    },
    {
      articleKey: 'article_5_owner',
      title: "Article 5 - Owner's Responsibilities",
      content: `The Owner agrees to:

• Provide all necessary documents, approvals, and site access.
• Secure all necessary approvals and permits from the AHJ.
• Notify the Architect of any scope changes and authorize additional services in writing.`,
      order: 5,
    },
    {
      articleKey: 'article_6_schedule',
      title: 'Article 6 - Schedule + Contact Information',
      content: `Design efforts begin upon acceptance and written notice to proceed.

Contact Information:
Eric Rivera, AIA, LEED
Principal, Architecture Simple
Email: eric@architecturesimple.com
Phone: +1 (925) 822-4374`,
      order: 6,
    },
    {
      articleKey: 'exhibit_a',
      title: 'Exhibit A: Professional Services Fee Schedule',
      content: `Principal: $200.00/Hour
Project Architect: $150.00/Hour
Project Manager: $130.00/Hour
Designer: $110.00/Hour
Job Captain: $90.00/Hour
CAD Technician: $80.00/Hour
Interior Design & Planning: $75.00/Hour`,
      order: 7,
    },
  ];

  for (const item of defaults) {
    await prisma.masterContract.upsert({
      where: { articleKey: item.articleKey },
      update: {},
      create: item,
    });
  }

  console.log('Master contract articles seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
