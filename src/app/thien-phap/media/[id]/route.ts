import { getPrisma, withDatabaseReadRetry } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const prisma = getPrisma();
  const bill = await withDatabaseReadRetry(() => prisma.campaignBill.findUnique({
    where: { id },
    select: { imageData: true, mimeType: true, createdAt: true },
  }));

  if (!bill) {
    return new Response("Không tìm thấy ảnh.", { status: 404 });
  }

  return new Response(new Uint8Array(bill.imageData), {
    headers: {
      "Content-Type": bill.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Last-Modified": bill.createdAt.toUTCString(),
    },
  });
}
