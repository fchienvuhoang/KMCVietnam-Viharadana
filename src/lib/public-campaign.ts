import { revalidateTag, unstable_cache } from "next/cache";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { decimalToNumber } from "@/lib/money";
import { getPrisma, withDatabaseReadRetry } from "@/lib/prisma";
import { redactPhoneNumbers } from "@/lib/privacy";
import { makeCampaignCode } from "@/lib/text";

const PUBLIC_CAMPAIGN_DATA_CACHE_VERSION = "campaign-bills-v7";
const PUBLIC_CAMPAIGN_LIST_TAG = "public-campaign-list";

export type ActivePublicCampaign = {
  code: string;
  name: string;
  description: string | null;
};

export type PublicCampaignData = {
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  income: number;
  expenses: number;
  refunds: number;
  balance: number;
  transactionCount: number;
  transactions: PublicCampaignTransaction[];
  bills: PublicCampaignBill[];
  donations: { id: string; title: string; amount: number; transactionDate: string }[];
};

export type PublicCampaignBill = {
  transactionId: string | null;
  title: string | null;
  id: string;
  originalName: string;
  createdAt: string;
};

export type PublicCampaignTransaction = {
  id: string;
  transactionDate: string;
  createdAt: string;
  statementRow: number | null;
  description: string;
  debitAmount: number;
  creditAmount: number;
  outflowType: "DONATION" | "REFUND";
  refundLinks: PublicRefundLink[];
};

export type PublicRefundLink = {
  amount: number;
  transactionDate: string;
  description: string;
};

export async function getPublicCampaignMeta(code: string) {
  const prisma = getPrisma();
  const normalizedCode = makeCampaignCode(code);

  return withDatabaseReadRetry(() => prisma.campaign.findUnique({
    where: { code: normalizedCode },
    select: {
      code: true,
      name: true,
      description: true,
    },
  }));
}

export async function getActivePublicCampaigns(): Promise<ActivePublicCampaign[]> {
  const prisma = getPrisma();
  return withDatabaseReadRetry(() => prisma.campaign.findMany({
    where: { status: "ACTIVE" },
    select: {
      code: true,
      name: true,
      description: true,
    },
    orderBy: { createdAt: "desc" },
  }));
}

export function getCachedActivePublicCampaigns() {
  return unstable_cache(getActivePublicCampaigns, ["active-public-campaigns"], {
    revalidate: false,
    tags: [PUBLIC_CAMPAIGN_LIST_TAG],
  })();
}

export function invalidatePublicCampaignListCache() {
  revalidateTag(PUBLIC_CAMPAIGN_LIST_TAG, { expire: 0 });
}

export async function warmPublicCampaignListCache() {
  await getCachedActivePublicCampaigns();
}

function publicCampaignTag(code: string) {
  return `public-campaign:${makeCampaignCode(code)}`;
}

export function getCachedPublicCampaignMeta(code: string) {
  const normalizedCode = makeCampaignCode(code);
  return unstable_cache(
    () => getPublicCampaignMeta(normalizedCode),
    ["public-campaign-meta", normalizedCode],
    { revalidate: false, tags: [publicCampaignTag(normalizedCode)] },
  )();
}

export function getPublicCampaignData(code: string): Promise<PublicCampaignData | null> {
  return withDatabaseReadRetry(() => loadPublicCampaignData(code));
}

