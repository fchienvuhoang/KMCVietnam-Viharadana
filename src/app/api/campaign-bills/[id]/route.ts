import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { invalidatePublicCampaignCache } from "@/lib/public-campaign";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const prisma = getPrisma();
    const bill = await prisma.campaignBill.findUnique({
      where: { id },
      select: { campaign: { select: { code: true } } },
    });
    if (!bill) {
      return NextResponse.json({ error: "Không tìm thấy ảnh bill." }, { status: 404 });
    }

    await prisma.campaignBill.delete({ where: { id } });
    invalidatePublicCampaignCache([bill.campaign.code]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
