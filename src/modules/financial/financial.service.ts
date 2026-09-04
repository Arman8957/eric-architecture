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

// ──────────────────────────────────────────────────────────────
// Locked rates
//
// Approving a timecard freezes the rates it was approved under onto the card
// itself. Every reader of an approved card must go through these helpers so
// that editing the firm billing rate or an employee's pay/tax setup later can
// never restate money that has already been approved. Cards approved before
// the lock columns existed were backfilled by the migration; a card that still
// has no snapshot (never approved) falls back to the live profile.
// ──────────────────────────────────────────────────────────────

/** The tax percentage an employee profile is currently on. */
const liveTaxPercentageOf = (profile: any): number =>
  profile?.taxes?.length > 0
    ? profile.taxes.reduce((sum: number, t: any) => sum + Number(t.percentage || 0), 0)
    : Number(profile?.taxPercentage || 0);

/** Hourly rate to value a timecard's hours at. */
const hourlyRateOf = (timecard: any): number =>
  timecard?.lockedHourlyRate != null
    ? Number(timecard.lockedHourlyRate)
    : Number(timecard?.user?.employeeProfile?.hourlyRate || 0);

/** Tax percentage to withhold from a timecard's gross. */
const taxPercentageOf = (timecard: any): number =>
  timecard?.lockedTaxPercentage != null
    ? Number(timecard.lockedTaxPercentage)
    : liveTaxPercentageOf(timecard?.user?.employeeProfile);

/** Client billing rate to burn a timecard's hours at. */
const billingRateOf = (timecard: any, firmBillingRate: number): number =>
  timecard?.lockedBillingRate != null
    ? Number(timecard.lockedBillingRate)
    : firmBillingRate;

// ──────────────────────────────────────────────────────────────
// Contract year split
//
// A contract is earned across the days the project actually runs, so one that
// rolls into the next year is shared between them by day count rather than
// landing wholly in either. Days are counted inclusively at both ends: a
// project that starts and finishes on the same day is one day, not zero.
// ──────────────────────────────────────────────────────────────

const startOfDayMs = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const inclusiveDaysBetween = (fromMs: number, toMs: number) =>
  Math.round((toMs - fromMs) / MS_PER_DAY) + 1;

export interface ContractYearSlice {
  year: number;
  days: number;
  /** This year's days as a fraction of the project's whole run. */
  share: number;
}

/**
 * The project's run split into one row per calendar year it touches, e.g. a
 * project running 12 Nov 2026 → 23 Jan 2028 comes back as 50/365/23 days.
 * Multiply each row's `share` by a contract amount to get that year's slice.
 */
