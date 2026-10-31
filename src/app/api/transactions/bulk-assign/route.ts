import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import {
  invalidatePublicCampaignCache,
  warmPublicCampaignCaches,
} from "@/lib/public-campaign";

const bulkAssignSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1),
  campaignId: z.string().min(1),
});

export async function PATCH(request: Request) {
  try {
    const parsed = bulkAssignSchema.parse(await request.json());
    const transactionIds = [...new Set(parsed.transactionIds)];
    const prisma = getPrisma();

    const [campaign, transactions] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: parsed.campaignId },
        select: { id: true, code: true },
      }),
      prisma.bankTransaction.findMany({
        where: { id: { in: transactionIds } },
        select: {
          id: true,
          campaignId: true,
          campaign: { select: { code: true } },
          allocations: { select: { campaign: { select: { code: true } } } },
          _count: { select: { receivedRefundLinks: true } },
        },
      }),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: "Không tìm thấy thiện pháp được chọn." }, { status: 404 });
    }
    if (transactions.length !== transactionIds.length) {
      return NextResponse.json({ error: "Một số giao dịch không còn tồn tại. Vui lòng tải lại trang." }, { status: 404 });
    }

    const blockedCount = transactions.filter(
      (transaction) =>
        transaction.campaignId !== campaign.id && transaction._count.receivedRefundLinks > 0,
    ).length;
    if (blockedCount > 0) {
      return NextResponse.json(
        {
          error: `${blockedCount} giao dịch đã liên kết với khoản hoàn nên không thể đổi thiện pháp.`,
        },
        { status: 400 },
      );
    }

    const changedTransactionIds = transactions
      .filter((transaction) => transaction.campaignId !== campaign.id)
      .map((transaction) => transaction.id);

    const result = await prisma.$transaction(async (tx) => {
      if (changedTransactionIds.length > 0) {
        await tx.transactionRefundAllocation.deleteMany({
          where: { refundTransactionId: { in: changedTransactionIds } },
        });
      }
      await tx.transactionAllocation.deleteMany({
        where: { transactionId: { in: transactionIds } },
      });
      return tx.bankTransaction.updateMany({
        where: { id: { in: transactionIds } },
        data: {
          campaignId: campaign.id,
          matchedKeyword: "Gán thủ công",
          classificationStatus: "MANUAL",
        },
      });
    });

    const affectedCodes = invalidatePublicCampaignCache([
      campaign.code,
      ...transactions.flatMap((transaction) => [
        transaction.campaign?.code,
        ...transaction.allocations.map((allocation) => allocation.campaign.code),
      ]),
    ]);
    await warmPublicCampaignCaches(affectedCodes);

    return NextResponse.json({
      updatedCount: result.count,
      campaignCode: campaign.code,
    });
  } catch (error) {
    return apiError(error);
  }
}
