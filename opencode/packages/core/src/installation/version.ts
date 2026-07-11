declare global {
  const BROWSER_CODE_VERSION: string
  const BROWSER_CODE_CHANNEL: string
}

export const InstallationVersion = typeof BROWSER_CODE_VERSION === "string" ? BROWSER_CODE_VERSION : "local"
export const InstallationChannel = typeof BROWSER_CODE_CHANNEL === "string" ? BROWSER_CODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
