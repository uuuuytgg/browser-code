import type { QuickAction } from "./QuickActions";

/* Inline Lucide icons */
const SaveIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
  </svg>
);

const VideoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" /><rect width="15" height="14" x="1" y="6" rx="2" ry="2" />
  </svg>
);

const ScanIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M8 11h6" /><path d="M11 8v6" />
  </svg>
);

const TextIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);

export type QuickAction = {
  key: string;
  label: string;
  promptHint: string;
  taskType: "save_page" | "summarize_video" | "scan_resources" | "save_selection" | "search_vault";
};

export const ACTIONS: QuickAction[] = [
  { key: "save_page", label: "保存网页", promptHint: "保存当前网页内容到知识库", taskType: "save_page" },
  { key: "summarize_video", label: "总结视频", promptHint: "总结当前页面中的视频内容", taskType: "summarize_video" },
  { key: "scan_resources", label: "扫描资源", promptHint: "扫描当前页面的可下载资源", taskType: "scan_resources" },
  { key: "save_selection", label: "保存选中", promptHint: "保存当前页面中选中的文本", taskType: "save_selection" },
  { key: "search_vault", label: "搜索知识库", promptHint: "搜索知识库中的内容", taskType: "search_vault" },
];

const ACTION_ICONS: Record<string, React.FC> = {
  save_page: SaveIcon,
  summarize_video: VideoIcon,
  scan_resources: ScanIcon,
  save_selection: TextIcon,
  search_vault: SearchIcon,
};

type Props = {
  disabled: boolean;
  onAction: (action: QuickAction) => void;
};

export function QuickActions({ disabled, onAction }: Props) {
  return (
    <div className="quick-actions">
      {ACTIONS.map((action) => {
        const Icon = ACTION_ICONS[action.key];
        return (
          <button
            key={action.key}
            type="button"
            disabled={disabled}
            onClick={() => onAction(action)}
          >
            {Icon && <Icon />}
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
