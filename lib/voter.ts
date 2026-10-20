const KEY = 'session-polls-voter';

/**
 * An anonymous ID stored on the participant's device, used to allow
 * one vote per device per poll. No personal data is collected.
 */
export function getVoterId(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && existing.length >= 8) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private browsing with storage blocked: fall back to an in-memory ID.
    const w = window as unknown as { __spVoter?: string };
    if (!w.__spVoter) w.__spVoter = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    return w.__spVoter;
  }
}
