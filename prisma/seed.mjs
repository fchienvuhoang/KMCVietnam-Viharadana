import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

function normalizeTransferText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Team mới khởi tạo trống; tạo thiện pháp và từ khóa trong trang quản trị.
const campaigns = [];

for (const campaign of campaigns) {
  const saved = await prisma.campaign.upsert({
    where: { code: campaign.code },
    update: {
      name: campaign.name,
      description: campaign.description,
      status: "ACTIVE",
    },
    create: {
      code: campaign.code,
      name: campaign.name,
      description: campaign.description,
      status: "ACTIVE",
    },
  });

  for (const keyword of campaign.keywords) {
    await prisma.campaignKeyword.upsert({
      where: {
        campaignId_normalizedKeyword_matchType: {
          campaignId: saved.id,
          normalizedKeyword: normalizeTransferText(keyword),
          matchType: "CONTAINS",
        },
      },
      update: {
        keyword,
        active: true,
      },
      create: {
        campaignId: saved.id,
        keyword,
        normalizedKeyword: normalizeTransferText(keyword),
        matchType: "CONTAINS",
        active: true,
      },
    });
  }
}

await prisma.$disconnect();
