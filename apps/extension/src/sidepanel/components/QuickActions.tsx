export type QuickAction = {
  key: string;
  label: string;
  promptHint: string;
  taskType: "save_page" | "summarize_video" | "scan_resources" | "save_selection" | "search_vault";
};

/** 5 MVP buttons per 03_浏览器侧边栏插件模块.md */
export const ACTIONS: QuickAction[] = [
  { key: "save_page", label: "保存网页", promptHint: "保存当前网页内容到知识库", taskType: "save_page" },
  { key: "summarize_video", label: "总结视频", promptHint: "总结当前页面中的视频内容", taskType: "summarize_video" },
  { key: "scan_resources", label: "扫描资源", promptHint: "扫描当前页面的可下载资源", taskType: "scan_resources" },
  { key: "save_selection", label: "保存选中", promptHint: "保存当前页面中选中的文本", taskType: "save_selection" },
  { key: "search_vault", label: "搜索知识库", promptHint: "搜索知识库中的内容", taskType: "search_vault" },
];

type Props = {
  disabled: boolean;
  onAction: (action: QuickAction) => void;
};

/** Horizontal row of quick-action chips. */
export function QuickActions({ disabled, onAction }: Props) {
  return (
    <div className="quick-actions">
      {ACTIONS.map((action) => (
        <button
          key={action.key}
          type="button"
          disabled={disabled}
          onClick={() => onAction(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
