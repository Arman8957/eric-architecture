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
import { NotificationService } from '../notification/notification.service';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
/** Average number of days per month - the constant used for all project-duration math. */
const DAYS_PER_MONTH = 30.44;

/**
 * A denied timecard is kicked back to the employee rather than archived, so it
 * stays editable and resubmittable alongside drafts.
 */
const EDITABLE_TIMECARD_STATUSES: TimecardStatus[] = [
  TimecardStatus.DRAFT,
  TimecardStatus.REJECTED,
];

/**
 * What a single overhead expense costs per month. One-time and yearly costs
 * are amortised across 12 months so every frequency is comparable.
 */
const monthlyEquivalentOf = (expense: { amount: any; frequency: string }) => {
  const amount = Number(expense.amount) || 0;
  switch (expense.frequency) {
    case 'monthly':
      return amount;
    case 'semi-annually':
      return amount / 6;
    case 'yearly':
    case 'one-time':
      return amount / 12;
    default:
      return 0;
  }
};

/** SiteSettings key holding the date the firm's first pay period starts. */
const PAYROLL_START_DATE_KEY = 'PAYROLL_START_DATE';

/** Employee fields the payroll table and tax breakdown need. */
const PAYROLL_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  employeeProfile: {
    select: {
      hourlyRate: true,
      salary: true,
      state: true,
      utilizationRate: true,
      taxPercentage: true,
      taxes: {
        select: { id: true, taxType: true, customName: true, percentage: true },
      },
    },
  },
} as const;

@Injectable()
export class FinancialService {
  private readonly logger = new Logger(FinancialService.name);
  constructor(
    private prisma: PrismaService,
    private notification: NotificationService,
  ) { }

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

