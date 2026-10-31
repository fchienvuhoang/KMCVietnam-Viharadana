import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { importBankStatement } from "@/lib/importer";
import {
  invalidatePublicCampaignCache,
  warmPublicCampaignCaches,
} from "@/lib/public-campaign";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const uploadedAt = new Date();

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Vui lòng chọn file PDF sao kê MB." }, { status: 400 });
    }

    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "File sao kê tối đa 4 MB." }, { status: 400 });
    }
    if (!/\.pdf$/i.test(file.name)) {
      return NextResponse.json({ error: "Chỉ hỗ trợ file PDF sao kê MB." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importBankStatement(file.name, buffer, uploadedAt);
    const affectedCodes = invalidatePublicCampaignCache(result.affectedCampaignCodes);
    await warmPublicCampaignCaches(affectedCodes);

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
