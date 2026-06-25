import { skaVersion } from "@ska/shared";

export const extensionAppInfo = {
  name: "@ska/extension",
  displayName: "Browser Code Extension",
  stage: 0,
  version: skaVersion
} as const;

const actionLabels = [
  "保存当前网页",
  "总结当前视频",
  "扫描页面资源",
  "保存选中文本",
  "搜索知识库"
] as const;

export function App() {
  return (
    <main>
      <h1>Browser Code</h1>
      <p>Stage 0 placeholder UI. No capture or bridge behavior is implemented yet.</p>
      <ul>
        {actionLabels.map((label) => (
          <li key={label}>
            <button type="button" disabled>
              {label}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
