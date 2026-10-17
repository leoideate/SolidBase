import { hash, verify } from "@node-rs/argon2";

export function hashPin(pin: string) {
  return hash(pin, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPin(pinHash: string, pin: string) {
  try {
    return await verify(pinHash, pin);
  } catch {
    return false;
  }
}

/** PINs are 6 digits; workers use their own phones (ARD p.8 login decision). */
export function isValidPin(pin: string) {
  return /^\d{6}$/.test(pin) && !/^(\d)\1{5}$/.test(pin) && !["123456", "654321", "012345"].includes(pin);
}
