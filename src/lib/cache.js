// Tiny session-scoped cache for list queries, so moving between pages doesn't
// reload everything from scratch each time (painful once a user has thousands
// of transactions). Stale-while-revalidate: a page seeds its state from the
// cache instantly — no loading flash on revisit — then refetches in the
// background and updates the cache. Any write clears the whole cache (see the
// cacheClear() calls in data.js), so the next read is fresh. It lives in module
// memory only: a full reload / sign-out starts empty.

const store = new Map()

// undefined = a miss (never fetched). A cached empty array [] is a hit.
export const cacheGet = (key) => store.get(key)
export const cacheSet = (key, value) => { store.set(key, value) }
export const cacheClear = () => { store.clear() }
