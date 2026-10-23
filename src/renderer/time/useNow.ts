import { getCurrentScope, onScopeDispose, shallowRef, type ShallowRef } from 'vue'

interface Ticker {
  now: ShallowRef<Date>
  users: number
  timer: ReturnType<typeof setInterval>
}

const tickers = new Map<number, Ticker>()

/**
 * The current time as a ref, updated every `intervalMs`. Components with the same interval share
 * one timer; it stops when the last scope using it is disposed.
 */
export function useNow(intervalMs = 1000): Readonly<ShallowRef<Date>> {
  let ticker = tickers.get(intervalMs)
  if (!ticker) {
    const now = shallowRef(new Date())
    ticker = { now, users: 0, timer: setInterval(() => (now.value = new Date()), intervalMs) }
    tickers.set(intervalMs, ticker)
  }
  const current = ticker
  current.users += 1
  if (getCurrentScope()) {
    onScopeDispose(() => {
      current.users -= 1
      if (current.users === 0) {
        clearInterval(current.timer)
        tickers.delete(intervalMs)
      }
    })
  }
  return current.now
}