  /**
   * Firm-wide financials.
   *
   * `scope` decides what is counted:
   *   'all'  - every project ever, archived included, and every approved
   *            timecard. The running total for the whole company.
   *   'year' - only the given year. A project belongs to the year it was
   *            *completed* in; one still running belongs to the year it
   *            started. So a project started in 2026 and finished in 2027
   *            counts toward 2027.
   */
  async getFinancialOverview(
    scope: 'all' | 'year' = 'year',
    year: number = new Date().getFullYear(),
  ) {
    const isYearScope = scope === 'year';
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    // A project counts toward a year by its completion date, falling back to
    // when it started while it is still in flight.
    const projectYearFilter: any = isYearScope
      ? {
          OR: [
            { projectCompletedAt: { gte: yearStart, lte: yearEnd } },
            {
              projectCompletedAt: null,
              OR: [
                { projectStartedAt: { gte: yearStart, lte: yearEnd } },
                { projectStartedAt: null, createdAt: { gte: yearStart, lte: yearEnd } },
              ],
            },
          ],
        }
      : {};

    // 1. Labor comes from APPROVED timecards - what the firm actually paid for
    // hours worked - not from headline salaries on the employee profile.
    const approvedTimecards = await this.prisma.timecard.findMany({
      where: {
        status: TimecardStatus.APPROVED,
        ...(isYearScope ? { payYear: year } : {}),
      },
      include: { user: { select: PAYROLL_USER_SELECT } },
    });

    const employees = await this.prisma.employeeProfile.findMany({
      include: { user: { select: { id: true, name: true, role: true, isActive: true } }, taxes: true },
    });

    let totalSalaries = 0; // gross pay across approved timecards
    let totalTaxes = 0;    // tax withheld from that gross
    let firmBillableHours = 0;
    let firmTotalHours = 0;

    // Aggregate per employee so the breakdown shows one row per person.
    const byEmployee = new Map<string, any>();

    for (const timecard of approvedTimecards) {
      const profile = timecard.user?.employeeProfile as any;
      const hourlyRate = Number(profile?.hourlyRate || 0);
      const hours = Number(timecard.totalHours || 0);
      const gross = hours * hourlyRate;

      const taxPct =
        profile?.taxes?.length > 0
          ? profile.taxes.reduce((sum: number, t: any) => sum + Number(t.percentage || 0), 0)
          : Number(profile?.taxPercentage || 0);
      const tax = gross * (taxPct / 100);

      totalSalaries += gross;
      totalTaxes += tax;
      firmBillableHours += Number(timecard.billableHours || 0);
      firmTotalHours += hours;

      const key = timecard.userId;
      const entry = byEmployee.get(key) || {
        id: key,
        userId: key,
        name: timecard.user?.name || 'Unknown',
        role: timecard.user?.role,
        hourlyRate,
        taxPercentage: taxPct,
        grossPay: 0,
        taxAmount: 0,
        netPay: 0,
        billableHours: 0,
        totalHours: 0,
      };
      entry.grossPay += gross;
      entry.taxAmount += tax;
      entry.netPay = entry.grossPay - entry.taxAmount;
      entry.billableHours += Number(timecard.billableHours || 0);
      entry.totalHours += hours;
      byEmployee.set(key, entry);
    }

    const employeeDetails = Array.from(byEmployee.values())
      .map((e) => ({
        ...e,
        // Net pay is what the employee is owed - the bar in Employee Costs.
        totalCost: e.netPay,
        utilizationRate: `${(e.totalHours > 0 ? (e.billableHours / e.totalHours) * 100 : 0).toFixed(1)}%`,
      }))
      .sort((a, b) => b.netPay - a.netPay);

    // Gross pay is the firm's labour cost; net is the employee's take-home.
    const totalLaborCost = totalSalaries;
    const firmUtilization =
      firmTotalHours > 0 ? (firmBillableHours / firmTotalHours) * 100 : 0;

    // 2. Calculate Overhead (expenses + project overhead from non-billable hours)
    // The monthly figure is the *monthly equivalent* of every expense, matching
    // the Overhead Expenses Management modal. One-time costs are amortised over
    // 12 months like yearly ones - previously they were excluded here, which is
    // why this read lower than the modal's "Monthly Equivalent".
    const overheadExpenses = await this.prisma.overheadExpense.findMany();
    const monthlyOverheadExpenses = overheadExpenses.reduce(
      (sum, exp) => sum + monthlyEquivalentOf(exp),
      0,
    );
    const annualOverheadExpenses = monthlyOverheadExpenses * 12;

    // Get Firm Billing Rate for project overhead calculation
    const billingRateRes = await this.getBillingRate();
    const firmBillingRate = billingRateRes.billingRate || 0;

    // Calculate project-level overhead, burned, and labor from ACTIVE projects only
    // Active = non-archived project requests with accepted proposals
    const activeProjectRequests = await this.prisma.projectRequest.findMany({
      where: {
        // All Time keeps every project in the calculator, archived included.
        ...(isYearScope ? { ...projectYearFilter } : {}),
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
        ...(isYearScope
          ? { projectRequestId: { in: activeProjectIds } }
          : {}),
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
        ...(isYearScope ? { projectRequestId: { in: activeProjectIds } } : {}),
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
    // Same monthly-equivalent basis as above, so the percentages here match the
    // modal's Category Breakdown (one-time costs were previously dropped).
    const categoryBreakdown: Record<string, number> = {};
    overheadExpenses.forEach((exp) => {
      categoryBreakdown[exp.category] =
        (categoryBreakdown[exp.category] || 0) + monthlyEquivalentOf(exp);
    });

    // Completed projects inside the current scope.
    const completedProjectCount = await this.prisma.projectRequest.count({
      where: {
        status: 'COMPLETED',
        ...(isYearScope ? { ...projectYearFilter } : {}),
      },
    });

    return {
      scope: { mode: scope, year: isYearScope ? year : null },
      labor: {
        total: totalLaborCost,
        totalSalaries,
        totalTaxes,
        totalNetPay: totalSalaries - totalTaxes,
        // Headcount is every employee on the books, not only those who filed
        // a timecard in this window.
        employeeCount: employees.length,
        employees: employeeDetails,
        billableHours: firmBillableHours,
        totalHours: firmTotalHours,
        utilization: firmUtilization,
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
        activeProjectCount: activeProjectRequests.length,
        completedProjectCount,
        proposalCount: activeProposals.length,
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
    this.logger.debug('getActiveProjects called');
    const projects = await this.prisma.projectRequest.findMany({
      where: {
        isArchived: false,
      },
      include: {
        proposals: {
          where: { status: 'ACCEPTED' },
          select: {
            id: true,
            proposalNumber: true,
            totalAmount: true,
            projectName: true,
            clientName: true,
          },
          orderBy: { createdAt: 'asc' },
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

    this.logger.debug(`Found ${projects.length} potential projects`);

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
        // Project number shown in the tracking table (falls back to the short id
        // when no contract has been accepted yet).
        projectNumber: acceptedProposal?.proposalNumber || null,
        status: project.status,
        isProjectStarted: project.isProjectStarted,
        projectStartedAt: project.projectStartedAt,
        projectCompletedAt: project.projectCompletedAt,
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
      profitMargin: 0,
    };
    grandTotals.profitMargin = grandTotals.price > 0 ? (grandTotals.profit / grandTotals.price) * 100 : 0;

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
      totalProjectBillableHours,
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
    this.logger.debug(`getMyAssignedProjects called for user: ${userId}`);
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

    this.logger.debug(`Found ${projectRequests.length} projects for user ${userId}`);

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

  /**
   * The payload carries the employee's pay rate, salary and tax lines, so it is
   * limited to the timecard's owner and the roles that review payroll.
   */
  async getTimecardById(id: string, requester?: { id: string; role: UserRole }) {
    const timecard = await this.prisma.timecard.findUnique({
      where: { id },
      include: {
        entries: true,
        billableEntries: true,
        user: { select: PAYROLL_USER_SELECT },
      },
    });
    if (!timecard) throw new NotFoundException('Timecard not found');

    if (requester) {
      const isReviewer = ([
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.FINANCE,
      ] as UserRole[]).includes(requester.role);
      if (!isReviewer && timecard.userId !== requester.id)
        throw new ForbiddenException('Not your timecard');
    }

    return timecard;
  }

  async updateTimecard(id: string, userId: string, dto: UpdateTimecardDto) {
    const timecard = await this.prisma.timecard.findUnique({ where: { id } });
    if (!timecard) throw new NotFoundException('Timecard not found');
    if (timecard.userId !== userId)
      throw new ForbiddenException('Not your timecard');
    // REJECTED cards are kicked back to the employee to correct in place, so
    // they stay editable without having to be rebuilt from scratch.
    if (!EDITABLE_TIMECARD_STATUSES.includes(timecard.status))
      throw new BadRequestException('Can only edit draft or rejected timecards');

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
    if (!EDITABLE_TIMECARD_STATUSES.includes(timecard.status))
      throw new BadRequestException('Can only submit draft or rejected timecards');

    return this.prisma.timecard.update({
      where: { id },
      data: {
        status: TimecardStatus.SUBMITTED,
        submittedAt: new Date(),
        // Clear the previous denial once the corrected card is resubmitted.
        rejectedAt: null,
        rejectedBy: null,
        rejectionNote: null,
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
      where: { status: TimecardStatus.SUBMITTED, isArchived: false },
      include: {
        entries: true,
        billableEntries: true,
        user: { select: PAYROLL_USER_SELECT },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  private formatPeriodLabel(timecard: { payPeriod: number; payYear: number }) {
    return `Period ${timecard.payPeriod}, ${timecard.payYear}`;
  }

  async approveTimecard(id: string, approvedByUserId: string) {
    const timecard = await this.prisma.timecard.findUnique({ where: { id } });
    if (!timecard) throw new NotFoundException('Timecard not found');
    if (timecard.status !== TimecardStatus.SUBMITTED)
      throw new BadRequestException('Can only approve submitted timecards');

    const updated = await this.prisma.timecard.update({
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

    await this.notification.createNotification({
      userId: timecard.userId,
      type: 'TIMECARD_APPROVED',
      title: 'Timecard approved',
      message: `Your timecard for ${this.formatPeriodLabel(timecard)} has been approved.`,
      link: '/dashboard/timecards',
    });

    return updated;
  }

  async rejectTimecard(id: string, rejectedByUserId: string, dto: RejectTimecardDto) {
    const timecard = await this.prisma.timecard.findUnique({ where: { id } });
    if (!timecard) throw new NotFoundException('Timecard not found');
    if (timecard.status !== TimecardStatus.SUBMITTED)
      throw new BadRequestException('Can only reject submitted timecards');

    // A denial has to explain itself - the employee corrects against this note.
    const reason = dto.rejectionNote?.trim();
    if (!reason)
      throw new BadRequestException('A reason is required when denying a timecard');

    const updated = await this.prisma.timecard.update({
      where: { id },
      data: {
        status: TimecardStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedBy: rejectedByUserId,
        rejectionNote: reason,
      },
      include: {
        entries: true,
        billableEntries: true,
        user: { select: { name: true, email: true } },
      },
    });

    await this.notification.createNotification({
      userId: timecard.userId,
      type: 'TIMECARD_REJECTED',
      title: 'Timecard denied - action needed',
      message: `Your timecard for ${this.formatPeriodLabel(timecard)} was denied: ${reason}. Correct it and resubmit.`,
      link: '/dashboard/timecards',
    });

    return updated;
  }

  /**
   * Archive approved timecards once payroll has been processed. Archived cards
   * drop out of the payroll table unless explicitly requested.
   */
  async archiveTimecards(ids: string[], archivedByUserId: string) {
    if (!ids?.length)
      throw new BadRequestException('Select at least one timecard to archive');

    const timecards = await this.prisma.timecard.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });

    const notApproved = timecards.filter(
      (tc) => tc.status !== TimecardStatus.APPROVED,
    );
    if (notApproved.length)
      throw new BadRequestException('Only approved timecards can be archived');

    const result = await this.prisma.timecard.updateMany({
      where: { id: { in: ids }, status: TimecardStatus.APPROVED },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: archivedByUserId,
      },
    });

    return { archived: result.count };
  }

  async unarchiveTimecards(ids: string[]) {
    if (!ids?.length)
      throw new BadRequestException('Select at least one timecard to restore');

    const result = await this.prisma.timecard.updateMany({
      where: { id: { in: ids } },
      data: { isArchived: false, archivedAt: null, archivedBy: null },
    });

    return { restored: result.count };
  }

  // ═══════════════════════════════════════════════════
  // PAYROLL CALENDAR
  // ═══════════════════════════════════════════════════

  /**
   * The date the firm's very first bi-weekly pay period starts. Stored in
   * SiteSettings so it can be corrected later; seeded on first read from the
   * earliest SUPER_ADMIN account's creation date.
   */
  async getPayrollStartDate() {
    const setting = await this.prisma.siteSettings.findUnique({
      where: { key: PAYROLL_START_DATE_KEY },
    });
    if (setting?.value) {
      return { payrollStartDate: new Date(setting.value).toISOString(), isSeeded: true };
    }

    const superAdmin = await this.prisma.user.findFirst({
      where: { role: UserRole.SUPER_ADMIN },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const seeded = superAdmin?.createdAt || new Date();

    await this.prisma.siteSettings.upsert({
      where: { key: PAYROLL_START_DATE_KEY },
      update: {},
      create: { key: PAYROLL_START_DATE_KEY, value: seeded.toISOString() },
    });

    return { payrollStartDate: seeded.toISOString(), isSeeded: false };
  }

  async setPayrollStartDate(date: string) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime()))
      throw new BadRequestException('Invalid payroll start date');

    await this.prisma.siteSettings.upsert({
      where: { key: PAYROLL_START_DATE_KEY },
      update: { value: parsed.toISOString() },
      create: { key: PAYROLL_START_DATE_KEY, value: parsed.toISOString() },
    });

    return { payrollStartDate: parsed.toISOString() };
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

  async getAllTimecards(status?: TimecardStatus, includeArchived = false) {
    return this.prisma.timecard.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(includeArchived ? {} : { isArchived: false }),
      },
      include: {
        entries: true,
        billableEntries: true,
        user: { select: PAYROLL_USER_SELECT },
      },
      orderBy: { weekEnding: 'desc' },
    });
  }

  /**
   * Project timeline driving the financial chart and its stat cards.
   *
   *   Start Date  = when the project timer was pressed (projectStartedAt).
   *                 Falls back to the project creation date when the timer has
   *                 never been started, so the chart still has a window.
   *   End Date    = when the final phase was marked complete
   *                 (projectCompletedAt), or "now" while phases remain open.
   *   Total Days  = End - Start, rounded UP to whole days.
   *   Total Months = Total Days / 30.44   (average days per month)
   */
  private async getProjectTimeline(projectId: string) {
    const project = await this.prisma.projectRequest.findUnique({
      where: { id: projectId },
      select: {
        createdAt: true,
        isProjectStarted: true,
        projectStartedAt: true,
        projectCompletedAt: true,
      },
    });
    if (!project) return null;

    const start = project.projectStartedAt || project.createdAt;
    const end = project.projectCompletedAt || new Date();

    const rawDays = (end.getTime() - start.getTime()) / MS_PER_DAY;
    const totalDays = Math.max(1, Math.ceil(rawDays));
    const totalMonths = totalDays / DAYS_PER_MONTH;

    return {
      start,
      end,
      totalDays,
      totalMonths,
      // Number of month buckets drawn on the chart's x-axis.
      monthCount: Math.max(1, Math.ceil(totalMonths)),
      isStarted: !!project.isProjectStarted,
      isCompleted: !!project.projectCompletedAt,
    };
  }

  /**
   * Financial history for a single project.
   *
   * The x-axis spans the project's own months (not the last 12 calendar
   * months), and every series is the project total spread evenly across
   * Total Project Months so the chart always agrees with the stat cards:
   *
   *   Avg Monthly Revenue = Total Contract / Total Project Months
   *   Avg Monthly Cost    = (Labor Cost + Project Overhead) / Total Project Months
   *   Avg Monthly Profit  = Avg Monthly Revenue - Avg Monthly Cost
   *   Avg Utilization     = Billable Hours / (Billable + Non-Billable Hours)
   */
  private async getProjectFinancialHistory(projectId: string) {
    const timeline = await this.getProjectTimeline(projectId);
    if (!timeline) return { history: [], summary: null };

    let details: any = null;
    try {
      details = await this.getProjectFinancialDetails(projectId);
    } catch {
      // No accepted contract yet - fall through with zeroed totals.
    }

    const totalContract = Number(details?.projectCost || 0);
    const laborCost = Number(details?.totalLaborCost || 0);
    const projectOverhead = Number(details?.projectOverheadAllocation || 0);
    const totalCost = laborCost + projectOverhead;

    const billableHours = Number(details?.totalProjectBillableHours || 0);
    const nonBillableHours = Number(details?.totalProjectNonBillableHours || 0);
    const totalHours = billableHours + nonBillableHours;
    const utilization = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

    const avgMonthlyRevenue = totalContract / timeline.totalMonths;
    const avgMonthlyCost = totalCost / timeline.totalMonths;
    const avgMonthlyProfit = avgMonthlyRevenue - avgMonthlyCost;

    // Label with the year too when the project spans more than one calendar year.
    const spansYears =
      timeline.start.getFullYear() !==
      new Date(
        timeline.start.getFullYear(),
        timeline.start.getMonth() + timeline.monthCount - 1,
        1,
      ).getFullYear();

    const history = Array.from({ length: timeline.monthCount }, (_, i) => {
      const d = new Date(
        timeline.start.getFullYear(),
        timeline.start.getMonth() + i,
        1,
      );
      const label = d.toLocaleString('default', { month: 'short' });
      return {
        month: spansYears ? `${label} '${String(d.getFullYear()).slice(-2)}` : label,
        revenue: avgMonthlyRevenue,
        laborCost: laborCost / timeline.totalMonths,
        overheadCost: projectOverhead / timeline.totalMonths,
        totalCost: avgMonthlyCost,
        profit: avgMonthlyProfit,
        utilization: Math.round(utilization),
      };
    });

    return {
      history,
      summary: {
        startDate: timeline.start.toISOString(),
        endDate: timeline.end.toISOString(),
        isStarted: timeline.isStarted,
        isCompleted: timeline.isCompleted,
        totalDays: timeline.totalDays,
        totalMonths: timeline.totalMonths,
        monthCount: timeline.monthCount,
        totalContract,
        laborCost,
        projectOverhead,
        totalCost,
        billableHours,
        nonBillableHours,
        avgMonthlyRevenue,
        avgMonthlyCost,
        avgMonthlyProfit,
        utilization,
      },
    };
  }

  /**
   * Firm-wide history.
   *
   *   scope 'year' - Jan 1 to Dec 31 of that year.
   *   scope 'all'  - from the month the first SUPER_ADMIN account was created
   *                  through to the current month.
   */
  async getFinancialHistory(
    projectId?: string,
    scope: 'all' | 'year' = 'year',
    year: number = new Date().getFullYear(),
  ) {
    if (projectId) {
      return this.getProjectFinancialHistory(projectId);
    }

    const now = new Date();
    let firstMonth: Date;
    let lastMonth: Date;

    if (scope === 'all') {
      const firstAdmin = await this.prisma.user.findFirst({
        where: { role: UserRole.SUPER_ADMIN },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      const start = firstAdmin?.createdAt || new Date(now.getFullYear(), 0, 1);
      firstMonth = new Date(start.getFullYear(), start.getMonth(), 1);
      lastMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      firstMonth = new Date(year, 0, 1);
      lastMonth = new Date(year, 11, 1);
    }

    const months: { start: Date; end: Date; label: string; year: number; monthNum: number }[] = [];
    const spansYears = firstMonth.getFullYear() !== lastMonth.getFullYear();
    const cursor = new Date(firstMonth);
    // Guard against a runaway range if the seed date is ever wrong.
    while (cursor <= lastMonth && months.length < 240) {
      const label = cursor.toLocaleString('default', { month: 'short' });
      months.push({
        start: new Date(cursor.getFullYear(), cursor.getMonth(), 1),
        end: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59),
        label: spansYears
          ? `${label} '${String(cursor.getFullYear()).slice(-2)}`
          : label,
        year: cursor.getFullYear(),
        monthNum: cursor.getMonth(),
      });
      cursor.setMonth(cursor.getMonth() + 1);
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
          },
        });
        const revenue = proposals.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);

        // 2. Labor Costs - all approved timecards (billable part)
        let laborCost = 0;
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

        // 3. Overhead: Fixed Expenses + Non-billable employee time
        let overheadCost = 0;
        const overheadExpenses = await this.prisma.overheadExpense.findMany();
        overheadExpenses.forEach((exp) => {
          const amount = Number(exp.amount);
          if (exp.frequency === 'monthly') overheadCost += amount;
          else if (exp.frequency === 'semi-annually') overheadCost += amount / 6;
          else if (exp.frequency === 'yearly') overheadCost += amount / 12;
        });

        allTimecards.forEach(tc => {
          const ohHours = Number(tc.totalHours || 0) - Number(tc.billableHours || 0);
          if (ohHours > 0) {
            // Approximate OH cost by subtracting billable cost from total cost
            // tc.totalCost = totalHours * hourlyRate
            const hourlyRate = Number(tc.totalHours) > 0 ? Number(tc.totalCost) / Number(tc.totalHours) : 0;
            overheadCost += ohHours * hourlyRate;
          }
        });

        const profit = revenue - laborCost - overheadCost;

        // 4. Utilization = billable hours / total hours for the month
        const monthBillable = allTimecards.reduce((sum, tc) => sum + Number(tc.billableHours || 0), 0);
        const monthTotal = allTimecards.reduce((sum, tc) => sum + Number(tc.totalHours || 0), 0);
        const utilization = monthTotal > 0 ? (monthBillable / monthTotal) * 100 : 0;

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

    return {
      history,
      summary: null,
      range: {
        mode: scope,
        year: scope === 'year' ? year : null,
        start: months[0]?.start?.toISOString() || null,
        end: months[months.length - 1]?.end?.toISOString() || null,
      },
    };
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
      where: { payYear: year, payPeriod, isArchived: false },
      include: {
        entries: true,
        billableEntries: true,
        user: { select: PAYROLL_USER_SELECT },
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
  /**
   * Work anniversaries. Each morning, notify the Super Admin and Finance
   * Manager about any employee whose start-date anniversary falls today, so a
   * gift can be arranged. Only whole years >= 1 are announced.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async notifyWorkAnniversaries() {
    const today = new Date();

    const profiles = await this.prisma.employeeProfile.findMany({
      where: { startingDate: { not: null } },
      select: {
        startingDate: true,
        user: { select: { id: true, name: true, role: true } },
      },
    });

    const celebrating = profiles.filter((p) => {
      const start = p.startingDate as Date;
      if (
        start.getMonth() !== today.getMonth() ||
        start.getDate() !== today.getDate()
      )
        return false;
      return today.getFullYear() - start.getFullYear() >= 1;
    });

    if (celebrating.length === 0) return { notified: 0 };

    const recipients = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.SUPER_ADMIN, UserRole.FINANCE] },
        isActive: true,
      },
      select: { id: true },
    });

    for (const profile of celebrating) {
      const start = profile.startingDate as Date;
      const years = today.getFullYear() - start.getFullYear();
      const name = profile.user?.name || 'A team member';

      await Promise.all(
        recipients.map((recipient) =>
          this.notification.createNotification({
            userId: recipient.id,
            type: 'WORK_ANNIVERSARY',
            title: `${years}-year work anniversary`,
            message: `${name} has been with the firm for ${years} year${years > 1 ? 's' : ''} today.`,
            link: '/dashboard/employees',
          }),
        ),
      );
    }

    this.logger.log(
      `[Work Anniversary] Notified ${recipients.length} manager(s) about ${celebrating.length} anniversary(ies)`,
    );
    return { notified: celebrating.length };
  }

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
