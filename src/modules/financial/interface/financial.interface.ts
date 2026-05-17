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

