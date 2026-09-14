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

type EnterpriseClient = {
  setCredential: (providerID: string, auth: unknown) => Promise<unknown>
  removeCredential: (providerID: string) => Promise<unknown>
  dispose: () => Promise<unknown>
}

export async function enterpriseLogin(
  client: EnterpriseClient,
  openExternal: (url: string) => void,
  baseUrl: string,
  onProgress: (stage: "starting" | "waiting") => void,
): Promise<EnterpriseState> {
  const url = baseUrl.replace(/\/+$/, "")
  const wellknown = (await fetch(`${url}/.well-known/opencode`).then((response) => {
    if (!response.ok) throw new Error(`cannot reach ${url}`)
    return response.json()
  })) as { auth?: { env?: string } }
  const credentialKey = wellknown.auth?.env ?? "CORP_TOKEN"

  onProgress("starting")
  const device = await fetch(`${url}/login/device`, { method: "POST" }).then((response) => {
    if (!response.ok) throw new Error(`login start failed (${response.status})`)
    return response.text()
  })
  const { session, open, interval } = parseDeviceResponse(device)
  if (!session || !open) throw new Error("invalid login session from server")

  onProgress("waiting")
  openExternal(open)
  const deadline = Date.now() + 15 * 60_000
  for (;;) {
    if (Date.now() > deadline) throw new Error("login timed out")
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, interval) * 1000))
    const poll = await fetch(`${url}/login/session/${session}`).then((response) => response.text())
    if (poll.startsWith("error:")) throw new Error(poll.slice("error:".length))
    const { token, email } = parsePollResponse(poll)
    if (token) {
      await client.setCredential(url, { type: "wellknown", key: credentialKey, token })
      await client.dispose().catch(() => undefined)
      const state = { url, email: email ?? "" }
      writeEnterprise(state)
      return state
    }
  }
}

export async function enterpriseLogout(client: EnterpriseClient) {
  const state = readEnterprise()
  writeEnterprise(undefined)
  if (!state) return
  await client.removeCredential(state.url).catch(() => undefined)
  await client.dispose().catch(() => undefined)
}