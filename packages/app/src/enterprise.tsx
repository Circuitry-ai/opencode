import { createSignal, Show, type Component } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useServerSDK } from "@/context/server-sdk"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@/utils/toast"

export { DEFAULT_ENTERPRISE_URL, parseDeviceResponse, parsePollResponse, readEnterprise, writeEnterprise, enterpriseLogin, enterpriseLogout, type EnterpriseState } from "./enterprise-utils"
import { DEFAULT_ENTERPRISE_URL, readEnterprise, enterpriseLogin, enterpriseLogout, type EnterpriseState } from "./enterprise-utils"

type DesktopBridge = { api?: { downloadEnterprisePlugin?: (url: string) => Promise<boolean> } }

async function installEnterprisePlugin(url: string) {
  const bridge = (globalThis as DesktopBridge).api
  await bridge?.downloadEnterprisePlugin?.(url)
}

function enterpriseClient(serverSDK: ReturnType<typeof useServerSDK>) {
  return {
    setCredential: (providerID: string, auth: unknown) => serverSDK().client.auth.set({ providerID, auth: auth as never }),
    removeCredential: (providerID: string) => serverSDK().client.auth.remove({ providerID }),
    dispose: () => serverSDK().client.global.dispose(),
  }
}

async function login(
  serverSDK: ReturnType<typeof useServerSDK>,
  platform: ReturnType<typeof usePlatform>,
  url: string,
  onProgress: (stage: "starting" | "waiting") => void,
): Promise<EnterpriseState> {
  const state = await enterpriseLogin(enterpriseClient(serverSDK), (open) => platform.openExternal(open), url, onProgress)
  await installEnterprisePlugin(url).catch(() => undefined)
  return state
}

export const DialogEnterpriseLogin: Component<{ onDone: (email: string) => void }> = (props) => {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const dialog = useDialog()
  const [stage, setStage] = createSignal<"idle" | "starting" | "waiting">("idle")
  const [error, setError] = createSignal("")
  const [server, setServer] = createSignal(readEnterprise()?.url ?? DEFAULT_ENTERPRISE_URL)
  const [openUrl, setOpenUrl] = createSignal("")

  const start = async () => {
    setError("")
    try {
      const state = await login(serverSDK, platform, server(), setStage)
      showToast({ variant: "success", icon: "circle-check", title: language.t("enterprise.login.success") })
      props.onDone(state.email)
      dialog.close()
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
            <div class="flex items-center gap-3">
              <Spinner class="size-4 shrink-0 text-v2-icon-icon-muted" />
              <span class="text-14-regular text-text-base">{language.t("enterprise.login.waiting")}</span>
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

export const DialogSignOutConfirm: Component<{ onConfirm: () => Promise<void> | void }> = (props) => {
  const language = useLanguage()
  const dialog = useDialog()
  const [busy, setBusy] = createSignal(false)

  return (
    <Dialog title={language.t("enterprise.signOut.confirm.title")} description={language.t("enterprise.signOut.confirm.description")}>
      <div class="flex justify-end items-center gap-2 p-4">
        <Button size="large" variant="secondary" disabled={busy()} onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button
          size="large"
          disabled={busy()}
          onClick={() => {
            setBusy(true)
            void (async () => {
              try {
                await props.onConfirm()
              } finally {
                dialog.close()
              }
            })()
          }}
        >
          <Show when={busy()} fallback={language.t("enterprise.signOut")}>
            <span class="flex items-center gap-2">
              <Spinner class="size-4" />
              {language.t("enterprise.signOut.busy")}
            </span>
          </Show>
        </Button>
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
  const [signingOut, setSigningOut] = createSignal(false)

  const confirmSignOut = () => {
    void dialog.show(() => (
      <DialogSignOutConfirm
        onConfirm={async () => {
          setSigningOut(true)
          try {
            await enterpriseLogout(enterpriseClient(serverSDK))
            setState(undefined)
          } finally {
            setSigningOut(false)
          }
        }}
      />
    ))
  }

  return (
    <Show
      when={state()}
      fallback={
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
      }
    >
      {(current) => (
        <div class={HOME_NAV_ROW}>
          <Show
            when={!signingOut()}
            fallback={
              <>
                <Spinner class="size-3.5 shrink-0 text-v2-icon-icon-muted" />
                <span class={HOME_NAV_LABEL}>{language.t("enterprise.signOut.busy")}</span>
              </>
            }
          >
            <span class="size-2 shrink-0 rounded-full bg-[var(--status-color-success, #3fb950)]" />
            <span class={HOME_NAV_LABEL} title={current().email || current().url}>
              {language.t("enterprise.signedInAs")}{" "}
              <span class="text-v2-text-text-base">{current().email || current().url}</span>
            </span>
            <button
              type="button"
              class="text-12-regular text-v2-text-text-faint hover:text-v2-text-text-base shrink-0 cursor-default"
              onClick={confirmSignOut}
            >
              {language.t("enterprise.signOut")}
            </button>
          </Show>
        </div>
      )}
    </Show>
  )
}

export const EnterpriseBadge: Component = () => {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const dialog = useDialog()
  const [state, setState] = createSignal(readEnterprise())
  const [signingOut, setSigningOut] = createSignal(false)

  const confirmSignOut = () => {
    void dialog.show(() => (
      <DialogSignOutConfirm
        onConfirm={async () => {
          setSigningOut(true)
          try {
            await enterpriseLogout(enterpriseClient(serverSDK))
            setState(undefined)
          } finally {
            setSigningOut(false)
          }
        }}
      />
    ))
  }

  return (
    <Show
      when={state()}
      fallback={
        <div class="flex items-center justify-between w-full px-3 py-1">
          <span class="text-12-regular text-text-weak">{language.t("enterprise.title")}</span>
          <Button
            size="large"
            variant="ghost"
            onClick={() =>
              void dialog.show(() => (
                <DialogEnterpriseLogin
                  onDone={() => setState(readEnterprise() ?? { url: DEFAULT_ENTERPRISE_URL, email: "" })}
                />
              ))
            }
          >
            {language.t("enterprise.signIn")}
          </Button>
        </div>
      }
    >
      {(current) => (
        <div class="flex items-center justify-between w-full px-3 py-1">
          <div class="flex items-center gap-2 min-w-0">
            <Show
              when={!signingOut()}
              fallback={<Spinner class="size-3 shrink-0 text-v2-icon-icon-muted" />}
            >
              <span class="size-2 rounded-full bg-[var(--status-color-success, #3fb950)]" />
            </Show>
            <span class="text-12-regular text-text-base truncate">
              {signingOut()
                ? language.t("enterprise.signOut.busy")
                : `${language.t("enterprise.signedInAs")} ${current().email || current().url}`}
        </span>
      </div>
      <Button size="large" variant="ghost" disabled={signingOut()} onClick={confirmSignOut}>
        {language.t("enterprise.signOut")}
      </Button>
        </div>
      )}
    </Show>
  )
}