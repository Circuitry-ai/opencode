export const DEFAULT_ENTERPRISE_URL = "https://opencode.circuitry.ai"

export function parseDeviceResponse(text: string) {
  return {
    session: /^SESSION=(.+)$/m.exec(text)?.[1],
    open: /^OPEN=(.+)$/m.exec(text)?.[1],
    interval: Number(/^INTERVAL=(\d+)$/m.exec(text)?.[1] ?? 2),
  }
}

export function parsePollResponse(text: string) {
  return {
    token: /^token:(.+)$/m.exec(text)?.[1]?.trim(),
    email: /^EMAIL:(.*)$/m.exec(text)?.[1]?.trim(),
  }
}

const STORAGE_KEY = "opencode-enterprise"

export type EnterpriseState = { url: string; email: string }

export function readEnterprise(): EnterpriseState | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as EnterpriseState
    return parsed.url ? parsed : undefined
  } catch {
    return undefined
  }
}

export function writeEnterprise(value: EnterpriseState | undefined) {
  if (!value) localStorage.removeItem(STORAGE_KEY)
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}