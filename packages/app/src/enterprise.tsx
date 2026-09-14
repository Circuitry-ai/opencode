import { createSignal, Show, type Component } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { useServerSDK } from "@/context/server-sdk"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@/utils/toast"

export { DEFAULT_ENTERPRISE_URL, parseDeviceResponse, parsePollResponse, readEnterprise, writeEnterprise, type EnterpriseState } from "./enterprise-utils"
import { DEFAULT_ENTERPRISE_URL, parseDeviceResponse, parsePollResponse, readEnterprise, writeEnterprise, type EnterpriseState } from "./enterprise-utils"

type DesktopBridge = { api?: { downloadEnterprisePlugin?: (url: string) => Promise<boolean> } }

async function installEnterprisePlugin(url: string) {
  const bridge = (globalThis as DesktopBridge).api
  await bridge?.downloadEnterprisePlugin?.(url)
}

export async function enterpriseLogin(
  serverSDK: ReturnType<typeof useServerSDK>,
  platform: ReturnType<typeof usePlatform>,
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
  platform.openExternal(open)
  const deadline = Date.now() + 15 * 60_000
  for (;;) {
    if (Date.now() > deadline) throw new Error("login timed out")
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, interval) * 1000))
    const poll = await fetch(`${url}/login/session/${session}`).then((response) => response.text())
    if (poll.startsWith("error:")) throw new Error(poll.slice("error:".length))
    const { token, email } = parsePollResponse(poll)
    if (token) {
      await serverSDK().client.auth.set({ providerID: url, auth: { type: "wellknown", key: credentialKey, token } })
      await serverSDK().client.global.dispose().catch(() => undefined)
      const state = { url, email: email ?? "" }
      writeEnterprise(state)
      await installEnterprisePlugin(url).catch(() => undefined)
      return state
    }
  }
}

export async function enterpriseLogout(serverSDK: ReturnType<typeof useServerSDK>) {
  const state = readEnterprise()
  writeEnterprise(undefined)
  if (!state) return
  await serverSDK()
    .client.auth.remove({ providerID: state.url })
    .catch(() => undefined)
  await serverSDK().client.global.dispose().catch(() => undefined)
}

export const DialogEnterpriseLogin: Component<{ onDone: (email: string) => void }> = (props) => {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const [stage, setStage] = createSignal<"idle" | "starting" | "waiting">("idle")
  const [error, setError] = createSignal("")
  const [server, setServer] = createSignal(readEnterprise()?.url ?? DEFAULT_ENTERPRISE_URL)
  const [openUrl, setOpenUrl] = createSignal("")

  const start = async () => {
    setError("")
    try {
      const state = await enterpriseLogin(serverSDK, platform, server(), setStage)
      showToast({ variant: "success", icon: "circle-check", title: language.t("enterprise.login.success") })
      props.onDone(state.email)
    } catch (err) {
      setStage("idle")
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Dialog title={language.t("enterprise.login.title")} description={language.t("enterprise.login.description")}>
      <div class="flex flex-col gap-4 p-4">
        <div class="flex flex-col gap-1">
          <span class="text-12-regular text-text-weak">{language.t("enterprise.server")}</span>
          <input
            value={server()}
            onInput={(event) => setServer(event.currentTarget.value)}
            disabled={stage() !== "idle"}
            class="text-14-regular text-text-base bg-surface-base border border-border-weak-base rounded-md px-3 py-2"
          />
        </div>
        <Show when={error()}>
          <div class="text-14-regular text-text-error-base">{error()}</div>
        </Show>
        <Show
          when={stage() === "idle"}
          fallback={
            <div class="flex flex-col gap-2">
              <span class="text-14-regular text-text-base">{language.t("enterprise.login.waiting")}</span>
              <Show when={openUrl()}>
                <Button variant="ghost" size="large" onClick={() => openUrl() && platform.openExternal(openUrl())}>
                  {language.t("enterprise.login.reopen")}
                </Button>
              </Show>
            </div>
          }
        >
          <Button
            size="large"
            onClick={() => {
              setOpenUrl("")
              void start()
            }}
          >
            {language.t("enterprise.login.open")}
          </Button>
        </Show>
      </div>
    </Dialog>
  )
}

const HOME_NAV_ROW = `
  flex h-7 min-w-0 w-full shrink-0 items-center gap-2 rounded-[6px] px-1.5 text-left
  text-v2-text-text-muted [font-weight:440] transition-[background-color,color,box-shadow] duration-[120ms] ease-in-out
  hover:bg-v2-background-bg-layer-01 hover:text-v2-text-text-base
`
const HOME_NAV_LABEL = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"

// Home sidebar row (below the Settings button): sign-in button, or signed-in email + sign out.
export const EnterpriseHomeNav: Component = () => {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const dialog = useDialog()
  const [state, setState] = createSignal(readEnterprise())
  const current = state()

  if (!current) {
    return (
      <button
        type="button"
        class={HOME_NAV_ROW}
        onClick={() =>
          void dialog.show(() => (
            <DialogEnterpriseLogin
              onDone={() => setState(readEnterprise() ?? { url: DEFAULT_ENTERPRISE_URL, email: "" })}
            />
          ))
        }
      >
        <span class="size-2 shrink-0 rounded-full bg-v2-icon-icon-muted" />
        <span class={HOME_NAV_LABEL}>{language.t("enterprise.signIn")}</span>
      </button>
    )
  }
  return (
    <div class={HOME_NAV_ROW}>
      <span class="size-2 shrink-0 rounded-full bg-[var(--status-color-success, #3fb950)]" />
      <span class={HOME_NAV_LABEL} title={current.email || current.url}>
        {language.t("enterprise.signedInAs")} <span class="text-v2-text-text-base">{current.email || current.url}</span>
      </span>
      <button
        type="button"
        class="text-12-regular text-v2-text-text-faint hover:text-v2-text-text-base shrink-0 cursor-default"
        onClick={() => {
          void enterpriseLogout(serverSDK)
          setState(undefined)
        }}
      >
        {language.t("enterprise.signOut")}
      </button>
    </div>
  )
}

export const EnterpriseBadge: Component = () => {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const dialog = useDialog()
  const [state, setState] = createSignal(readEnterprise())
  const current = state()

  if (!current) {
    return (
      <div class="flex items-center justify-between w-full px-3 py-1">
        <span class="text-12-regular text-text-weak">{language.t("enterprise.title")}</span>
        <Button
          size="large"
          variant="ghost"
          onClick={() =>
            void dialog.show(() => (
              <DialogEnterpriseLogin onDone={() => setState(readEnterprise() ?? { url: DEFAULT_ENTERPRISE_URL, email: "" })} />
            ))
          }
        >
          {language.t("enterprise.signIn")}
        </Button>
      </div>
    )
  }
  return (
    <div class="flex items-center justify-between w-full px-3 py-1">
      <div class="flex items-center gap-2 min-w-0">
        <span class="size-2 rounded-full bg-[var(--status-color-success, #3fb950)]" />
        <span class="text-12-regular text-text-base truncate">
          {language.t("enterprise.signedInAs")} <span class="font-medium">{current.email || current.url}</span>
        </span>
      </div>
      <Button
        size="large"
        variant="ghost"
        onClick={() => {
          void enterpriseLogout(serverSDK)
          setState(undefined)
        }}
      >
        {language.t("enterprise.signOut")}
      </Button>
    </div>
  )
}