import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MercuryAccount {
  id: string;
  name: string;
  status: string;
  type: string;
  routingNumber: string;
  accountNumber: string;
  availableBalance: number;
  currentBalance: number;
  kind: string;
  nickname: string | null;
  createdAt: string;
}

export interface MercuryTransaction {
  id: string;
  amount: number;
  status: string;
  note: string | null;
  counterpartyName: string;
  counterpartyNickname: string | null;
  kind: string;
  createdAt: string;
  postedAt: string | null;
  estimatedDeliveryDate: string | null;
  dashboardLink: string | null;
  reasonForFailure: string | null;
  externalMemo: string | null;
  bankDescription: string | null;
}

@Injectable()
export class MercuryService {
  private readonly logger = new Logger(MercuryService.name);
  private readonly baseUrl = 'https://api.mercury.com/api/v1';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const key = this.config.get<string>('MERCURY_API_KEY');
    if (key && key !== 'your-mercury-api-key-here') {
      this.logger.log(`Mercury API key loaded (${key.substring(0, 20)}...)`);
    } else {
      this.logger.warn('Mercury API key is NOT configured or is still the placeholder');
    }
  }

  private getApiKey(): string {
    const apiKey = this.config.get<string>('MERCURY_API_KEY');
    if (!apiKey) {
      this.logger.error('MERCURY_API_KEY is not configured');
      throw new InternalServerErrorException('Mercury API key is not configured. Please add MERCURY_API_KEY to your environment variables.');
    }
    return apiKey;
  }

  private async mercuryFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const apiKey = this.getApiKey().trim();
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      });
    }

    try {
      this.logger.debug(`Attempting Mercury API call with Bearer token...`);
      
      let response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      // If Bearer fails with 401, try Basic Auth as a fallback
      if (response.status === 401) {
        this.logger.warn(`Bearer auth failed (401). Retrying with Basic Auth...`);
        const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');
        response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        });
      }

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Mercury API error ${response.status}: ${errorBody}`);
        throw new InternalServerErrorException(`Mercury API returned ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error(`Mercury API request failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to connect to Mercury API');
    }
  }

  /**
   * Fetch all Mercury accounts with balances
   * GET /accounts
   */
  async getAccounts(): Promise<{ accounts: MercuryAccount[] }> {
    const data = await this.mercuryFetch<{ accounts: MercuryAccount[] }>('/accounts');

    // Mask account numbers for security (show only last 4 digits)
    const maskedAccounts = data.accounts.map(account => ({
      ...account,
      accountNumber: account.accountNumber
        ? `•••••••${account.accountNumber.slice(-4)}`
        : '••••••••',
      routingNumber: account.routingNumber
        ? `•••••${account.routingNumber.slice(-4)}`
        : '••••••••',
    }));

    return { accounts: maskedAccounts };
  }

  /**
   * Fetch recent transactions for a specific account
   * GET /account/{accountId}/transactions
   */
  async getTransactions(
    accountId: string,
    limit: number = 10,
    offset: number = 0,
  ): Promise<{ total: number; transactions: MercuryTransaction[] }> {
    const data = await this.mercuryFetch<{ total: number; transactions: MercuryTransaction[] }>(
      `/account/${accountId}/transactions`,
      {
        limit: limit.toString(),
        offset: offset.toString(),
      },
    );

    return data;
  }
}
