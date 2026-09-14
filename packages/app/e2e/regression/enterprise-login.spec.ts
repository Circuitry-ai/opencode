import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"
import { trackPageErrors } from "../utils/errors"

// End-to-end enterprise login/logout against a fully mocked stack:
// - the opencode server is mocked by mockOpenCodeServer (auth.set/auth.remove observed)
// - the control plane is mocked via page.route (well-known + device flow)
// Runs locally in ~seconds: cd packages/app && bunx playwright test e2e/regression/enterprise-login.spec.ts

const directory = "/tmp/e2e-enterprise-project"
const ENTERPRISE = "https://opencode.circuitry.ai"

test("enterprise sign in and sign out from the home sidebar", async ({ page }) => {
  test.setTimeout(120_000)
  const consoleErrors = trackPageErrors(page)

  const connects: Array<{ integrationID: string; body: unknown }> = []
  const disconnects: string[] = []
  let deviceRequests = 0
  let pollRequests = 0

  await page.route(`**${new URL(ENTERPRISE).host}**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/.well-known/opencode") {
      return route.fulfill({
        json: {
          auth: { command: ["curl", "-fsS", `${ENTERPRISE}/login/dev`], env: "CORP_TOKEN" },
          remote_config: { url: `${ENTERPRISE}/config`, headers: { Authorization: "Bearer {env:CORP_TOKEN}" } },
        },
      })
    }
    if (url.pathname === "/login/device" && route.request().method() === "POST") {
      deviceRequests++
      return route.fulfill({
        body: `SESSION=e2e-session\nOPEN=${ENTERPRISE}/login/mock/e2e-session\nINTERVAL=1`,
        headers: { "content-type": "text/plain" },
      })
    }
    if (url.pathname === "/login/session/e2e-session") {
      pollRequests++
      return route.fulfill({
        body: "token:e2e-token-0123456789abcdef\nEMAIL:e2e-user@circuitry.ai",
        headers: { "content-type": "text/plain" },
      })
    }
    return route.fulfill({ status: 404, json: { error: "unexpected control plane call", path: url.pathname } })
  })

  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "proj_enterprise_e2e",
      worktree: directory,
      vcs: "git",
      name: "enterprise-e2e",
      time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
      sandboxes: [],
    },
    provider: () => ({
      all: [
        {
          id: "openrouter",
          name: "OpenRouter",
          models: {
            "e2e-model": {
              id: "e2e-model",
              name: "E2E Model",
              cost: { input: 1, output: 1 },
              limit: { context: 200_000 },
            },
          },
        },
      ],
      connected: [],
      default: { providerID: "openrouter", modelID: "e2e-model" },
    }),
    onConnectKey: (input) => connects.push(input),
    onDisconnectKey: (providerID) => disconnects.push(providerID),
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })

  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
    localStorage.setItem("opencode.global.dat:server", JSON.stringify({ projects: { local: [] } }))
  })
  await page.addInitScript(() => localStorage.removeItem("opencode-enterprise"))

  await page.goto("/")

  // Sign in from the home sidebar (below the Settings button)
  const signIn = page.getByRole("button", { name: "Sign in with company server" })
  await expectAppVisible(signIn)
  await signIn.click()

  const dialog = page.locator('[data-slot="dialog-content"]')
  await expectAppVisible(dialog)
  await dialog.getByRole("button", { name: "Continue in browser" }).click()

  // The mocked poll completes immediately; the row flips to the signed-in state
  const signedIn = page.getByText("Signed in as")
  await expect(signedIn).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("e2e-user@circuitry.ai")).toBeVisible()

  // The credential was stored through the opencode server auth API
  expect(deviceRequests).toBe(1)
  expect(pollRequests).toBeGreaterThanOrEqual(1)
  expect(connects).toEqual([
    {
      integrationID: encodeURIComponent(ENTERPRISE),
      body: { type: "wellknown", key: "CORP_TOKEN", token: "e2e-token-0123456789abcdef" },
    },
  ])
  const stored = await page.evaluate(() => localStorage.getItem("opencode-enterprise"))
  expect(JSON.parse(stored!)).toEqual({ url: ENTERPRISE, email: "e2e-user@circuitry.ai" })

  // Sign out: confirmation dialog, busy state, then back to signed out
  const signOut = page.getByRole("button", { name: "Sign out" }).first()
  await signOut.click()
  const confirm = page.locator('[data-slot="dialog-content"]')
  await expectAppVisible(confirm)
  await expect(confirm.getByText("Sign out of company server?")).toBeVisible()
  await confirm.getByRole("button", { name: "Sign out" }).click()

  await expect(page.getByRole("button", { name: "Sign in with company server" })).toBeVisible({ timeout: 30_000 })
  expect(disconnects).toEqual([encodeURIComponent(ENTERPRISE)])
  const cleared = await page.evaluate(() => localStorage.getItem("opencode-enterprise"))
  expect(cleared).toBeNull()

  // No renderer crashes anywhere in the flow
  expect(consoleErrors).toEqual([])
})