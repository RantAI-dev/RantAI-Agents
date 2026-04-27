import "server-only"

interface QueueOptions {
  capacity: number
}

const DEFAULT_CAPACITY = parseInt(process.env.RENDER_CONCURRENCY ?? "3", 10) || 3
let active = 0
const waiters: Array<() => void> = []

async function acquire(capacity: number): Promise<void> {
  if (active < capacity) {
    active++
    return
  }
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      active++
      resolve()
    })
  })
}

function release(): void {
  active--
  const next = waiters.shift()
  if (next) next()
}

export async function withRenderSlot<T>(
  work: () => Promise<T>,
  opts: QueueOptions = { capacity: DEFAULT_CAPACITY },
): Promise<T> {
  await acquire(opts.capacity)
  try {
    return await work()
  } finally {
    release()
  }
}
