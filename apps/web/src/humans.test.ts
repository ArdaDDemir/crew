import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  defaultHumans,
  hashInvite,
  humanForToken,
  inviteActor,
  inviteHuman,
  inviteTokenFrom,
  loadHumans,
  publicHumans,
  revokeInvite,
  saveHumans,
} from "./humans";

test("missing humans.json is owner only and is not written", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-humans-"));
  expect(loadHumans(cwd)).toEqual({ ownerId: "human", humans: [] });
  expect(existsSync(join(cwd, ".crew", "humans.json"))).toBe(false);
  expect(defaultHumans()).toEqual({ ownerId: "human", humans: [] });
});

test("invite stores sha256 hex, never the raw token; revoke clears the hash", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-humans-"));
  const invited = inviteHuman(loadHumans(cwd), { id: "arda", handle: "Arda" });
  expect(invited.token.length).toBeGreaterThan(16);
  expect(invited.file.humans[0]?.id).toBe("arda");
  expect(invited.file.humans[0]?.handle).toBe("Arda");
  expect(invited.file.humans[0]?.inviteHash).toBe(
    createHash("sha256").update(invited.token, "utf8").digest("hex"),
  );
  expect(invited.file.humans[0]?.inviteHash).not.toBe(invited.token);
  expect(hashInvite(invited.token)).toBe(invited.file.humans[0]?.inviteHash);
  saveHumans(cwd, invited.file);
  const disk = readFileSync(join(cwd, ".crew", "humans.json"), "utf8");
  expect(disk).toContain("arda");
  expect(disk).not.toContain(invited.token);
  expect(existsSync(join(cwd, ".crew", "config.json"))).toBe(false);

  expect(humanForToken(invited.file, invited.token)?.id).toBe("arda");
  expect(humanForToken(invited.file, "nope")).toBeUndefined();
  expect(publicHumans(invited.file)).toEqual({
    ownerId: "human",
    humans: [{ id: "arda", handle: "Arda", invited: true }],
  });

  const revoked = revokeInvite(invited.file, "arda");
  expect(revoked.humans[0]?.inviteHash).toBe("");
  expect(humanForToken(revoked, invited.token)).toBeUndefined();
  expect(publicHumans(revoked).humans[0]?.invited).toBe(false);
});

test("inviteActor is owner with no token, guest with a valid invite, invalid otherwise", () => {
  const invited = inviteHuman(defaultHumans(), { id: "arda", handle: "Arda" });
  expect(
    inviteActor(new Request("http://127.0.0.1/api/humans"), {}, invited.file),
  ).toBe("owner");
  expect(
    inviteActor(
      new Request("http://127.0.0.1/api/humans", {
        headers: { Authorization: `Bearer ${invited.token}` },
      }),
      {},
      invited.file,
    ),
  ).toBe("guest");
  expect(
    inviteActor(
      new Request("http://127.0.0.1/api/humans", {
        headers: { Authorization: "Bearer nope" },
      }),
      {},
      invited.file,
    ),
  ).toBe("invalid");
});

test("inviteTokenFrom prefers Bearer over body token", () => {
  const req = new Request("http://127.0.0.1/api/say", {
    method: "POST",
    headers: { Authorization: "Bearer abc" },
  });
  expect(inviteTokenFrom(req, { token: "body" })).toBe("abc");
  expect(inviteTokenFrom(new Request("http://127.0.0.1/api/say"), { token: "body" })).toBe(
    "body",
  );
  expect(inviteTokenFrom(new Request("http://127.0.0.1/api/say"), {})).toBe("");
});

test("invite rejects reserved ids including user; loopback owner needs no token", () => {
  const file = defaultHumans();
  expect(() => inviteHuman(file, { id: "user", handle: "U" })).toThrow("reserved id: user");
  expect(() => inviteHuman(file, { id: "human", handle: "H" })).toThrow("reserved id: human");
  expect(humanForToken(file, "")).toBeUndefined();
  expect(file.ownerId).toBe("human");
});
