/** Shared timing helpers (P2 去重：self-drive/pi-adapter/opencode-adapter 各自实现)。 */

/** Resolve after `ms` milliseconds. */
export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
