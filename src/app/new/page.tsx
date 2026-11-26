import { PageHead } from "@/components/PageHead";

export default function NewSourcePage() {
  return (
    <>
      <PageHead title="上传新内容" desc="视频、音频、长文本都可以，不用先剪。清清会自动识别。" />
      <section className="panel" style={{ maxWidth: 560 }}>
        <div className="drop">即将支持：拖入文件或粘贴长文本</div>
      </section>
    </>
  );
}
