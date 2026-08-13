import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type GateSession = { unlocked?: boolean };

function sessionConfig() {
  return {
    // useSession requires a key of at least 32 chars; derive one so a short
    // SESSION_SECRET fails the check below instead of throwing here.
    password: createHash("sha256").update(process.env["SESSION_SECRET"] ?? "", "utf8").digest("hex"),
    name: "staff-gate",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export const isUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const session = await useSession<GateSession>(sessionConfig());
    return session.data.unlocked === true;
  } catch {
    return false;
  }
});

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const missing = [
      ...(!process.env["STAFF_SITE_PASSWORD"] ? ["STAFF_SITE_PASSWORD"] : []),
      ...(!process.env["SESSION_SECRET"] ? ["SESSION_SECRET"] : []),
    ];
    if (missing.length) {
      return { ok: false as const, reason: `Server config missing: ${missing.join(", ")}` };
    }
    // Trim the env value -- pasted secrets often carry trailing whitespace.
    const expected = process.env["STAFF_SITE_PASSWORD"]!.trim();
    if (!passwordMatches(data.password ?? "", expected)) {
      return { ok: false as const, reason: "Incorrect password. Please try again." };
    }
    const session = await useSession<GateSession>(sessionConfig());
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});
