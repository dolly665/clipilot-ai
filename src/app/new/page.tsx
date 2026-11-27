import { PageHead } from "@/components/PageHead";
import { UploadForm } from "./UploadForm";

export default function NewSourcePage() {
  return (
    <>
      <PageHead
        eyebrow="第 1 步"
        title="上传新内容"
        desc="视频、音频、长文本都可以直接拖进来，清清自动认出是哪一种。排版和平台都先替你做好，你只改不对的地方。"
      />
      <div className="grid g-side">
        <section className="panel">
          <UploadForm />
        </section>
        <aside className="grid" style={{ alignContent: "start" }}>
          <section className="panel">
            <h2>三种素材怎么走</h2>
            <div className="row-list" style={{ fontSize: 13 }}>
              <div><div className="t"><b>长文本</b><span>排版 → 公众号、知乎；拆成短帖 → 公众号贴图、小红书图文、微博、YouTube 社区帖</span></div><span className="chip acc">现在可用</span></div>
              <div><div className="t"><b>音频</b><span>去口误 → 播客平台；再整理成长文 → 公众号、知乎</span></div><span className="chip acc">现在可用</span></div>
              <div><div className="t"><b>视频</b><span>粗剪 + 字幕 → 视频平台，再派生播客和长文</span></div><span className="chip">即将接入</span></div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
