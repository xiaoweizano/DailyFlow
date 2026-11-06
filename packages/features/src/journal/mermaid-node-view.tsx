import { renderMermaidToSvg } from "@dailyflow/editor";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";

interface MermaidRenderState {
  readonly svg: string | null;
  readonly error: string | null;
}

export function MermaidNodeView({ node }: NodeViewProps): React.JSX.Element {
  const code = typeof node.attrs.code === "string" ? node.attrs.code : "";
  const [renderState, setRenderState] = useState<MermaidRenderState>({
    svg: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setRenderState({ svg: null, error: null });

    if (code.trim().length === 0) {
      setRenderState({ svg: null, error: "Mermaid 图表内容为空" });
      return () => {
        active = false;
      };
    }

    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "default";
    void renderMermaidToSvg(code, theme)
      .then((svg) => {
        if (active) {
          setRenderState({ svg, error: null });
        }
      })
      .catch(() => {
        if (active) {
          setRenderState({ svg: null, error: "Mermaid 图表语法有误，已显示源码。" });
        }
      });

    return () => {
      active = false;
    };
  }, [code]);

  return (
    <NodeViewWrapper
      className="dailyflow-mermaid-block"
      data-type="mermaid-block"
      contentEditable={false}
    >
      {renderState.svg === null ? (
        <pre aria-label="Mermaid 图表源码">
          <code>{code}</code>
        </pre>
      ) : (
        <div
          className="dailyflow-mermaid-diagram"
          aria-label="Mermaid 图表"
          dangerouslySetInnerHTML={{ __html: renderState.svg }}
        />
      )}
      {renderState.error === null ? null : (
        <p className="dailyflow-mermaid-error">{renderState.error}</p>
      )}
    </NodeViewWrapper>
  );
}
