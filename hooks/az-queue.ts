// One az lookup in flight at a time across the module; a full queue drops new jobs.
export const MAX_WAITING = 20

let active = false
const waiting: (() => void)[] = []

function release(): void {
  const nextJob = waiting.shift()
  if (nextJob) nextJob()
  else active = false
}

/** Runs `job` when no other queued job runs. Never rejects: a failed or dropped job answers undefined. */
export function runQueued<T>(job: () => Promise<T>): Promise<T | undefined> {
  if (active && waiting.length >= MAX_WAITING) return Promise.resolve(undefined)
  return new Promise<T | undefined>((resolve) => {
    const go = () => {
      active = true
      Promise.resolve()
        .then(job)
        .then(resolve, () => resolve(undefined))
        .then(release)
    }
    if (active) waiting.push(go)
    else go()
  })
}
