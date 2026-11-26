import { PageHead } from "@/components/PageHead";

export default function ReviewPage() {
  return (
    <>
      <PageHead title="审核" desc="所有生成好、等你过目的内容。没有你的批准，任何内容都不会发布。" />
      <section className="panel" style={{ textAlign: "center", padding: 40 }}>
        <p className="text-muted">没有等待审核的内容。</p>
      </section>
    </>
  );
}
