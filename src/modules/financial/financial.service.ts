import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOverheadExpenseDto, UpdateOverheadExpenseDto } from './dto/overhead-expense.dto';
import { CreateTimecardDto, UpdateTimecardDto, RejectTimecardDto } from './dto/timecard.dto';
import { UpdateEmployeeProfileDto } from './dto/employee-profile.dto';
import { Prisma, TimecardStatus, UserRole, ProposalStatus } from '@prisma/client';

@Injectable()
export class FinancialService {
  private readonly logger = new Logger(FinancialService.name);
  constructor(private prisma: PrismaService) { }

  // ═══════════════════════════════════════════════════
  // EMPLOYEE PROFILE
  // ═══════════════════════════════════════════════════

  async updateEmployeeProfile(userId: string, dto: UpdateEmployeeProfileDto) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Upsert employee profile
    const profile = await this.prisma.employeeProfile.upsert({
      where: { userId },
      update: {
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.startingDate !== undefined && { startingDate: new Date(dto.startingDate) }),
        ...(dto.utilizationRate !== undefined && { utilizationRate: dto.utilizationRate }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
        ...(dto.salary !== undefined && { salary: dto.salary }),
        ...(dto.taxPercentage !== undefined && { taxPercentage: dto.taxPercentage }),
        ...(dto.department !== undefined && { department: dto.department }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.address !== undefined && { address: dto.address }),
      },
      create: {
        userId,
        employeeId: `EMP-${Date.now()}`,
        state: dto.state,
        startingDate: dto.startingDate ? new Date(dto.startingDate) : undefined,
        utilizationRate: dto.utilizationRate,
        hourlyRate: dto.hourlyRate,
        salary: dto.salary,
        taxPercentage: dto.taxPercentage,
        department: dto.department,
        position: dto.position,
        phone: dto.phone,
        address: dto.address,
      },
    });

    // Handle taxes if provided
    if (dto.taxes !== undefined) {
      // Delete old taxes
      await this.prisma.employeeTax.deleteMany({
        where: { employeeProfileId: profile.id },
      });
      // Create new taxes
      if (dto.taxes.length > 0) {
        await this.prisma.employeeTax.createMany({
          data: dto.taxes.map((tax) => ({
            employeeProfileId: profile.id,
            taxType: tax.taxType,
            customName: tax.customName || null,
            percentage: tax.percentage,
          })),
        });
      }
    }

