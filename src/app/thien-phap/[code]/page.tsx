import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCampaignView } from "@/components/public-campaign-view";
import { getCachedPublicCampaignData, getCachedPublicCampaignMeta } from "@/lib/public-campaign";

type Props = {
  params: Promise<{
    code: string;
  }>;
};

export const revalidate = 60;
export const dynamic = "force-static";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const data = await getCachedPublicCampaignMeta(code);

  if (!data) {
    return {
      title: "Không tìm thấy thiện pháp",
    };
  }

  return {
    title: `${data.name} | Thiện pháp`,
    description: data.description ?? `Theo dõi thu chi thiện pháp ${data.code}.`,
  };
}

export default async function PublicCampaignPage({ params }: Props) {
  const { code } = await params;
  const data = await getCachedPublicCampaignData(code);

  if (!data) {
    notFound();
  }

  return <PublicCampaignView data={data} />;
}
