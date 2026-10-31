import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { invalidatePublicCampaignCache } from "@/lib/public-campaign";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BILL_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_BILLS_PER_DONATION = 30;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const prisma = getPrisma();
    const bills = await prisma.campaignBill.findMany({
      where: { campaignId: id },
      select: {
        id: true,
        originalName: true,
        transactionId: true,
        title: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      bills: bills.map((bill) => ({ ...bill, createdAt: bill.createdAt.toISOString() })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Vui lòng chọn một hình ảnh bill." }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP." }, { status: 415 });
    }
    if (file.size <= 0 || file.size > MAX_BILL_SIZE_BYTES) {
      return NextResponse.json({ error: "Mỗi ảnh bill không được lớn hơn 4 MB." }, { status: 413 });
    }

    const transactionId = String(formData.get("transactionId") ?? "");
    const title = String(formData.get("title") ?? "").trim().slice(0, 255);
    const prisma = getPrisma();
    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: transactionId, campaignId: id, outflowType: "DONATION", debitAmount: { gt: 0 } },
      select: { id: true },
    });
    if (!transaction || !title) {
      return NextResponse.json({ error: "Vui lòng chọn khoản cúng dường hợp lệ và nhập tên khoản cúng dường." }, { status: 400 });
    }
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { code: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Không tìm thấy thiện pháp." }, { status: 404 });
    }
    const billCount = await prisma.campaignBill.count({ where: { campaignId: id, transactionId } });
    if (billCount >= MAX_BILLS_PER_DONATION) {
      return NextResponse.json({ error: `Mỗi khoản cúng dường được lưu tối đa ${MAX_BILLS_PER_DONATION} ảnh bill.` }, { status: 409 });
    }

    const bill = await prisma.campaignBill.create({
      data: {
        campaignId: id,
        transactionId,
        title,
        originalName: file.name.slice(0, 255) || "bill",
        mimeType: file.type,
        sizeBytes: file.size,
        imageData: new Uint8Array(await file.arrayBuffer()),
      },
      select: { id: true, originalName: true,
        transactionId: true,
        title: true, mimeType: true, sizeBytes: true, createdAt: true },
    });

    invalidatePublicCampaignCache([campaign.code]);

    return NextResponse.json(
      { bill: { ...bill, createdAt: bill.createdAt.toISOString() } },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
