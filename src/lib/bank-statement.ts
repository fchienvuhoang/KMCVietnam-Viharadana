export type StatementMeta = {
  sourceBank: "MB";
  accountNumber: string | null;
  accountName: string | null;
  currency: string;
  fromDate: Date | null;
  toDate: Date | null;
  openingBalance: number | null;
  closingBalance: number | null;
};

export type StatementTransactionRow = {
  transactionDate: Date;
  statementRow: number;
  description: string;
  detail: string;
  debitAmount: number;
  creditAmount: number;
  balanceAfter: number | null;
  raw: Record<string, unknown>;
};

export type ParsedStatement = {
  sheetName: string;
  meta: StatementMeta;
  rows: StatementTransactionRow[];
};

