import { PageHead } from "@/components/PageHead";

export default function DashboardPage() {
  return (
    <>
      <PageHead title="总览" desc="录制 → 拖进清清 → 审核。其余交给清清。" />
      <section className="panel">
        <h2>一条内容走完的全流程</h2>
        <p className="text-muted">还没有内容。去「上传新内容」拖入视频、音频或长文本。</p>
      </section>
    </>
  );
}
