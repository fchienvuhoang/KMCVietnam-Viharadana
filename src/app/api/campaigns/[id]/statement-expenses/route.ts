import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { decimalToNumber } from "@/lib/money";
import { getPrisma, withDatabaseReadRetry } from "@/lib/prisma";
import { redactPhoneNumbers } from "@/lib/privacy";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const prisma = getPrisma();
    const transactions = await withDatabaseReadRetry(() => prisma.bankTransaction.findMany({
      where: { campaignId: id, outflowType: "DONATION", debitAmount: { gt: 0 } },
      select: { id: true, transactionDate: true, description: true, debitAmount: true },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { statementRow: "desc" }],
    }));

    return NextResponse.json({
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        transactionDate: transaction.transactionDate.toISOString(),
        description: redactPhoneNumbers(transaction.description),
        amount: decimalToNumber(transaction.debitAmount),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