const splitRunByYear = (start: Date, end: Date): ContractYearSlice[] => {
  const startMs = startOfDayMs(start);
  const endMs = Math.max(startMs, startOfDayMs(end));
  const totalDays = inclusiveDaysBetween(startMs, endMs);

  const slices: ContractYearSlice[] = [];
  const firstYear = new Date(startMs).getFullYear();
  const lastYear = new Date(endMs).getFullYear();

  for (let year = firstYear; year <= lastYear; year++) {
    const yearStartMs = Math.max(startMs, startOfDayMs(new Date(year, 0, 1)));
    const yearEndMs = Math.min(endMs, startOfDayMs(new Date(year, 11, 31)));
    if (yearEndMs < yearStartMs) continue;
    const days = inclusiveDaysBetween(yearStartMs, yearEndMs);
    slices.push({ year, days, share: totalDays > 0 ? days / totalDays : 0 });
  }

  return slices;
};

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
        select: {
          id: true,
          taxType: true,
          customName: true,
          state: true,
          percentage: true,
        },
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
            // Only state-specific taxes carry a state.
            state:
              tax.taxType === 'ST' || tax.taxType === 'SDI'
                ? tax.state || null
                : null,
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

    // 1. Labor comes from APPROVED timecards - what the firm actually paid for
    // hours worked - not from headline salaries on the employee profile.
    const approvedTimecards = await this.prisma.timecard.findMany({
      where: {
        status: TimecardStatus.APPROVED,
        ...(isYearScope ? { payYear: year } : {}),
      },
      include: {
        user: { select: PAYROLL_USER_SELECT },
        entries: { select: { totalHours: true, projectRequestId: true } },
      },
    });

    let totalSalaries = 0; // gross pay across approved timecards
    let totalTaxes = 0;    // tax withheld from that gross
    let firmBillableHours = 0;
    let firmTotalHours = 0;

    // Aggregate per employee so the breakdown shows one row per person.
    const byEmployee = new Map<string, any>();

    for (const timecard of approvedTimecards) {
      // Rates come off the card, not the profile: an approved card is valued at
      // what it was approved under, so past years never move.
      const hourlyRate = hourlyRateOf(timecard);
      const hours = Number(timecard.totalHours || 0);
      const gross = hours * hourlyRate;

      const taxPct = taxPercentageOf(timecard);
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
    //
    // In year scope an expense counts only once it exists: a cost first
    // recorded in 2027 must leave the 2026 totals untouched. Recurring costs
    // booked in an earlier year keep counting, which is what makes them
    // recurring.
    const overheadExpenses = await this.prisma.overheadExpense.findMany({
      ...(isYearScope ? { where: { createdAt: { lte: yearEnd } } } : {}),
    });
    const monthlyOverheadExpenses = overheadExpenses.reduce(
      (sum, exp) => sum + monthlyEquivalentOf(exp),
      0,
    );
    const annualOverheadExpenses = monthlyOverheadExpenses * 12;

    // Get Firm Billing Rate for project overhead calculation
    const billingRateRes = await this.getBillingRate();
    const firmBillingRate = billingRateRes.billingRate || 0;

    // ─── Pro-rata revenue ───────────────────────────────────────────────
    // A project's contract is spread across the calendar years its active
    // life touches, by day-overlap. In year scope a year picks up only the
    // slice of every contract that overlapped it, so a project running
    // Oct 2025 → Mar 2026 lands ~55% in 2025 and ~45% in 2026 automatically
    // and nobody has to archive anything. Archived state is ignored on
    // purpose — archive is a display flag only.
    const DAY_MS = 24 * 60 * 60 * 1000;
    const startOfDayMs = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const inclusiveDays = (aMs: number, bMs: number) =>
      Math.round((bMs - aMs) / DAY_MS) + 1;
    const todayMs = startOfDayMs(new Date());

    /** Fraction of a project's contract that belongs to the scope year. */
    const yearShareOf = (
      startedAt: Date | null,
      completedAt: Date | null,
      createdAt: Date,
    ): number => {
      if (!isYearScope) return 1;
      const spanStartMs = startOfDayMs(startedAt || createdAt);
      // A still-running project accrues up to today; a closed year re-settles
      // only once the project finally completes.
      const spanEndMs = Math.max(
        spanStartMs,
        completedAt ? startOfDayMs(completedAt) : todayMs,
      );
      const totalDays = inclusiveDays(spanStartMs, spanEndMs);
      const oStart = Math.max(spanStartMs, startOfDayMs(yearStart));
      const oEnd = Math.min(spanEndMs, startOfDayMs(yearEnd));
      if (oEnd < oStart) return 0;
      return totalDays > 0 ? inclusiveDays(oStart, oEnd) / totalDays : 0;
    };

    // Every project that ever had an accepted proposal contributes its
    // contract (original + amendments), pro-rated to the scope year.
    const contractProjects = await this.prisma.projectRequest.findMany({
      where: {
        deletedAt: null,
        proposals: { some: { status: 'ACCEPTED' } },
      },
      select: {
        id: true,
        status: true,
        projectStartedAt: true,
        projectCompletedAt: true,
        createdAt: true,
        proposals: {
          where: { status: 'ACCEPTED' },
          select: { totalAmount: true, proposalType: true },
        },
      },
    });

    const shareByProject = new Map<string, number>();
    let grossRevenue = 0;
    let amendmentRevenue = 0;
    let amendmentProposalCount = 0;
    let acceptedProposalCount = 0;
    const scopeProjectIds: string[] = [];

    for (const pr of contractProjects) {
      const share = yearShareOf(
        pr.projectStartedAt,
        pr.projectCompletedAt,
        pr.createdAt,
      );
      shareByProject.set(pr.id, share);
      if (share <= 0) continue;
      scopeProjectIds.push(pr.id);
      for (const p of pr.proposals) {
        acceptedProposalCount++;
        const amt = Number(p.totalAmount || 0) * share;
        grossRevenue += amt;
        if (p.proposalType === 'AMENDMENT') {
          amendmentRevenue += amt;
          amendmentProposalCount++;
        }
      }
    }
    const originalRevenue = grossRevenue - amendmentRevenue;

    // Refunds ride the same day-overlap split as the contract they reduce.
    const approvedRefundRows = await this.prisma.refundRequest.findMany({
      where: { refundStatus: 'APPROVED' },
      select: { amount: true, projectRequestId: true },
    });
    const totalRefunds = approvedRefundRows.reduce((sum, r) => {
      const share = r.projectRequestId
        ? (shareByProject.get(r.projectRequestId) ?? (isYearScope ? 0 : 1))
        : isYearScope
          ? 0
          : 1;
      return sum + Number(r.amount || 0) * share;
    }, 0);

    const totalRevenue = grossRevenue - totalRefunds;

    // ─── Labor overhead ─────────────────────────────────────────────────
    // The dashboard's Labor Overhead is the sum of every project's own
    // overhead cost — the same number the project's "Direct Labor Breakdown"
    // totals — so the two views always reconcile. Per project that is each
    // employee's rate × the non-billable hours they booked against it.
    //
    // Only overhead hours actually booked to a project count. The year a cost
    // lands in is the pay year of the timecard it was submitted on, so a
    // project running across New Year splits its overhead between the two
    // years by itself.
    const laborOverheadByProject = new Map<string, number>();
    for (const tc of approvedTimecards) {
      const rate = hourlyRateOf(tc);
      for (const entry of ((tc as any).entries || [])) {
        const projectId = entry.projectRequestId;
        if (!projectId) continue;
        const cost = Number(entry.totalHours || 0) * rate;
        laborOverheadByProject.set(
          projectId,
          (laborOverheadByProject.get(projectId) || 0) + cost,
        );
      }
    }
    const laborOverhead = Array.from(laborOverheadByProject.values()).reduce(
      (sum, cost) => sum + cost,
      0,
    );

    const totalOverhead = annualOverheadExpenses + laborOverhead;

    // ─── Project financials (currently-active projects) ─────────────────
    // "Total Burned" / "Total Project Labor" for the projects that are ACTIVE
    // right now (and, in year scope, overlapped the scope year). Timecard
    // hours are counted only for the scope year.
    const activeProjectRequests = await this.prisma.projectRequest.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        proposals: { some: { status: 'ACCEPTED' } },
        ...(isYearScope ? { id: { in: scopeProjectIds } } : {}),
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

    let totalProjectBurned = 0;
    let totalProjectLabor = 0;

    // One read for every active project's billable time, rather than a query
    // per project. Each line burns at the rate its own timecard was approved
    // under.
    const activeBillableEntries = await this.prisma.timecardBillableEntry.findMany({
      where: {
        projectRequestId: { in: activeProjectRequests.map((pr) => pr.id) },
        timecard: {
          status: TimecardStatus.APPROVED,
          ...(isYearScope ? { payYear: year } : {}),
        },
      },
      select: {
        projectRequestId: true,
        totalHours: true,
        timecard: { select: { lockedBillingRate: true } },
      },
    });

    const billableHoursByProject = new Map<string, number>();
    const burnedByProject = new Map<string, number>();
    for (const be of activeBillableEntries) {
      const hours = Number(be.totalHours || 0);
      const pid = be.projectRequestId;
      billableHoursByProject.set(pid, (billableHoursByProject.get(pid) || 0) + hours);
      burnedByProject.set(
        pid,
        (burnedByProject.get(pid) || 0) + hours * billingRateOf(be.timecard, firmBillingRate),
      );
    }

    for (const pr of activeProjectRequests) {
      const staffMap = new Map<string, number>();
      if (pr.assignedManager) {
        staffMap.set(pr.assignedManager.id, Number(pr.assignedManager.employeeProfile?.hourlyRate || 0));
      }
      pr.stages.forEach((s) => {
        if (s.assignedTo) staffMap.set(s.assignedTo.id, Number(s.assignedTo.employeeProfile?.hourlyRate || 0));
      });
      pr.teams.forEach((t) => {
        t.members.forEach((m) => staffMap.set(m.id, Number(m.employeeProfile?.hourlyRate || 0)));
      });
      const totalStaffRate = Array.from(staffMap.values()).reduce((s, r) => s + r, 0);

      const projBillableHours = billableHoursByProject.get(pr.id) || 0;
      totalProjectBurned += burnedByProject.get(pr.id) || 0;
      totalProjectLabor += projBillableHours * totalStaffRate;
    }

    // Expense breakdown by category (monthly-equivalent basis).
    const categoryBreakdown: Record<string, number> = {};
    overheadExpenses.forEach((exp) => {
      categoryBreakdown[exp.category] =
        (categoryBreakdown[exp.category] || 0) + monthlyEquivalentOf(exp);
    });

    // 4. Profit
    const totalProfit = totalRevenue - totalOverhead - totalLaborCost;

    // ─── Project counts ────────────────────────────────────────────────
    // Active    = ACTIVE at some point during the scope year — a project that
    //             started in 2025 and is still running counts in 2026 too, so
    //             the count answers "how many were active in this year", not
    //             "how many began in it".
    // Completed = COMPLETED and finished in the scope year.
    // Both are headcounts only; they carry no money. Archived projects count.
    const activeProjectCount = await this.prisma.projectRequest.count({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(isYearScope
          ? {
              OR: [
                { projectStartedAt: { lte: yearEnd } },
                // Never-started projects fall back to when they were raised.
                { projectStartedAt: null, createdAt: { lte: yearEnd } },
              ],
            }
          : {}),
      },
    });
    const completedProjectCount = await this.prisma.projectRequest.count({
      where: {
        deletedAt: null,
        status: 'COMPLETED',
        ...(isYearScope
          ? { projectCompletedAt: { gte: yearStart, lte: yearEnd } }
          : {}),
      },
    });

    return {
      scope: {
        mode: scope,
        year: isYearScope ? year : null,
        // The year filter offers this year through the current one and nothing
        // earlier — the firm has no financials from before it existed.
        firmStartYear: await this.getFirmStartYear(),
      },
      labor: {
        total: totalLaborCost,
        totalSalaries,
        totalTaxes,
        totalNetPay: totalSalaries - totalTaxes,
        // Headcount is whoever was actually paid in this window. Tying it to
        // the timecards rather than the current staff list is what keeps a
        // closed year's numbers still true after someone leaves or is
        // deactivated.
        employeeCount: byEmployee.size,
        employees: employeeDetails,
        billableHours: firmBillableHours,
        totalHours: firmTotalHours,
        utilization: firmUtilization,
      },
      overhead: {
        total: totalOverhead,
        monthlyExpenses: monthlyOverheadExpenses,
        annualExpenses: annualOverheadExpenses,
        // "Labor overhead" — the wage cost of non-billable time.
        projectOverhead: laborOverhead,
        laborOverhead,
        categoryBreakdown,
        expenseCount: overheadExpenses.length,
      },
      revenue: {
        total: totalRevenue,
        grossRevenue,
        originalRevenue,
        amendmentRevenue,
        totalRefunds,
        activeProjectCount,
        completedProjectCount,
        proposalCount: acceptedProposalCount,
        amendmentCount: amendmentProposalCount,
      },
      projectFinancials: {
        totalBurned: totalProjectBurned,
        totalLabor: totalProjectLabor,
        totalProjectOverhead: laborOverhead,
        firmBillingRate,
      },
      profit: {
        total: totalProfit,
        margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      },
    };
  }

  /**
   * The financial card for a project that has no accepted contract yet: the
   * same shape the full card returns, with every figure at zero, so the modal
   * renders normally instead of erroring on a half-empty object.
   */
  private emptyProjectFinancials(project: {
    projectName: string | null;
    clientFirstName?: string | null;
    clientLastName?: string | null;
    assignedManager?: { id: string; name: string | null; email: string } | null;
  }) {
    const zeroTotals = {
      price: 0,
      billableHours: 0,
      nonBillableHours: 0,
      laborBurned: 0,
      overheadBurned: 0,
      profit: 0,
      profitMargin: 0,
      originalBillableHours: 0,
      amendmentBillableHours: 0,
      originalNonBillableHours: 0,
      amendmentNonBillableHours: 0,
      burned: 0,
      overhead: 0,
      laborCost: 0,
      actualHours: 0,
    };

    return {
      projectName: project.projectName || 'Untitled project',
      clientName:
        `${project.clientFirstName || ''} ${project.clientLastName || ''}`.trim() || '—',
      // Nothing has been contracted, so there is no money on this card yet.
      hasContract: false,
      projectCost: 0,
      grossProjectCost: 0,
      grossOriginalCost: 0,
      totalAmendmentAmount: 0,
      totalAmendmentPaid: 0,
      totalProjectRefunds: 0,
      burnedFee: 0,
      totalOverheadBurned: 0,
      amountBurned: 0,
      totalLaborCost: 0,
      totalOverheadCost: 0,
      totalCostIncurred: 0,
      totalContractFee: 0,
      remainingBudget: 0,
      projectOverheadAllocation: 0,
      totalProjectBillableHours: 0,
      totalProjectNonBillableHours: 0,
      totalProjectCost: 0,
      profit: 0,
      profitMargin: 0,
      phases: [],
      grandTotals: zeroTotals,
      employees: [],
      laborBreakdownTotals: {
        billableHours: 0,
        nonBillableHours: 0,
        laborCost: 0,
        overheadCost: 0,
        costIncurred: 0,
        billableHoursOriginal: 0,
        billableHoursAmendment: 0,
        nonBillableHoursOriginal: 0,
        nonBillableHoursAmendment: 0,
      },
      amendments: [],
      assignedManager: project.assignedManager || null,
      firmBillingRate: 0,
      availableYears: [],
      yearlyBreakdown: [],
    };
  }

  /**
   * The year the firm's account was created — the earliest year any of the
   * financial year filters should offer. Taken from the first account opened
   * on the instance (the founding admin), falling back to the current year on
   * a brand-new install.
   */
  private async getFirmStartYear(): Promise<number> {
    const founder = await this.prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    return founder?.createdAt.getFullYear() ?? new Date().getFullYear();
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

  /**
   * One project's financial card.
   *
   * `year` narrows the time-based half of the card — burn, cost incurred and
   * the direct labor breakdown — to the timecards submitted for that pay year,
   * so a project running across New Year can be read one year at a time.
   * Omitted, it reports the project's running totals across every year. The
   * contract figures are not affected by it; the year split of the contract
   * itself is reported separately in `yearlyBreakdown`.
   */
  async getProjectFinancialDetails(projectId: string, year?: number) {
    // Scoping by pay year keeps this consistent with the dashboard, which
    // books a cost to the year of the timecard it arrived on.
    const timecardScope = {
      status: TimecardStatus.APPROVED,
      ...(year ? { payYear: year } : {}),
    };

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

    // The financial picture is always anchored on the ORIGINAL contract; its
    // amendments are folded in as their own phase group below. If an amendment
    // proposal id was passed, resolve back to the project it belongs to.
    if (proposal && proposal.proposalType === 'AMENDMENT' && proposal.projectRequestId) {
      projectId = proposal.projectRequestId;
      proposal = null;
    }

    if (!proposal) {
      // Try finding by projectRequestId - the original accepted proposal.
      const proposals = await this.prisma.proposal.findMany({
        where: {
          projectRequestId: projectId,
          status: 'ACCEPTED',
          proposalType: { not: 'AMENDMENT' },
        },
        orderBy: { createdAt: 'asc' },
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
      // No accepted contract yet — an inquiry or a project still out to bid.
      // The Project Tracking table lists these, so View Detail has to open on
      // them too; it just has no money to show yet.
      const pending = await this.prisma.projectRequest.findUnique({
        where: { id: projectId },
        select: {
          projectName: true,
          clientFirstName: true,
          clientLastName: true,
          status: true,
          assignedManager: { select: { id: true, name: true, email: true } },
        },
      });
      if (!pending) throw new NotFoundException('Project not found');
      return this.emptyProjectFinancials(pending);
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
        projectStages: {
          select: {
            id: true,
            name: true,
            order: true,
            status: true,
            progress: true,
            accumulatedTime: true,
            assignedTo: { select: { id: true, name: true, email: true } },
          },
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

    // Approved timecards only — an unapproved one must not move the money.
    const billableEntries = await this.prisma.timecardBillableEntry.findMany({
      where: {
        projectRequestId,
        timecard: timecardScope,
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

    // ─── Amendment vs original attribution ───
    // Phase names repeat across the original contract and its amendments, so a
    // timesheet line is tied to a phase by its stage id where it carries one,
    // and otherwise by (contract, phase name). Legacy lines that never recorded
    // a contract are counted as original-contract work.
    const amendmentProposalIdSet = new Set(amendmentProposals.map((ap) => ap.id));
    const isAmendmentProposalId = (pid?: string | null) =>
      !!pid && amendmentProposalIdSet.has(pid);

    // Direct labor breakdown — one row per employee, each employee's billable
    // and non-billable hours split into original vs amendment work.
    const employeeMap = new Map<string, any>();
    const ensureEmployee = (u: any) => {
      if (!u?.id || employeeMap.has(u.id)) return;
      employeeMap.set(u.id, {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role || 'EMPLOYEE',
        hourlyRate: Number(u.employeeProfile?.hourlyRate || 0),
        totalBillableHours: 0,
        billableHoursOriginal: 0,
        billableHoursAmendment: 0,
        nonBillableHours: 0,
        nonBillableHoursOriginal: 0,
        nonBillableHoursAmendment: 0,
        laborCost: 0,
        overheadCost: 0,
        costIncurred: 0,
        cost: 0,
      });
    };

    // Cost is accumulated line by line at the rate the line's own timecard was
    // approved under, never at one blended rate for the employee — a mid-project
    // pay change must leave the hours approved before it valued as they were.
    billableEntries.forEach((entry: any) => {
      const user = entry.timecard?.user;
      if (!user) return;
      ensureEmployee(user);
      const emp = employeeMap.get(user.id);
      const hrs = Number(entry.totalHours || 0);
      emp.totalBillableHours += hrs;
      emp.laborCost += hrs * hourlyRateOf(entry.timecard);
      if (isAmendmentProposalId(entry.proposalId)) emp.billableHoursAmendment += hrs;
      else emp.billableHoursOriginal += hrs;
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
      if (projectWithTeam.assignedManager) ensureEmployee(projectWithTeam.assignedManager);
      for (const stage of projectWithTeam.stages) {
        if (stage.assignedTo) ensureEmployee(stage.assignedTo);
      }
      for (const team of projectWithTeam.teams) {
        for (const member of team.members) ensureEmployee(member);
      }
    }

    // ─── Actual project non-billable (overhead) hours, from approved timecards ───
    const projNonBillableEntries = await this.prisma.timecardEntry.findMany({
      where: {
        projectRequestId,
        timecard: timecardScope,
      } as any,
      include: {
        timecard: {
          select: {
            lockedHourlyRate: true,
            lockedBillingRate: true,
            user: {
              select: {
                id: true, name: true, email: true, role: true,
                employeeProfile: { select: { hourlyRate: true } },
              },
            },
          },
        },
      },
    });

    const totalProjectNonBillableHours = projNonBillableEntries.reduce(
      (sum, e) => sum + Number(e.totalHours || 0), 0,
    );

    projNonBillableEntries.forEach((e: any) => {
      const user = e.timecard?.user;
      if (!user) return;
      ensureEmployee(user);
      const emp = employeeMap.get(user.id);
      const hrs = Number(e.totalHours || 0);
      emp.nonBillableHours += hrs;
      emp.overheadCost += hrs * hourlyRateOf(e.timecard);
      if (isAmendmentProposalId(e.proposalId)) emp.nonBillableHoursAmendment += hrs;
      else emp.nonBillableHoursOriginal += hrs;
    });

    const totalProjectBillableHours = billableEntries.reduce(
      (sum, entry) => sum + Number(entry.totalHours || 0), 0,
    );

    // ─── Per-employee cost ───
    //   Labor Cost    = Σ (locked rate × billable hours) per timecard
    //   Overhead Cost = Σ (locked rate × non-billable hours) per timecard
    //   Cost Incurred = Labor Cost + Overhead Cost
    // The rate shown in the Hourly Rate column is what those costs actually
    // worked out to, so it stays truthful when a person's rate changed
    // part-way through the project.
    const employees = Array.from(employeeMap.values());
    employees.forEach((e) => {
      e.costIncurred = e.laborCost + e.overheadCost;
      e.cost = e.costIncurred; // the "Cost Incurred" column reads emp.cost
      const hours = e.totalBillableHours + e.nonBillableHours;
      if (hours > 0) e.hourlyRate = e.costIncurred / hours;
    });

    const totalLaborCost = employees.reduce((s, e) => s + e.laborCost, 0);
    const totalOverheadCost = employees.reduce((s, e) => s + e.overheadCost, 0);
    const totalCostIncurred = totalLaborCost + totalOverheadCost;

    const laborBreakdownTotals = {
      billableHours: employees.reduce((s, e) => s + e.totalBillableHours, 0),
      nonBillableHours: employees.reduce((s, e) => s + e.nonBillableHours, 0),
      laborCost: totalLaborCost,
      overheadCost: totalOverheadCost,
      costIncurred: totalCostIncurred,
      billableHoursOriginal: employees.reduce((s, e) => s + e.billableHoursOriginal, 0),
      billableHoursAmendment: employees.reduce((s, e) => s + e.billableHoursAmendment, 0),
      nonBillableHoursOriginal: employees.reduce((s, e) => s + e.nonBillableHoursOriginal, 0),
      nonBillableHoursAmendment: employees.reduce((s, e) => s + e.nonBillableHoursAmendment, 0),
    };

    // ─── Burn — at the billing rate each timecard locked in on approval ───
    const burnOf = (entries: any[]) =>
      entries.reduce(
        (sum, e: any) =>
          sum + Number(e.totalHours || 0) * billingRateOf(e.timecard, firmBillingRate),
        0,
      );

    const totalOverheadBurned = burnOf(projNonBillableEntries);
    const burnedFee = burnOf(billableEntries); // labor burned
    const amountBurned = burnedFee + totalOverheadBurned; // top "Amount Burned" card

    // ─── Phase profit tracking, grouped by contract ───
    // A timesheet line belongs to a phase when it points at the phase's stage
    // id, or (no stage id) names the phase on the right contract.
    const phaseEntriesFor = (
      entries: any[],
      stage: any,
      contractProposalId: string,
      isOriginal: boolean,
    ) =>
      entries.filter((ent: any) => {
        if (ent.stageId) return ent.stageId === stage.id;
        const onThisContract = isOriginal
          ? !ent.proposalId || ent.proposalId === contractProposalId
          : ent.proposalId === contractProposalId;
        return onThisContract && ent.phaseName === stage.name;
      });

    const hoursOf = (entries: any[]) =>
      entries.reduce((sum, e: any) => sum + Number(e.totalHours || 0), 0);

    const buildPhaseGroup = (
      stages: any[],
      services: any[],
      contractProposalId: string,
      contractProposalNumber: string,
      isAmendment: boolean,
    ) =>
      (stages || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((stage: any) => {
          const svc = (services || []).find((s: any) => s.name === stage.name);
          const price = svc ? Number(svc.amount || 0) : 0;
          const phaseBillable = phaseEntriesFor(billableEntries, stage, contractProposalId, !isAmendment);
          const phaseNonBillable = phaseEntriesFor(projNonBillableEntries, stage, contractProposalId, !isAmendment);
          const billableHours = hoursOf(phaseBillable);
          const nonBillableHours = hoursOf(phaseNonBillable);
          const laborBurned = burnOf(phaseBillable);
          const overheadBurned = burnOf(phaseNonBillable);
          const profit = price - laborBurned - overheadBurned;
          return {
            id: stage.id,
            name: stage.name,
            contractLabel: isAmendment
              ? `Amendment · ${contractProposalNumber}`
              : 'Original Contract',
            contractProposalId,
            contractProposalNumber,
            isAmendment,
            price,
            accumulatedTime: stage.accumulatedTime || 0,
            billableHours,
            nonBillableHours,
            laborBurned,
            overheadBurned,
            profit,
            profitMargin: price > 0 ? (profit / price) * 100 : 0,
            status: stage.status,
            progress: stage.progress,
            assignedTo: stage.assignedTo,
            // back-compat aliases for older readers
            actualHours: billableHours,
            burned: laborBurned,
            overhead: overheadBurned,
            laborCost: laborBurned,
          };
        });

    const originalPhaseRows = buildPhaseGroup(
      proposal.projectStages || [],
      proposal.services || [],
      proposal.id,
      proposal.proposalNumber,
      false,
    );
    const amendmentPhaseRows: any[] = [];
    for (const ap of amendmentProposals as any[]) {
      amendmentPhaseRows.push(
        ...buildPhaseGroup(
          ap.projectStages || [],
          ap.services || [],
          ap.id,
          ap.proposalNumber,
          true,
        ),
      );
    }
    const phases = [...originalPhaseRows, ...amendmentPhaseRows];

    const sumBy = (arr: any[], key: string) =>
      arr.reduce((s, x) => s + (Number(x[key]) || 0), 0);

    // The Grand Total is the authoritative row: it uses the project-wide hour
    // totals (which always reconcile with the Direct Labor Breakdown), not the
    // per-phase sums, which fall short when a timesheet line never named a
    // phase. Its original/amendment split comes from the same entry-level
    // contract tag the labor breakdown uses.
    const grandPrice = sumBy(phases, 'price'); // every phase, original + amendments
    const grandLaborBurned = burnedFee; // totalProjectBillableHours × firmRate
    const grandOverheadBurned = totalOverheadBurned; // totalProjectNonBillableHours × firmRate
    const grandProfit = grandPrice - grandLaborBurned - grandOverheadBurned;

    const grandTotals = {
      price: grandPrice,
      billableHours: totalProjectBillableHours,
      nonBillableHours: totalProjectNonBillableHours,
      laborBurned: grandLaborBurned,
      overheadBurned: grandOverheadBurned,
      profit: grandProfit,
      profitMargin: grandPrice > 0 ? (grandProfit / grandPrice) * 100 : 0,
      // original vs amendment hour split
      originalBillableHours: laborBreakdownTotals.billableHoursOriginal,
      amendmentBillableHours: laborBreakdownTotals.billableHoursAmendment,
      originalNonBillableHours: laborBreakdownTotals.nonBillableHoursOriginal,
      amendmentNonBillableHours: laborBreakdownTotals.nonBillableHoursAmendment,
      // back-compat aliases
      burned: grandLaborBurned,
      overhead: grandOverheadBurned,
      laborCost: grandLaborBurned,
      actualHours: totalProjectBillableHours,
    };

    // Remaining Budget = Total Contract Fee (every phase) − Total Cost Incurred
    const totalContractFee = grandPrice;
    const remainingBudget = totalContractFee - totalCostIncurred;

    const totalProjectCost = totalCostIncurred;
    const profit = projectCost - totalProjectCost;

    // ─── Years this card can be filtered to ───
    // Only years the project actually has approved time in — no empty options.
    // Deliberately unscoped by `year`, or picking one year would hide the rest.
    const [billableYears, overheadYears] = await Promise.all([
      this.prisma.timecardBillableEntry.findMany({
        where: { projectRequestId, timecard: { status: TimecardStatus.APPROVED } },
        select: { timecard: { select: { payYear: true } } },
        distinct: ['timecardId'],
      }),
      this.prisma.timecardEntry.findMany({
        where: { projectRequestId, timecard: { status: TimecardStatus.APPROVED } } as any,
        select: { timecard: { select: { payYear: true } } },
        distinct: ['timecardId'],
      }),
    ]);
    const availableYears = Array.from(
      new Set(
        [...billableYears, ...overheadYears].map((row: any) => row.timecard?.payYear),
      ),
    )
      .filter((y): y is number => typeof y === 'number')
      .sort((a, b) => b - a);

    // ─── Contract split across the years the project runs ───
    const runStart =
      projectWithTeam?.projectStartedAt || projectWithTeam?.createdAt || new Date();
    const runEnd = projectWithTeam?.projectCompletedAt || new Date();
    const runSlices = splitRunByYear(runStart, runEnd);
    const yearlyBreakdown = runSlices.map((slice) => ({
      year: slice.year,
      days: slice.days,
      share: slice.share,
      originalAmount: grossOriginalCost * slice.share,
      amendmentAmount: totalAmendmentAmount * slice.share,
      totalAmount: grossProjectCost * slice.share,
    }));

    return {
      projectName: proposal.projectName,
      clientName: proposal.clientName,
      hasContract: true,
      // Project run — drives the year split above and the tracking columns.
      projectStartedAt: projectWithTeam?.projectStartedAt || null,
      projectCompletedAt: projectWithTeam?.projectCompletedAt || null,
      totalRunDays: runSlices.reduce((sum, s) => sum + s.days, 0),
      yearlyBreakdown,
      /** The year this card is currently scoped to; null = running totals. */
      scopeYear: year ?? null,
      availableYears,
      projectCost, // Net Contracted Fee (original + amendments - refunds)
      grossProjectCost, // Original + amendments
      grossOriginalCost,
      totalAmendmentAmount,
      totalAmendmentPaid,
      totalProjectRefunds,

      // Burn — at the firm billing rate
      burnedFee, // labor burned
      totalOverheadBurned, // overhead burned
      amountBurned, // labor burned + overhead burned

      // Cost incurred — at each employee's own hourly rate
      totalLaborCost, // Σ rate × billable hours
      totalOverheadCost, // Σ rate × non-billable hours
      totalCostIncurred, // Σ rate × (billable + non-billable)

      totalContractFee,
      remainingBudget,

      projectOverheadAllocation: totalOverheadBurned, // back-compat
      totalProjectBillableHours,
      totalProjectNonBillableHours,
      totalProjectCost,
      profit,
      profitMargin: projectCost > 0 ? (profit / projectCost) * 100 : 0,

      phases,
      grandTotals,
      employees,
      laborBreakdownTotals,
      amendments: amendmentDetails,
      assignedManager: proposal.projectRequest?.assignedManager || null,
      firmBillingRate,
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
            proposalId: true,
            proposal: {
              select: {
                id: true,
                proposalNumber: true,
                title: true,
                projectName: true,
                proposalType: true,
              },
            },
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    this.logger.debug(`Found ${projectRequests.length} projects for user ${userId}`);

    return projectRequests.map((pr) => {
      // A timesheet line is booked against a phase of a specific contract — the
      // original proposal or one of its amendments — so the phases are grouped
      // by the contract they belong to rather than presented as one flat list.
      const contracts = new Map<string, any>();

      for (const stage of pr.stages) {
        const key = stage.proposalId ?? 'unassigned';
        if (!contracts.has(key)) {
          contracts.set(key, {
            id: stage.proposalId ?? null,
            proposalNumber: stage.proposal?.proposalNumber ?? null,
            title:
              stage.proposal?.title ||
              stage.proposal?.projectName ||
              'Unassigned phases',
            isAmendment: stage.proposal?.proposalType === 'AMENDMENT',
            phases: [] as any[],
          });
        }
        contracts.get(key).phases.push({
          id: stage.id,
          name: stage.name,
          status: stage.status,
        });
      }

      return {
        id: pr.id,
        projectName: pr.projectName,
        // Original contract first, then amendments, so the list reads in order.
        contracts: Array.from(contracts.values()).sort((a, b) => {
          if (a.isAmendment !== b.isAmendment) return a.isAmendment ? 1 : -1;
          return (a.proposalNumber || '').localeCompare(b.proposalNumber || '');
        }),
        // Kept so anything still reading a flat phase list keeps working.
        phases: pr.stages.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
        })),
      };
    });
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
        proposalId: entry.proposalId || null,
        proposalNumber: entry.proposalNumber || null,
        stageId: entry.stageId || null,
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
          proposalId: entry.proposalId || null,
          proposalNumber: entry.proposalNumber || null,
          stageId: entry.stageId || null,
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
    const timecard = await this.prisma.timecard.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            employeeProfile: {
              select: {
                hourlyRate: true,
                taxPercentage: true,
                taxes: { select: { percentage: true } },
              },
            },
          },
        },
      },
    });
    if (!timecard) throw new NotFoundException('Timecard not found');
    if (timecard.status !== TimecardStatus.SUBMITTED)
      throw new BadRequestException('Can only approve submitted timecards');

    // Freeze the rates this card is being approved under. From here the card is
    // valued at these numbers for good — a later billing-rate or pay change
    // only reaches cards approved after it.
    const profile = timecard.user?.employeeProfile as any;
    const { billingRate } = await this.getBillingRate();

    const updated = await this.prisma.timecard.update({
      where: { id },
      data: {
        status: TimecardStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: approvedByUserId,
        lockedBillingRate: new Prisma.Decimal(billingRate || 0),
        lockedHourlyRate: new Prisma.Decimal(Number(profile?.hourlyRate || 0)),
        lockedTaxPercentage: new Prisma.Decimal(liveTaxPercentageOf(profile)),
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
   *   Avg Monthly Cost    = Total Cost Incurred / Total Project Months
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
    // Cost is the actual cost incurred — each employee's own rate applied to
    // their billable AND non-billable hours — not the firm-rate burn.
    const laborCost = Number(details?.totalLaborCost || 0);
    const projectOverhead = Number(details?.totalOverheadCost || 0);
    const totalCost =
      Number(details?.totalCostIncurred ?? laborCost + projectOverhead);

    const billableHours = Number(details?.totalProjectBillableHours || 0);
    const nonBillableHours = Number(details?.totalProjectNonBillableHours || 0);
    const totalHours = billableHours + nonBillableHours;
    const utilization = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

    // Dividing by a fraction of a month turns a $10 contract into "$304 / month"
    // on its first day, which reads as impossible. The divisor is floored at one
    // month so a young project shows its actual contract value and converges on
    // the true monthly rate once it has run longer than a month.
    const monthsForAverage = Math.max(1, timeline.totalMonths);

    const avgMonthlyRevenue = totalContract / monthsForAverage;
    const avgMonthlyCost = totalCost / monthsForAverage;
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
        laborCost: laborCost / monthsForAverage,
        overheadCost: projectOverhead / monthsForAverage,
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
        /** The divisor actually used for the averages (never below 1 month). */
        monthsForAverage,
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
          laborCost += Number(tc.billableHours || 0) * hourlyRateOf(tc);
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
          // Non-billable hours cost the same rate the card was approved under.
          if (ohHours > 0) overheadCost += ohHours * hourlyRateOf(tc);
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