async function loadPublicCampaignBills(campaignId: string) {
  try {
    return await getPrisma().campaignBill.findMany({
      where: { campaignId, OR: [{ transactionId: null }, { transaction: { campaignId, outflowType: "DONATION", debitAmount: { gt: 0 } } }] },
      select: { id: true, originalName: true, createdAt: true, transactionId: true, title: true },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    // During a rollout, the optional bill table may not have been migrated yet.
    // Keep the financial report available; other database errors must still surface.
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2021" &&
        error.meta?.modelName === "CampaignBill") {
      console.warn("Public campaign bills unavailable: apply the CampaignBill migration.");
      return [];
    }
    throw error;
  }
}

async function loadPublicCampaignData(code: string): Promise<PublicCampaignData | null> {
  const prisma = getPrisma();
  const normalizedCode = makeCampaignCode(code);
  const campaign = await prisma.campaign.findUnique({
    where: { code: normalizedCode },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      status: true,
    },
  });

  if (!campaign) {
    return null;
  }

  const [transactionSums, refundSums, allocationSums, transactions, allocations, bills, donations] = await Promise.all([
    prisma.bankTransaction.aggregate({
      where: {
        campaignId: campaign.id,
        outflowType: "DONATION",
      },
      _sum: {
        creditAmount: true,
        debitAmount: true,
      },
      _count: true,
    }),
    prisma.bankTransaction.aggregate({
      where: { campaignId: campaign.id, outflowType: "REFUND" },
      _sum: { debitAmount: true },
      _count: true,
    }),
    prisma.transactionAllocation.aggregate({
      where: { campaignId: campaign.id },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.bankTransaction.findMany({
      where: {
        campaignId: campaign.id,
      },
      select: {
        id: true,
        transactionDate: true,
        createdAt: true,
        statementRow: true,
        description: true,
        debitAmount: true,
        creditAmount: true,
        outflowType: true,
        refundLinks: {
          select: {
            amount: true,
            originalTransaction: {
              select: { transactionDate: true, description: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        receivedRefundLinks: {
          where: { refundTransaction: { campaignId: campaign.id } },
          select: {
            amount: true,
            refundTransaction: {
              select: { transactionDate: true, description: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { statementRow: "desc" }],
      take: 1000,
    }),
    prisma.transactionAllocation.findMany({
      where: { campaignId: campaign.id },
      select: {
        id: true,
        amount: true,
        transaction: {
          select: {
            transactionDate: true,
            createdAt: true,
            statementRow: true,
            description: true,
            receivedRefundLinks: {
              where: { refundTransaction: { campaignId: campaign.id } },
              select: {
                amount: true,
                refundTransaction: {
                  select: { transactionDate: true, description: true },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
      orderBy: { transaction: { transactionDate: "desc" } },
      take: 1000,
    }),
    loadPublicCampaignBills(campaign.id),
    prisma.bankTransaction.findMany({
      where: { campaignId: campaign.id, outflowType: "DONATION", debitAmount: { gt: 0 } },
      select: { id: true, description: true, debitAmount: true, transactionDate: true },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { statementRow: "desc" }],
    }),
  ]);

  const grossIncome =
    decimalToNumber(transactionSums._sum.creditAmount) +
    decimalToNumber(allocationSums._sum.amount);
  const expenses = decimalToNumber(transactionSums._sum.debitAmount);
  const refunds = decimalToNumber(refundSums._sum.debitAmount);
  const income = grossIncome - refunds;
  const publicTransactions: PublicCampaignTransaction[] = [
    ...transactions.map((transaction) => ({
      id: transaction.id,
      transactionDate: transaction.transactionDate.toISOString(),
      createdAt: transaction.createdAt.toISOString(),
      statementRow: transaction.statementRow,
      description: redactPhoneNumbers(transaction.description),
      debitAmount: decimalToNumber(transaction.debitAmount),
      creditAmount: decimalToNumber(transaction.creditAmount),
      outflowType: transaction.outflowType,
      refundLinks: transaction.creditAmount.greaterThan(0)
        ? transaction.receivedRefundLinks.map((link) => ({
            amount: decimalToNumber(link.amount),
            transactionDate: link.refundTransaction.transactionDate.toISOString(),
            description: redactPhoneNumbers(link.refundTransaction.description),
          }))
        : transaction.refundLinks.map((link) => ({
            amount: decimalToNumber(link.amount),
            transactionDate: link.originalTransaction.transactionDate.toISOString(),
            description: redactPhoneNumbers(link.originalTransaction.description),
          })),
    })),
    ...allocations.map((allocation) => ({
      id: allocation.id,
      transactionDate: allocation.transaction.transactionDate.toISOString(),
      createdAt: allocation.transaction.createdAt.toISOString(),
      statementRow: allocation.transaction.statementRow,
      description: redactPhoneNumbers(allocation.transaction.description),
      debitAmount: 0,
      creditAmount: decimalToNumber(allocation.amount),
      outflowType: "DONATION" as const,
      refundLinks: allocation.transaction.receivedRefundLinks.map((link) => ({
        amount: decimalToNumber(link.amount),
        transactionDate: link.refundTransaction.transactionDate.toISOString(),
        description: redactPhoneNumbers(link.refundTransaction.description),
      })),
    })),
  ]
    .sort((left, right) => {
      const dateDifference =
        new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime();
      if (dateDifference !== 0) return dateDifference;
      const createdDifference =
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      if (createdDifference !== 0) return createdDifference;
      return (right.statementRow ?? 0) - (left.statementRow ?? 0);
    })
    .slice(0, 1000);

  return {
    code: campaign.code,
    name: campaign.name,
    description: campaign.description,
    status: campaign.status,
    income,
    expenses,
    refunds,
    balance: income - expenses,
    transactionCount: transactionSums._count + allocationSums._count,
    transactions: publicTransactions,
    donations: donations.map((transaction) => ({
      id: transaction.id,
      title: redactPhoneNumbers(transaction.description),
      amount: decimalToNumber(transaction.debitAmount),
      transactionDate: transaction.transactionDate.toISOString(),
    })),
    bills: bills.map((bill) => ({
      transactionId: bill.transactionId,
      title: bill.title ? redactPhoneNumbers(bill.title) : null,
      id: bill.id,
      originalName: bill.originalName,
      createdAt: bill.createdAt.toISOString(),
    })),
  };
}

export function getCachedPublicCampaignData(code: string) {
  const normalizedCode = makeCampaignCode(code);
  return unstable_cache(
    () => getPublicCampaignData(normalizedCode),
    ["public-campaign-data", PUBLIC_CAMPAIGN_DATA_CACHE_VERSION, normalizedCode],
    { revalidate: 60, tags: [publicCampaignTag(normalizedCode)] },
  )();
}

export function invalidatePublicCampaignCache(codes: Iterable<string | null | undefined>) {
  const normalizedCodes = new Set(
    [...codes].filter((code): code is string => Boolean(code)).map(makeCampaignCode),
  );

  for (const code of normalizedCodes) {
    revalidateTag(publicCampaignTag(code), { expire: 0 });
  }

  return [...normalizedCodes];
}

export async function warmPublicCampaignCaches(codes: Iterable<string>) {
  const normalizedCodes = [...new Set([...codes].map(makeCampaignCode))];
  // Imports can affect many campaigns. Warm them sequentially so refreshing the
  // public cache does not create a burst of database connections.
  for (const code of normalizedCodes) {
    await getCachedPublicCampaignMeta(code);
    await getCachedPublicCampaignData(code);
  }
}
