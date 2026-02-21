/**
 * Merge remote elements into local elements using version-based conflict resolution.
 *
 * Strategy: for each element, keep the one with the higher version number.
 * If versions are equal, use versionNonce as a tiebreaker (lower nonce wins).
 *
 * This is the same strategy Excalidraw uses internally.
 */
export function mergeElements(local: any[], remote: any[]): any[] {
  const merged = new Map<string, any>();

  // Start with all local elements
  for (const el of local) {
    merged.set(el.id, el);
  }

  // Merge in remote elements
  for (const remoteEl of remote) {
    const localEl = merged.get(remoteEl.id);

    if (!localEl) {
      // New element from remote
      merged.set(remoteEl.id, remoteEl);
    } else if (remoteEl.version > localEl.version) {
      // Remote has newer version
      merged.set(remoteEl.id, remoteEl);
    } else if (
      remoteEl.version === localEl.version &&
      remoteEl.versionNonce < localEl.versionNonce
    ) {
      // Same version, use nonce as tiebreaker
      merged.set(remoteEl.id, remoteEl);
    }
    // Otherwise keep local
  }

  return Array.from(merged.values());
}