    // Return profile with taxes
    return this.prisma.employeeProfile.findUnique({
      where: { id: profile.id },
      include: { taxes: true },
    });
  }

  // ═══════════════════════════════════════════════════
  // OVERHEAD EXPENSES
  // ═══════════════════════════════════════════════════

  async getAllOverheadExpenses() {
    return this.prisma.overheadExpense.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOverheadExpense(dto: CreateOverheadExpenseDto) {
    return this.prisma.overheadExpense.create({
      data: {
        name: dto.name,
        amount: dto.amount,
        frequency: dto.frequency,
        category: dto.category,
      },
    });
  }

  async updateOverheadExpense(id: string, dto: UpdateOverheadExpenseDto) {
    const expense = await this.prisma.overheadExpense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');

    return this.prisma.overheadExpense.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
        ...(dto.category !== undefined && { category: dto.category }),
      },
    });
  }

  async deleteOverheadExpense(id: string) {
    const expense = await this.prisma.overheadExpense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');

    await this.prisma.overheadExpense.delete({ where: { id } });
    return { message: 'Expense deleted successfully' };
  }

  // ═══════════════════════════════════════════════════
  // FINANCIAL OVERVIEW
  // ═══════════════════════════════════════════════════

  async getFinancialOverview() {
    // 1. Calculate Labor (all employee salaries + tax)
    const employees = await this.prisma.employeeProfile.findMany({
      include: {
        user: {
          select: {
            name: true,
            role: true,
            isActive: true,
            timecards: {
              where: { status: TimecardStatus.APPROVED },
              orderBy: { weekEnding: 'desc' },
              take: 1,
            }
          }
        },
        taxes: true,
      },
    });

    let totalLaborCost = 0;
    let totalSalaries = 0;
    let totalTaxes = 0;

    const employeeDetails = employees.map((emp: any) => {
      // Automated Utilization Calculation
      // Formula: (Billable / (Billable + Non-Billable)) * 100
      // We look at the most recent approved non-empty timecard
      const lastApprovedTimecard = emp.user?.timecards?.[0]; // Assuming ordered desc in findMany
      let calculatedUtilization = emp.utilizationRate ? parseFloat(emp.utilizationRate) : 0;

      if (lastApprovedTimecard) {
        const billable = Number(lastApprovedTimecard.billableHours || 0);
        const total = Number(lastApprovedTimecard.totalHours || 0);
        if (total > 0) {
          calculatedUtilization = (billable / total) * 100;
        }
      }

      const salary = Number(emp.salary || 0);

      // Calculate tax from new EmployeeTax model, fallback to old taxPercentage
      let totalTaxPct = 0;
      if (emp.taxes && emp.taxes.length > 0) {
        totalTaxPct = emp.taxes.reduce((sum: number, t: any) => sum + Number(t.percentage || 0), 0);
      } else {
        totalTaxPct = Number(emp.taxPercentage || 0);
      }

      const taxAmount = salary * (totalTaxPct / 100);
      const totalCost = salary + taxAmount;
      totalSalaries += salary;
      totalTaxes += taxAmount;
      totalLaborCost += totalCost;
      return {
        id: emp.id,
        userId: emp.userId,
        name: emp.user?.name || 'Unknown',
        role: emp.user?.role,
        salary,
        taxPercentage: totalTaxPct,
        taxAmount,
        totalCost,
        utilizationRate: `${calculatedUtilization.toFixed(1)}%`,
        hourlyRate: Number(emp.hourlyRate || 0),
        state: emp.state,
        taxes: emp.taxes || [],
      };
    });

    // 2. Calculate Overhead (expenses + project overhead from non-billable hours)
    const overheadExpenses = await this.prisma.overheadExpense.findMany();
    let monthlyOverheadExpenses = 0;
    let oneTimeOverheadExpenses = 0;
    overheadExpenses.forEach((exp) => {
      const amount = Number(exp.amount);
      if (exp.frequency === 'monthly') monthlyOverheadExpenses += amount;
      else if (exp.frequency === 'semi-annually') monthlyOverheadExpenses += amount / 6;
      else if (exp.frequency === 'yearly') monthlyOverheadExpenses += amount / 12;
      else if (exp.frequency === 'one-time') oneTimeOverheadExpenses += amount;
    });
    const annualOverheadExpenses = monthlyOverheadExpenses * 12 + oneTimeOverheadExpenses;

    // Get Firm Billing Rate for project overhead calculation
    const billingRateRes = await this.getBillingRate();
    const firmBillingRate = billingRateRes.billingRate || 0;

    // Calculate project-level overhead, burned, and labor from ACTIVE projects only
    // Active = non-archived project requests with accepted proposals
    const activeProjectRequests = await this.prisma.projectRequest.findMany({
      where: {
        isArchived: false,
        proposals: { some: { status: 'ACCEPTED' } },
      },
      include: {
        assignedManager: {
          select: { id: true, employeeProfile: { select: { hourlyRate: true } } },
        },
        stages: {
          select: { assignedTo: { select: { id: true, employeeProfile: { select: { hourlyRate: true } } } } },
        },
        teams: {
          include: { members: { select: { id: true, employeeProfile: { select: { hourlyRate: true } } } } },
        },
      },
    });

    let totalProjectOverhead = 0;
    let totalProjectBurned = 0;
    let totalProjectLabor = 0;

    for (const pr of activeProjectRequests) {
      // Calculate total unique staff hourly rate for this project
      const staffMap = new Map<string, number>();
      if (pr.assignedManager) {
        staffMap.set(pr.assignedManager.id, Number(pr.assignedManager.employeeProfile?.hourlyRate || 0));
      }
      pr.stages.forEach(s => {
        if (s.assignedTo) {
          staffMap.set(s.assignedTo.id, Number(s.assignedTo.employeeProfile?.hourlyRate || 0));
        }
      });
      pr.teams.forEach(t => {
        t.members.forEach(m => {
          staffMap.set(m.id, Number(m.employeeProfile?.hourlyRate || 0));
        });
      });
      const totalStaffRate = Array.from(staffMap.values()).reduce((sum, r) => sum + r, 0);

      // Get all billable entries for this project
      const projBillableEntries = await this.prisma.timecardBillableEntry.findMany({
        where: {
          projectRequestId: pr.id,
          timecard: {
            status: { in: [TimecardStatus.APPROVED, TimecardStatus.SUBMITTED] },
          },
        },
      });

      // Calculate project billable hours and burned
      const projBillableHours = projBillableEntries.reduce(
        (sum, be) => sum + Number(be.totalHours || 0), 0,
      );
      const projBurned = projBillableHours * firmBillingRate;
      totalProjectBurned += projBurned;

      // Calculate project labor cost (Sum of Rates × Total Hours)
      const projLabor = projBillableHours * totalStaffRate;
      totalProjectLabor += projLabor;

      // Calculate actual project non-billable hours (Direct from TimecardEntry)
      const projNonBillableEntries = await this.prisma.timecardEntry.findMany({
        where: {
          projectRequestId: pr.id,
          timecard: {
            status: { in: [TimecardStatus.APPROVED, TimecardStatus.SUBMITTED] },
          },
        } as any,
      });

      const projNonBillableHours = projNonBillableEntries.reduce(
        (sum, e) => sum + Number(e.totalHours || 0), 0,
      );

      // Project overhead = firm rate × non-billable hours
      totalProjectOverhead += firmBillingRate * projNonBillableHours;
    }

    const totalOverhead = annualOverheadExpenses + totalProjectOverhead;

    // 3. Calculate Revenue from active (non-archived) project phases (includes amendments)
    const activeProjectIds = activeProjectRequests.map((p) => p.id);
    const activeProposals = await this.prisma.proposal.findMany({
      where: {
        status: 'ACCEPTED',
        projectRequest: { isArchived: false },
      },
      select: { totalAmount: true, projectName: true, proposalType: true },
    });
    const grossRevenue = activeProposals.reduce(
      (sum, p) => sum + Number(p.totalAmount || 0),
      0,
    );

    // Separate amendment revenue for reporting
    const amendmentRevenue = activeProposals
      .filter((p) => p.proposalType === 'AMENDMENT')
      .reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);
    const originalRevenue = grossRevenue - amendmentRevenue;

    // 3b. Calculate Total Approved Refunds (only from non-archived projects)
    const approvedRefunds = await this.prisma.refundRequest.findMany({
      where: {
        refundStatus: 'APPROVED',
        projectRequest: { isArchived: false },
      },
      select: { amount: true },
    });
    const totalRefunds = approvedRefunds.reduce(
      (sum, r) => sum + Number(r.amount || 0),
      0,
    );

    const totalRevenue = grossRevenue - totalRefunds;

    // 4. Calculate Profit
    const totalProfit = totalRevenue - totalOverhead - totalLaborCost;

    // 5. Expense breakdown by category
    const categoryBreakdown: Record<string, number> = {};
    overheadExpenses.forEach((exp) => {
      const amount = Number(exp.amount);
      let monthly = 0;
      if (exp.frequency === 'monthly') monthly = amount;
      else if (exp.frequency === 'semi-annually') monthly = amount / 6;
      else if (exp.frequency === 'yearly') monthly = amount / 12;
      categoryBreakdown[exp.category] = (categoryBreakdown[exp.category] || 0) + monthly;
    });

    return {
      labor: {
        total: totalLaborCost,
        totalSalaries,
        totalTaxes,
        employeeCount: employees.length,
        employees: employeeDetails,
      },
      overhead: {
        total: totalOverhead,
        monthlyExpenses: monthlyOverheadExpenses,
        annualExpenses: annualOverheadExpenses,
        projectOverhead: totalProjectOverhead,
        categoryBreakdown,
        expenseCount: overheadExpenses.length,
      },
      revenue: {
        total: totalRevenue,
        grossRevenue,
        originalRevenue,
        amendmentRevenue,
        totalRefunds,
        activeProjectCount: activeProposals.length,
        amendmentCount: activeProposals.filter((p) => p.proposalType === 'AMENDMENT').length,
      },
      projectFinancials: {
        totalBurned: totalProjectBurned,
        totalLabor: totalProjectLabor,
        totalProjectOverhead: totalProjectOverhead,
        firmBillingRate,
      },
      profit: {
        total: totalProfit,
        margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      },
    };
  }

  // ═══════════════════════════════════════════════════
  // ACTIVE PROJECTS (for Project Tracking tab)
  // ═══════════════════════════════════════════════════

  async getActiveProjects() {
    console.log('[DEBUG] FinancialService.getActiveProjects called');
    const projects = await this.prisma.projectRequest.findMany({
      where: {
        isArchived: false,
      },
      include: {
        proposals: {
          where: { status: 'ACCEPTED' },
          select: {
            id: true,
            totalAmount: true,
            projectName: true,
            clientName: true,
          },
          take: 1,
        },
        stages: {
          include: {
            assignedTo: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { order: 'asc' },
        },
        assignedManager: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    console.log(`[DEBUG] Found ${projects.length} potential projects`);

    // Also fetch amendment proposals per project
    const amendmentProposals = await this.prisma.proposal.findMany({
      where: {
        projectRequestId: { in: projects.map((p) => p.id) },
        proposalType: 'AMENDMENT',
        status: 'ACCEPTED',
      },
      select: {
        projectRequestId: true,
        totalAmount: true,
      },
    });

    // Group amendment totals by projectRequestId
    const amendmentTotalsByProject = new Map<string, number>();
    amendmentProposals.forEach((ap) => {
      const current = amendmentTotalsByProject.get(ap.projectRequestId) || 0;
      amendmentTotalsByProject.set(ap.projectRequestId, current + Number(ap.totalAmount || 0));
    });

    return projects.map((project) => {
      const acceptedProposal = project.proposals[0];
      const clientName = acceptedProposal?.clientName || `${project.clientFirstName} ${project.clientLastName}`;
      const originalAmount = acceptedProposal ? Number(acceptedProposal.totalAmount || 0) : 0;
      const amendmentAmount = amendmentTotalsByProject.get(project.id) || 0;

      return {
        id: project.id,
        clientName,
        projectName: project.projectName,
        phases: project.stages,
        totalAmount: originalAmount + amendmentAmount,
        originalAmount,
        amendmentAmount,
        assignedManager: project.assignedManager,
        projectRequestId: project.id,
      };
    });
  }

  // ═══════════════════════════════════════════════════
  // PROJECT FINANCIAL DETAILS
  // ═══════════════════════════════════════════════════

  async getProjectFinancialDetails(projectId: string) {
    // projectId could be a proposalId or projectRequestId
    // Try to find as proposal first
    let proposal = await this.prisma.proposal.findUnique({
      where: { id: projectId },
      include: {
        services: true,
        projectStages: {
          include: {
            assignedTo: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        projectRequest: {
          select: {
            id: true,
            projectName: true,
            assignedManagerId: true,
            assignedManager: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!proposal) {
      // Try finding by projectRequestId - find the first accepted proposal
      const proposals = await this.prisma.proposal.findMany({
        where: {
          projectRequestId: projectId,
          status: 'ACCEPTED',
        },
        include: {
          services: true,
          projectStages: {
            include: {
              assignedTo: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          projectRequest: {
            select: {
              id: true,
              projectName: true,
              assignedManagerId: true,
              assignedManager: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
        take: 1,
      });
      proposal = proposals[0] || null;
    }

    if (!proposal) {
      throw new NotFoundException('Project not found');
    }

    const projectRequestId = proposal.projectRequestId;

    // Calculate Net Project Cost (Contracted Fee - Approved Refunds)
    const approvedProjectRefunds = await this.prisma.refundRequest.findMany({
      where: {
        projectRequestId,
        refundStatus: 'APPROVED',
      },
      select: { amount: true },
    });
    const totalProjectRefunds = approvedProjectRefunds.reduce(
      (sum, r) => sum + Number(r.amount || 0),
      0,
    );

    // ─── Amendment Proposals for this project ───
    const amendmentProposals = await this.prisma.proposal.findMany({
      where: {
        projectRequestId,
        proposalType: 'AMENDMENT',
        status: 'ACCEPTED',
      },
      select: {
        id: true,
        proposalNumber: true,
        title: true,
        projectName: true,
        totalAmount: true,
        services: {
          select: { id: true, name: true, amount: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalAmendmentAmount = amendmentProposals.reduce(
      (sum, ap) => sum + Number(ap.totalAmount || 0),
      0,
    );

    // Check which amendments are paid
    const amendmentPayments = await this.prisma.payment.findMany({
      where: {
        projectRequestId,
        proposalId: { in: amendmentProposals.map((ap) => ap.id) },
        paymentStatus: 'COMPLETED',
      },
      select: { proposalId: true, amount: true },
    });
    const paidAmendmentProposalIds = new Set(amendmentPayments.map((p) => p.proposalId));
    const totalAmendmentPaid = amendmentPayments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );

    const amendmentDetails = amendmentProposals.map((ap) => ({
      id: ap.id,
      proposalNumber: ap.proposalNumber,
      title: ap.title || ap.projectName,
      amount: Number(ap.totalAmount || 0),
      paid: paidAmendmentProposalIds.has(ap.id),
      services: ap.services.map((s) => ({
        id: s.id,
        name: s.name,
        amount: Number(s.amount || 0),
      })),
    }));

    const grossOriginalCost = Number(proposal.totalAmount || 0);
    const grossProjectCost = grossOriginalCost + totalAmendmentAmount;
    const projectCost = grossProjectCost - totalProjectRefunds;

    // Get Firm Billing Rate
    const billingRateRes = await this.getBillingRate();
    const firmBillingRate = billingRateRes.billingRate || 150; // Default fallback

    // Get billable entries for this project from submitted/approved timecards
    const billableEntries = await this.prisma.timecardBillableEntry.findMany({
      where: {
        projectRequestId,
        timecard: {
          status: { in: [TimecardStatus.APPROVED, TimecardStatus.SUBMITTED] }
        }
      },
      include: {
        timecard: {
          include: {
            entries: true, // these are the non-billable hours (Bereavement, etc.)
            billableEntries: true, // needed for proportional allocation
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                employeeProfile: {
                  select: { hourlyRate: true },
                },
              },
            },
          },
        },
      },
    });

    // Group by employee for the labor breakdown
    const employeeMap = new Map<string, any>();
    billableEntries.forEach((entry: any) => {
      if (!entry.timecard?.user) return;
      const userId = entry.timecard.user.id;
      if (!employeeMap.has(userId)) {
        employeeMap.set(userId, {
          id: userId,
          name: entry.timecard.user.name,
          email: entry.timecard.user.email,
          role: entry.timecard.user.role || 'EMPLOYEE',
          hourlyRate: Number(entry.timecard.user.employeeProfile?.hourlyRate || 0),
          totalBillableHours: 0,
          cost: 0,
        });
      }
      const emp = employeeMap.get(userId);
      const entryHours = Number(entry.totalHours || 0);
      emp.totalBillableHours += entryHours;
      emp.cost = emp.totalBillableHours * emp.hourlyRate;
    });

    // ─── Include ALL assigned employees (manager, stage assignees, team members) ───
    const projectWithTeam = await this.prisma.projectRequest.findUnique({
      where: { id: projectRequestId },
      include: {
        assignedManager: {
          select: {
            id: true, name: true, email: true, role: true,
            employeeProfile: { select: { hourlyRate: true } },
          },
        },
        stages: {
          select: {
            assignedTo: {
              select: {
                id: true, name: true, email: true, role: true,
                employeeProfile: { select: { hourlyRate: true } },
              },
            },
          },
        },
        teams: {
          include: {
            members: {
              select: {
                id: true, name: true, email: true, role: true,
                employeeProfile: { select: { hourlyRate: true } },
              },
            },
          },
        },
      },
    });

    if (projectWithTeam) {
      const addEmployeeIfMissing = (user: any) => {
        if (!user || employeeMap.has(user.id)) return;
        employeeMap.set(user.id, {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role || 'EMPLOYEE',
          hourlyRate: Number(user.employeeProfile?.hourlyRate || 0),
          totalBillableHours: 0,
          cost: 0,
        });
      };

      // Add project manager
      if (projectWithTeam.assignedManager) {
        addEmployeeIfMissing(projectWithTeam.assignedManager);
      }
      // Add stage assignees (drafters, employees)
      for (const stage of projectWithTeam.stages) {
        if (stage.assignedTo) {
          addEmployeeIfMissing(stage.assignedTo);
        }
      }
      // Add team members
      for (const team of projectWithTeam.teams) {
        for (const member of team.members) {
          addEmployeeIfMissing(member);
        }
      }
    }

    const employees = Array.from(employeeMap.values());
    const totalProjectBillableHours = billableEntries.reduce((sum, entry) => sum + Number(entry.totalHours || 0), 0);
    const totalStaffHourlyRate = employees.reduce((sum, e) => sum + e.hourlyRate, 0);

    // Update each employee's cost contribution based on the new logic (TheirRate * TotalProjectHours)
    employees.forEach(e => {
      e.cost = e.hourlyRate * totalProjectBillableHours;
    });

    const totalLaborCost = totalStaffHourlyRate * totalProjectBillableHours;

    // ─── Calculate actual project non-billable hours (Direct) ───
    const projNonBillableEntries = await this.prisma.timecardEntry.findMany({
      where: {
        projectRequestId,
        timecard: {
          status: { in: [TimecardStatus.APPROVED, TimecardStatus.SUBMITTED] },
        },
      } as any,
    });

    const totalProjectNonBillableHours = projNonBillableEntries.reduce(
      (sum, e) => sum + Number(e.totalHours || 0), 0,
    );

    // Group by phase
    const phaseNonBillableMap = new Map<string, number>();
    projNonBillableEntries.forEach((e: any) => {
      if (e.phaseName) {
        phaseNonBillableMap.set(
          e.phaseName,
          (phaseNonBillableMap.get(e.phaseName) || 0) + Number(e.totalHours || 0),
        );
      }
    });

    // ─── Project Overhead = Firm Rate × Non-Billable Hours ───
    const totalProjectOverhead = firmBillingRate * totalProjectNonBillableHours;

    // ─── Burn Rate = Billable Hours × Firm Rate ───
    const burnedFee = totalProjectBillableHours * firmBillingRate;
    const remainingBudget = projectCost - burnedFee;

    // Get phases with pricing and calculate phase-level financials
    const phases = (proposal.projectStages || []).map((stage: any) => {
      const matchingService = (proposal.services || []).find(
        (s: any) => s.name === stage.name,
      );
      const phasePrice = matchingService ? Number(matchingService.amount || 0) : 0;

      // Phase billable hours
      const phaseBillableEntries = billableEntries.filter(be => be.phaseName === stage.name);
      const phaseBillableHours = phaseBillableEntries.reduce((sum, be) => sum + Number(be.totalHours || 0), 0);

      // Phase labor cost
      const phaseLaborCost = totalStaffHourlyRate * phaseBillableHours;

      // Phase overhead = firm rate × direct non-billable hours for this phase
      const phaseNonBillableHours = phaseNonBillableMap.get(stage.name) || 0;
      const phaseOverhead = phaseNonBillableHours * firmBillingRate;

      // Phase burned = billable hours × firm rate
      const phaseBurned = phaseBillableHours * firmBillingRate;

      const phaseProfit = phasePrice - phaseLaborCost - phaseOverhead;

      return {
        id: stage.id,
        name: stage.name,
        price: phasePrice,
        accumulatedTime: stage.accumulatedTime || 0,
        actualHours: phaseBillableHours,
        nonBillableHours: phaseNonBillableHours,
        status: stage.status,
        progress: stage.progress,
        assignedTo: stage.assignedTo,
        burned: phaseBurned,
        laborCost: phaseLaborCost,
        overhead: phaseOverhead,
        profit: phaseProfit,
        profitMargin: phasePrice > 0 ? (phaseProfit / phasePrice) * 100 : 0
      };
    });

    // Grand totals (sum of all phases)
    const grandTotals = {
      price: phases.reduce((sum, p) => sum + p.price, 0),
      burned: phases.reduce((sum, p) => sum + p.burned, 0),
      laborCost: phases.reduce((sum, p) => sum + p.laborCost, 0),
      overhead: phases.reduce((sum, p) => sum + p.overhead, 0),
      profit: phases.reduce((sum, p) => sum + p.profit, 0),
      actualHours: phases.reduce((sum, p) => sum + p.actualHours, 0),
      nonBillableHours: phases.reduce((sum, p) => sum + p.nonBillableHours, 0),
    };
    grandTotals['profitMargin'] = grandTotals.price > 0 ? (grandTotals.profit / grandTotals.price) * 100 : 0;

    const totalProjectCost = totalLaborCost + totalProjectOverhead;
    const profit = projectCost - totalProjectCost;

    return {
      projectName: proposal.projectName,
      clientName: proposal.clientName,
      projectCost, // Net Contracted Fee (original + amendments - refunds)
      grossProjectCost, // Original + amendments
      grossOriginalCost,
      totalAmendmentAmount,
      totalAmendmentPaid,
      totalProjectRefunds,
      burnedFee,
      remainingBudget,
      totalLaborCost,
      projectOverheadAllocation: totalProjectOverhead,
      totalProjectNonBillableHours,
      totalProjectCost,
      profit,
      profitMargin: projectCost > 0 ? (profit / projectCost) * 100 : 0,
      phases,
      grandTotals,
      employees,
      amendments: amendmentDetails,
      assignedManager: proposal.projectRequest?.assignedManager || null,
      firmBillingRate
    };
  }

  // ═══════════════════════════════════════════════════
  // MY ASSIGNED PROJECTS (for timecard billable entry)
  // ═══════════════════════════════════════════════════

  async getMyAssignedProjects(userId: string) {
    // Get projects assigned to this user as manager
    console.log(`[DEBUG] FinancialService.getMyAssignedProjects called for user: ${userId}`);
    const projectRequests = await this.prisma.projectRequest.findMany({
      where: {
        OR: [
          { assignedManagerId: userId },
          { stages: { some: { assignedToId: userId } } }
        ],
        isArchived: false,
      },
      select: {
        id: true,
        projectName: true,
        stages: {
          select: {
            id: true,
            name: true,
            status: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    console.log(`[DEBUG] Found ${projectRequests.length} projects for user ${userId}`);

    return projectRequests.map((pr) => ({
      id: pr.id,
      projectName: pr.projectName,
      phases: pr.stages,
    }));
  }

  // ═══════════════════════════════════════════════════
  // TIMECARDS
  // ═══════════════════════════════════════════════════

  async createTimecard(userId: string, dto: CreateTimecardDto) {
    // Parse the weekStarting date (must be a Monday)
    const weekStarting = new Date(dto.weekStarting);
    // weekEnding = weekStarting + 13 days (end of 2nd week, Sunday)
    const weekEnding = new Date(weekStarting);
    weekEnding.setDate(weekStarting.getDate() + 13);

    // Calculate pay period & year
    const payYear = dto.payYear || weekStarting.getFullYear();
    const payPeriod = dto.payPeriod || this.calculatePayPeriod(weekStarting);

    // Check if timecard already exists for this user/week
    const existing = await this.prisma.timecard.findUnique({
      where: { userId_weekStarting: { userId, weekStarting } },
    });
    if (existing) {
      throw new BadRequestException('A timecard already exists for this pay period');
    }

    return this.prisma.timecard.create({
      data: {
        userId,
        weekStarting,
        weekEnding,
        payPeriod,
        payYear,
        status: TimecardStatus.DRAFT,
      },
      include: { entries: true, billableEntries: true, user: { select: { name: true, email: true } } },
    });
  }

  private calculatePayPeriod(weekStarting: Date): number {
    // Calculate which of the 26 bi-weekly periods this falls in
    const year = weekStarting.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    // Find the first Monday of the year
    const dayOfWeek = startOfYear.getDay();
    const daysToFirstMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
    const firstMonday = new Date(year, 0, 1 + daysToFirstMonday);
    const diffMs = weekStarting.getTime() - firstMonday.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const period = Math.floor(diffDays / 14) + 1;
    return Math.max(1, Math.min(26, period));
  }

  async getMyTimecards(userId: string) {
    return this.prisma.timecard.findMany({
      where: { userId },
      include: {
        entries: true,
        billableEntries: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { weekEnding: 'desc' },
      take: 10,
    });
  }

  async getTimecardById(id: string) {
    const timecard = await this.prisma.timecard.findUnique({
      where: { id },
      include: {
        entries: true,
        billableEntries: true,
        user: {
          select: {
            name: true,
            email: true,
            employeeProfile: {
              select: { hourlyRate: true },
            },
          },
        },
      },
    });
    if (!timecard) throw new NotFoundException('Timecard not found');
    return timecard;
  }

  async updateTimecard(id: string, userId: string, dto: UpdateTimecardDto) {
    const timecard = await this.prisma.timecard.findUnique({ where: { id } });
    if (!timecard) throw new NotFoundException('Timecard not found');
    if (timecard.userId !== userId)
      throw new ForbiddenException('Not your timecard');
    if (timecard.status !== TimecardStatus.DRAFT)
      throw new BadRequestException('Can only edit draft timecards');

    // Get user's hourly rate
    const profile = await this.prisma.employeeProfile.findUnique({
      where: { userId },
    });
    const hourlyRate = Number(profile?.hourlyRate || 0);

    // Delete old overhead entries and create new ones
    await this.prisma.timecardEntry.deleteMany({ where: { timecardId: id } });

    let studioOverheadHours = 0;
    const entryData = dto.entries.map((entry) => {
      const totalHours =
        entry.monday + entry.tuesday + entry.wednesday + entry.thursday +
        entry.friday + entry.saturday + entry.sunday;
      studioOverheadHours += totalHours;
      return {
        timecardId: id,
        category: entry.category,
        projectRequestId: entry.projectRequestId || null,
        phaseName: entry.phaseName || null,
        entryWeek: entry.entryWeek || 1,
        monday: entry.monday,
        tuesday: entry.tuesday,
        wednesday: entry.wednesday,
        thursday: entry.thursday,
        friday: entry.friday,
        saturday: entry.saturday,
        sunday: entry.sunday,
        totalHours,
      };
    });

    await this.prisma.timecardEntry.createMany({ data: entryData });

    // Handle billable entries
    let totalBillableHours = 0;
    await this.prisma.timecardBillableEntry.deleteMany({ where: { timecardId: id } });

    if (dto.billableEntries && dto.billableEntries.length > 0) {
      const billableData = dto.billableEntries.map((entry) => {
        const totalHours =
          entry.monday + entry.tuesday + entry.wednesday + entry.thursday +
          entry.friday + entry.saturday + entry.sunday;
        totalBillableHours += totalHours;

        return {
          timecardId: id,
          projectRequestId: entry.projectRequestId,
          projectName: entry.projectName,
          phaseName: entry.phaseName,
          description: entry.description || null,
          entryWeek: entry.entryWeek || 1,
          monday: entry.monday,
          tuesday: entry.tuesday,
          wednesday: entry.wednesday,
          thursday: entry.thursday,
          friday: entry.friday,
          saturday: entry.saturday,
          sunday: entry.sunday,
          totalHours,
        };
      });
      await this.prisma.timecardBillableEntry.createMany({ data: billableData });
    }

    // Update timecard totals
    // studioOverheadHours is the sum of categories (Bereavement, etc.)
    // projectNonBillableHours is effectively the same in this model
    const grandTotalHours = totalBillableHours + studioOverheadHours;
    const totalCost = grandTotalHours * hourlyRate; // Actual labor cost for the firm

    return this.prisma.timecard.update({
      where: { id },
      data: {
        totalHours: grandTotalHours,
        billableHours: totalBillableHours,
        nonBillableHours: studioOverheadHours,
        totalCost,
      },
      include: {
        entries: true,
        billableEntries: true,
        user: { select: { name: true, email: true } },
      },
    });
  }

  async submitTimecard(id: string, userId: string) {
    const timecard = await this.prisma.timecard.findUnique({
      where: { id },
      include: { entries: true },
    });
    if (!timecard) throw new NotFoundException('Timecard not found');
    if (timecard.userId !== userId)
      throw new ForbiddenException('Not your timecard');
    if (timecard.status !== TimecardStatus.DRAFT)
      throw new BadRequestException('Can only submit draft timecards');

    return this.prisma.timecard.update({
      where: { id },
      data: {
        status: TimecardStatus.SUBMITTED,
        submittedAt: new Date(),
      },
      include: {
        entries: true,
        billableEntries: true,
        user: { select: { name: true, email: true } },
      },
    });
  }

  async getPendingTimecards() {
    return this.prisma.timecard.findMany({
      where: { status: TimecardStatus.SUBMITTED },
      include: {
        entries: true,
        billableEntries: true,
        user: {
          select: {
            name: true,
            email: true,
            role: true,
            employeeProfile: { select: { hourlyRate: true } },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async approveTimecard(id: string, approvedByUserId: string) {
    const timecard = await this.prisma.timecard.findUnique({ where: { id } });
    if (!timecard) throw new NotFoundException('Timecard not found');
    if (timecard.status !== TimecardStatus.SUBMITTED)
      throw new BadRequestException('Can only approve submitted timecards');

    return this.prisma.timecard.update({
      where: { id },
      data: {
        status: TimecardStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: approvedByUserId,
      },
      include: {
        entries: true,
        billableEntries: true,
        user: { select: { name: true, email: true } },
      },
    });
  }

  async rejectTimecard(id: string, rejectedByUserId: string, dto: RejectTimecardDto) {
    const timecard = await this.prisma.timecard.findUnique({ where: { id } });
    if (!timecard) throw new NotFoundException('Timecard not found');
    if (timecard.status !== TimecardStatus.SUBMITTED)
      throw new BadRequestException('Can only reject submitted timecards');

    return this.prisma.timecard.update({
      where: { id },
      data: {
        status: TimecardStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedBy: rejectedByUserId,
        rejectionNote: dto.rejectionNote || null,
      },
      include: {
        entries: true,
        billableEntries: true,
        user: { select: { name: true, email: true } },
      },
    });
  }

  async deleteTimecard(id: string, userId: string) {
    const timecard = await this.prisma.timecard.findUnique({ where: { id } });
    if (!timecard) throw new NotFoundException('Timecard not found');
    if (timecard.userId !== userId)
      throw new ForbiddenException('Not your timecard');
    if (timecard.status !== TimecardStatus.DRAFT)
      throw new BadRequestException('Can only delete draft timecards');

    await this.prisma.timecard.delete({ where: { id } });
    return { message: 'Timecard deleted' };
  }

  async getAllTimecards(status?: TimecardStatus) {
    return this.prisma.timecard.findMany({
      where: status ? { status } : {},
      include: {
        entries: true,
        billableEntries: true,
        user: {
          select: {
            name: true,
            email: true,
            role: true,
            employeeProfile: { select: { hourlyRate: true } },
          },
        },
      },
      orderBy: { weekEnding: 'desc' },
    });
  }

  async getFinancialHistory(projectId?: string) {
    const months: { start: Date; end: Date; label: string; year: number; monthNum: number }[] = [];
    const now = new Date();
    // Get last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        start: new Date(d.getFullYear(), d.getMonth(), 1),
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
        label: d.toLocaleString('default', { month: 'short' }),
        year: d.getFullYear(),
        monthNum: d.getMonth(),
      });
    }

    const history = await Promise.all(
      months.map(async (month) => {
        // 1. Revenue (Accepted proposals in this month)
        const proposals = await this.prisma.proposal.findMany({
          where: {
            status: ProposalStatus.ACCEPTED,
            respondedAt: {
              gte: month.start,
              lte: month.end,
            },
            ...(projectId && { projectRequestId: projectId }),
          },
        });
        const revenue = proposals.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);

        // 2. Labor Costs
        let laborCost = 0;
        if (projectId) {
          // Billable entries for THIS project
          const billableEntries = await this.prisma.timecardBillableEntry.findMany({
            where: {
              projectRequestId: projectId,
              timecard: {
                status: TimecardStatus.APPROVED,
                weekEnding: {
                  gte: month.start,
                  lte: month.end,
                },
              },
            },
            include: {
              timecard: {
                include: {
                  user: {
                    include: { employeeProfile: true },
                  },
                },
              },
            },
          });

          billableEntries.forEach((entry: any) => {
            const hourlyRate = Number(entry.timecard.user.employeeProfile?.hourlyRate || 0);
            laborCost += Number(entry.totalHours || 0) * hourlyRate;
          });
        } else {
          // TOTAL Labor cost from all approved timecards (billable part)
          const allTimecards = await this.prisma.timecard.findMany({
            where: {
              status: TimecardStatus.APPROVED,
              weekEnding: {
                gte: month.start,
                lte: month.end,
              },
            },
            include: {
              user: {
                include: { employeeProfile: true }
              }
            }
          });

          allTimecards.forEach(tc => {
            const hourlyRate = Number(tc.user.employeeProfile?.hourlyRate || 0);
            laborCost += Number(tc.billableHours || 0) * hourlyRate;
          });
        }

        // 3. Overhead
        let overheadCost = 0;
        if (!projectId) {
          // Global Overhead: Fixed Expenses + Non-billable employee time
          const overheadExpenses = await this.prisma.overheadExpense.findMany();
          overheadExpenses.forEach((exp) => {
            const amount = Number(exp.amount);
            if (exp.frequency === 'monthly') overheadCost += amount;
            else if (exp.frequency === 'semi-annually') overheadCost += amount / 6;
            else if (exp.frequency === 'yearly') overheadCost += amount / 12;
          });

          const allTimecardsOH = await this.prisma.timecard.findMany({
            where: {
              status: TimecardStatus.APPROVED,
              weekEnding: {
                gte: month.start,
                lte: month.end,
              },
            },
          });

          allTimecardsOH.forEach(tc => {
            const ohHours = Number(tc.totalHours || 0) - Number(tc.billableHours || 0);
            if (ohHours > 0) {
              // Approximate OH cost by subtracting billable cost from total cost
              // tc.totalCost = totalHours * hourlyRate
              const hourlyRate = Number(tc.totalHours) > 0 ? Number(tc.totalCost) / Number(tc.totalHours) : 0;
              overheadCost += ohHours * hourlyRate;
            }
          });
        } else {
          // Project's share of overhead
          const activeProjectCount = await this.prisma.proposal.count({
            where: { status: ProposalStatus.ACCEPTED },
          });
          const overheadExpenses = await this.prisma.overheadExpense.findMany();
          let totalMonthlyOverhead = 0;
          overheadExpenses.forEach((exp) => {
            const amount = Number(exp.amount);
            if (exp.frequency === 'monthly') totalMonthlyOverhead += amount;
            else if (exp.frequency === 'semi-annually') totalMonthlyOverhead += amount / 6;
            else if (exp.frequency === 'yearly') totalMonthlyOverhead += amount / 12;
          });
          overheadCost = activeProjectCount > 0 ? totalMonthlyOverhead / activeProjectCount : 0;
        }

        const profit = revenue - laborCost - overheadCost;

        // 4. Utilization
        const allTimecardsUtil = await this.prisma.timecard.findMany({
          where: {
            status: TimecardStatus.APPROVED,
            weekEnding: {
              gte: month.start,
              lte: month.end,
            },
            ...(projectId && {
              billableEntries: {
                some: { projectRequestId: projectId }
              }
            })
          },
        });
        const monthBillable = allTimecardsUtil.reduce((sum, tc) => sum + Number(tc.billableHours || 0), 0);
        // Total hours for all employees this month
        const monthTotal = allTimecardsUtil.reduce((sum, tc) => sum + Number(tc.totalHours || 0), 0);
        const monthUtilization = monthTotal > 0 ? (monthBillable / monthTotal) * 100 : 0;
        const utilization = monthTotal > 0 ? (monthBillable / monthTotal) * 100 : 65; // fallback to something reasonable if no data

        return {
          month: month.label,
          revenue,
          laborCost,
          overheadCost,
          totalCost: laborCost + overheadCost,
          profit,
          utilization: Math.round(utilization),
        };
      }),
    );

    return history;
  }

  // ═══════════════════════════════════════════════════
  // BILLING RATE
  // ═══════════════════════════════════════════════════

  async getBillingRate() {
    const setting = await this.prisma.siteSettings.findUnique({
      where: { key: 'BILLING_RATE' },
    });
    return { billingRate: setting ? parseFloat(setting.value) : 0 };
  }

  async setBillingRate(rate: number) {
    const setting = await this.prisma.siteSettings.upsert({
      where: { key: 'BILLING_RATE' },
      update: { value: String(rate), description: 'Firm-wide billing rate per hour charged to clients' },
      create: { key: 'BILLING_RATE', value: String(rate), description: 'Firm-wide billing rate per hour charged to clients' },
    });
    return { billingRate: parseFloat(setting.value) };
  }

  // ═══════════════════════════════════════════════════
  // TIMECARDS BY PAY PERIOD
  // ═══════════════════════════════════════════════════

  async getTimecardsByPayPeriod(year: number, payPeriod: number) {
    const timecards = await this.prisma.timecard.findMany({
      where: { payYear: year, payPeriod },
      include: {
        entries: true,
        billableEntries: true,
        user: {
          select: {
            name: true,
            email: true,
            role: true,
            employeeProfile: {
              select: {
                hourlyRate: true,
                employeeId: true,
                state: true,
                taxes: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return timecards;
  }

  // ═══════════════════════════════════════════════════
  // YEAR-END AUTO-ARCHIVE
  // ═══════════════════════════════════════════════════

  /**
   * Daily cron job: Archives completed projects from previous years.
   * A project is "completed" when ALL its stages have status COMPLETED.
   * Only projects whose last stage completion was before the current year are archived.
   * Pending/ongoing projects (with incomplete stages) remain untouched.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async autoArchiveCompletedProjects() {
    const currentYear = new Date().getFullYear();
    this.logger.log(`[Year-End Archive] Running daily check for year ${currentYear}`);
    const result = await this.archiveCompletedProjectsForYear(currentYear);
    if (result.archivedCount > 0) {
      this.logger.log(
        `[Year-End Archive] Archived ${result.archivedCount} completed project(s) from previous years`,
      );
    }
  }

  /**
   * Archive all fully-completed projects from years before the given year.
   * Called automatically by the cron job, or manually via the admin endpoint.
   *
   * Criteria for archival:
   * 1. Project is NOT already archived
   * 2. Project has at least one stage
   * 3. ALL stages have status COMPLETED
   * 4. The most recent stage completion (or project updatedAt) is before Jan 1 of the target year
   * 5. All amendment proposals (if any) are ACCEPTED
   */
  async archiveCompletedProjectsForYear(targetYear?: number) {
    const year = targetYear || new Date().getFullYear();
    const yearStart = new Date(year, 0, 1); // January 1st of the target year

    // Find candidate projects: non-archived, non-deleted, with accepted proposals
    const candidates = await this.prisma.projectRequest.findMany({
      where: {
        isArchived: false,
        deletedAt: null,
        proposals: { some: { status: 'ACCEPTED' } },
      },
      include: {
        stages: {
          select: { status: true, completedAt: true },
        },
        proposals: {
          where: { proposalType: 'AMENDMENT' },
          select: { status: true },
        },
      },
    });

    const toArchive: string[] = [];

    for (const project of candidates) {
      // Must have stages
      if (project.stages.length === 0) continue;

      // ALL stages must be COMPLETED
      const allStagesCompleted = project.stages.every(
        (s) => s.status === 'COMPLETED',
      );
      if (!allStagesCompleted) continue;

      // All amendment proposals must be resolved (ACCEPTED or REJECTED, not PENDING/SENT/DRAFT)
      const hasUnresolvedAmendments = project.proposals.some(
        (p) => !['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(p.status),
      );
      if (hasUnresolvedAmendments) continue;

      // Check timing: latest stage completion or project update must be before the target year
      const latestCompletion = project.stages
        .filter((s) => s.completedAt)
        .map((s) => new Date(s.completedAt!))
        .sort((a, b) => b.getTime() - a.getTime())[0];

      const referenceDate = latestCompletion || project.updatedAt;
      if (referenceDate >= yearStart) continue; // Still in current year, skip

      toArchive.push(project.id);
    }

    if (toArchive.length > 0) {
      await this.prisma.projectRequest.updateMany({
        where: { id: { in: toArchive } },
        data: {
          isArchived: true,
          archivedAt: new Date(),
        },
      });
    }

    return {
      archivedCount: toArchive.length,
      archivedProjectIds: toArchive,
      fiscalYear: year,
      message: toArchive.length > 0
        ? `Archived ${toArchive.length} completed project(s) from before ${year}`
        : `No completed projects found to archive for year ${year}`,
    };
  }

  /**
   * Get a summary of archived projects for reporting.
   */
  async getArchivedProjectsSummary() {
    const archivedProjects = await this.prisma.projectRequest.findMany({
      where: { isArchived: true, deletedAt: null },
      include: {
        proposals: {
          where: { status: 'ACCEPTED' },
          select: { totalAmount: true, proposalType: true },
        },
        assignedManager: {
          select: { id: true, name: true },
        },
      },
      orderBy: { archivedAt: 'desc' },
    });

    const totalArchivedRevenue = archivedProjects.reduce((sum, p) => {
      return sum + p.proposals.reduce((s, prop) => s + Number(prop.totalAmount || 0), 0);
    }, 0);

    return {
      count: archivedProjects.length,
      totalRevenue: totalArchivedRevenue,
      projects: archivedProjects.map((p) => ({
        id: p.id,
        projectName: p.projectName,
        clientName: `${p.clientFirstName} ${p.clientLastName}`,
        archivedAt: p.archivedAt,
        totalAmount: p.proposals.reduce((s, prop) => s + Number(prop.totalAmount || 0), 0),
        assignedManager: p.assignedManager,
      })),
    };
  }
}
