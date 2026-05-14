import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FinancialService } from './financial.service';
import { MercuryService } from './mercury.service';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import * as client from '@prisma/client';
import { CreateOverheadExpenseDto, UpdateOverheadExpenseDto } from './dto/overhead-expense.dto';
import { CreateTimecardDto, UpdateTimecardDto, RejectTimecardDto } from './dto/timecard.dto';
import { UpdateEmployeeProfileDto } from './dto/employee-profile.dto';

interface AuthUser {
  id: string;
  email: string;
  role: client.UserRole;
}

@Controller('financial')
@UseGuards(JwtAuthGuard)
export class FinancialController {
  constructor(
    private readonly financialService: FinancialService,
    private readonly mercuryService: MercuryService,
  ) {}

  // ═══════════════════════════════════════════════════
  // EMPLOYEE PROFILE
  // ═══════════════════════════════════════════════════

  @Patch('employee-profile/:userId')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.FINANCE)
  async updateEmployeeProfile(
    @Param('userId') userId: string,
    @Body() dto: UpdateEmployeeProfileDto,
  ) {
    const profile = await this.financialService.updateEmployeeProfile(userId, dto);
    return { success: true, message: 'Employee profile updated', data: profile };
  }

  // ═══════════════════════════════════════════════════
  // OVERHEAD EXPENSES
  // ═══════════════════════════════════════════════════

  @Get('overhead-expenses')
  async getAllOverheadExpenses() {
    const expenses = await this.financialService.getAllOverheadExpenses();
    return { success: true, data: expenses };
  }

  @Post('overhead-expenses')
  @HttpCode(HttpStatus.CREATED)
  async createOverheadExpense(@Body() dto: CreateOverheadExpenseDto) {
    const expense = await this.financialService.createOverheadExpense(dto);
    return { success: true, message: 'Expense created', data: expense };
  }

  @Patch('overhead-expenses/:id')
  async updateOverheadExpense(
    @Param('id') id: string,
    @Body() dto: UpdateOverheadExpenseDto,
  ) {
    const expense = await this.financialService.updateOverheadExpense(id, dto);
    return { success: true, message: 'Expense updated', data: expense };
  }

  @Delete('overhead-expenses/:id')
  async deleteOverheadExpense(@Param('id') id: string) {
    const result = await this.financialService.deleteOverheadExpense(id);
    return { success: true, ...result };
  }

  // ═══════════════════════════════════════════════════
  // FINANCIAL OVERVIEW
  // ═══════════════════════════════════════════════════

  @Get('overview')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.FINANCE)
  async getFinancialOverview() {
    const overview = await this.financialService.getFinancialOverview();
    return { success: true, data: overview };
  }

  // ═══════════════════════════════════════════════════
  // ACTIVE PROJECTS
  // ═══════════════════════════════════════════════════

  @Get('active-projects')
  async getActiveProjects() {
    const projects = await this.financialService.getActiveProjects();
    return { success: true, data: projects };
  }

  @Get('active-projects/:id/details')
  async getProjectFinancialDetails(@Param('id') id: string) {
    const details = await this.financialService.getProjectFinancialDetails(id);
    return { success: true, data: details };
  }

  // ═══════════════════════════════════════════════════
  // MY ASSIGNED PROJECTS (for timecard)
  // ═══════════════════════════════════════════════════

  @Get('my-assigned-projects')
  async getMyAssignedProjects(@CurrentUser() user: AuthUser) {
    const projects = await this.financialService.getMyAssignedProjects(user.id);
    return { success: true, data: projects };
  }

  // ═══════════════════════════════════════════════════
  // TIMECARDS
  // ═══════════════════════════════════════════════════

  @Post('timecards')
  @HttpCode(HttpStatus.CREATED)
  async createTimecard(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTimecardDto,
  ) {
    const timecard = await this.financialService.createTimecard(user.id, dto);
    return { success: true, message: 'Timecard created', data: timecard };
  }

  @Get('timecards/my')
  async getMyTimecards(@CurrentUser() user: AuthUser) {
    const timecards = await this.financialService.getMyTimecards(user.id);
    return { success: true, data: timecards };
  }

  @Get('timecards/all')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.FINANCE)
  async getAllTimecards(@Query('status') status?: client.TimecardStatus) {
    const timecards = await this.financialService.getAllTimecards(status);
    return { success: true, data: timecards };
  }

  // ═══════════════════════════════════════════════════
  // TIMECARDS BY PAY PERIOD
  // ═══════════════════════════════════════════════════

  @Get('timecards/pay-period')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.FINANCE)
  async getTimecardsByPayPeriod(
    @Query('year') year: string,
    @Query('period') period: string,
  ) {
    const timecards = await this.financialService.getTimecardsByPayPeriod(
      parseInt(year) || new Date().getFullYear(),
      parseInt(period) || 1,
    );
    return { success: true, data: timecards };
  }

  @Get('timecards/pending')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.FINANCE)
  async getPendingTimecards() {
    const timecards = await this.financialService.getPendingTimecards();
    return { success: true, data: timecards };
  }

  @Get('timecards/:id')
  async getTimecardById(@Param('id') id: string) {
    const timecard = await this.financialService.getTimecardById(id);
    return { success: true, data: timecard };
  }

  @Patch('timecards/:id')
  async updateTimecard(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateTimecardDto,
  ) {
    const timecard = await this.financialService.updateTimecard(id, user.id, dto);
    return { success: true, message: 'Timecard updated', data: timecard };
  }

  @Post('timecards/:id/submit')
  async submitTimecard(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const timecard = await this.financialService.submitTimecard(id, user.id);
    return { success: true, message: 'Timecard submitted', data: timecard };
  }

  @Post('timecards/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.FINANCE)
  async approveTimecard(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const timecard = await this.financialService.approveTimecard(id, user.id);
    return { success: true, message: 'Timecard approved', data: timecard };
  }

  @Post('timecards/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.FINANCE)
  async rejectTimecard(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectTimecardDto,
  ) {
    const timecard = await this.financialService.rejectTimecard(id, user.id, dto);
    return { success: true, message: 'Timecard rejected', data: timecard };
  }

  @Delete('timecards/:id')
  async deleteTimecard(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.financialService.deleteTimecard(id, user.id);
    return { success: true, ...result };
  }

  @Get('history')
  async getFinancialHistory(@Query('projectId') projectId?: string) {
    const history = await this.financialService.getFinancialHistory(projectId);
    return { success: true, data: history };
  }

  // ═══════════════════════════════════════════════════
  // BILLING RATE
  // ═══════════════════════════════════════════════════

  @Get('billing-rate')
  async getBillingRate() {
    const result = await this.financialService.getBillingRate();
    return { success: true, data: result };
  }

  @Patch('billing-rate')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.FINANCE)
  async setBillingRate(@Body() body: { billingRate: number }) {
    const result = await this.financialService.setBillingRate(body.billingRate);
    return { success: true, message: 'Billing rate updated', data: result };
  }

  // ═══════════════════════════════════════════════════
  // YEAR-END ARCHIVE
  // ═══════════════════════════════════════════════════

  @Post('archive-completed')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN)
  async archiveCompletedProjects(@Body() body: { year?: number }) {
    const result = await this.financialService.archiveCompletedProjectsForYear(body.year);
    return { success: true, data: result };
  }

  @Get('archived-summary')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.FINANCE)
  async getArchivedSummary() {
    const summary = await this.financialService.getArchivedProjectsSummary();
    return { success: true, data: summary };
  }

  // ═══════════════════════════════════════════════════
  // MERCURY BANKING
  // ═══════════════════════════════════════════════════

  @Get('mercury/accounts')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.FINANCE)
  async getMercuryAccounts() {
    const accounts = await this.mercuryService.getAccounts();
    return { success: true, data: accounts };
  }

  @Get('mercury/accounts/:accountId/transactions')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.FINANCE)
  async getMercuryTransactions(
    @Param('accountId') accountId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const transactions = await this.mercuryService.getTransactions(accountId, limit, offset);
    return { success: true, data: transactions };
  }

}
