import { describe, expect, test } from "bun:test"
import { parseDeviceResponse, parsePollResponse, DEFAULT_ENTERPRISE_URL } from "./enterprise-utils"
import { readEnterprise, writeEnterprise } from "./enterprise-utils"
import { enterpriseLogout } from "./enterprise-utils"

describe("enterpriseLogout", () => {
  test("clears stored state, removes credential, then disposes — and never throws", async () => {
    writeEnterprise({ url: "https://opencode.circuitry.ai", email: "user@example.com" })
    const calls: string[] = []
    const client = {
      setCredential: async () => {},
      removeCredential: async () => {
        calls.push("remove")
        throw new Error("network down")
      },
      dispose: async () => {
        calls.push("dispose")
      },
    }

    await enterpriseLogout(client)

    expect(readEnterprise()).toBeUndefined()
    expect(calls).toEqual(["remove", "dispose"])
  })

  test("no-op when not signed in", async () => {
    writeEnterprise(undefined)
    let removed = false
    const client = {
      setCredential: async () => {},
      removeCredential: async () => (removed = true),
      dispose: async () => {},
    }
    await enterpriseLogout(client)
    expect(removed).toBeFalse()
  })
})

describe("enterprise state persistence", () => {
  test("round-trips through localStorage", () => {
    writeEnterprise({ url: "https://opencode.circuitry.ai", email: "user@example.com" })
    expect(readEnterprise()).toEqual({ url: "https://opencode.circuitry.ai", email: "user@example.com" })

    writeEnterprise(undefined)
    expect(readEnterprise()).toBeUndefined()
  })

  test("corrupt stored state is ignored", () => {
    localStorage.setItem("opencode-enterprise", "{not json")
    expect(readEnterprise()).toBeUndefined()
    localStorage.removeItem("opencode-enterprise")
  })
})

describe("parseDeviceResponse", () => {
  test("parses session, open url, and interval", () => {
    const parsed = parseDeviceResponse("SESSION=abc-123\nOPEN=https://auth.example/activate?user_code=XY\nINTERVAL=5")
    expect(parsed.session).toBe("abc-123")
    expect(parsed.open).toBe("https://auth.example/activate?user_code=XY")
    expect(parsed.interval).toBe(5)
  })

  test("defaults interval to 2 and leaves missing fields undefined", () => {
    const parsed = parseDeviceResponse("SESSION=abc")
    expect(parsed.session).toBe("abc")
    expect(parsed.open).toBeUndefined()
    expect(parsed.interval).toBe(2)
  })
})

describe("parsePollResponse", () => {
  test("extracts token and email lines", () => {
    const parsed = parsePollResponse("token:0123456789abcdef\nEMAIL:user@example.com")
    expect(parsed.token).toBe("0123456789abcdef")
    expect(parsed.email).toBe("user@example.com")
  })

  test("token ignores extra lines after the token line", () => {
    const parsed = parsePollResponse("token:secret-token\nEMAIL:x@example.com\nanything else")
    expect(parsed.token).toBe("secret-token")
  })

  test("pending responses have no token", () => {
    const parsed = parsePollResponse("pending")
    expect(parsed.token).toBeUndefined()
  })
})

test("default enterprise url is the production control plane", () => {
  expect(DEFAULT_ENTERPRISE_URL).toBe("https://opencode.circuitry.ai")
})