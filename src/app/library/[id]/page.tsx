import { PageHead } from "@/components/PageHead";

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PageHead title="内容详情" eyebrow={`Source ${id}`} desc="粗剪、文案、长文、封面、合规会在这里分标签展示。" />;
}
