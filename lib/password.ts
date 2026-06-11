import argon2 from "argon2";

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations, 1 lane).
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// Verified against when the email matches no user, so failed logins take
// roughly the same time either way and never reveal which field was wrong.
let dummyHash: Promise<string> | undefined;

export function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash("triptrace-timing-equalizer", ARGON2_OPTIONS);
  return dummyHash;
}
