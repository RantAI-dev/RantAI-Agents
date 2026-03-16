/**
 * Browser Services — manages the display stack lifecycle for the browser playground.
 *
 * Starts Xvfb, x11vnc, websockify (noVNC), and Firefox ESR inside the container.
 * Uses system-level checks (pgrep/port) so callers from separate processes can
 * safely detect already-running services.
 */

const { spawn, execSync } = require("child_process")

/**
 * Wait for a short delay (ms).
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Check if a process is running by name via pgrep.
 * Excludes zombie (defunct) processes.
 */
function isRunning(name) {
  try {
    // Get PIDs, then check none are zombies
    const pids = execSync(`pgrep -x ${name}`, { stdio: "pipe" }).toString().trim().split("\n")
    for (const pid of pids) {
      try {
        const state = execSync(`ps -p ${pid} -o stat=`, { stdio: "pipe" }).toString().trim()
        if (!state.startsWith("Z")) return true // at least one non-zombie
      } catch { /* pid gone */ }
    }
    return false
  } catch {
    return false
  }
}

/**
 * Get PID of a running (non-zombie) process by name, or null.
 */
function getPid(name) {
  try {
    const pids = execSync(`pgrep -x ${name}`, { stdio: "pipe" }).toString().trim().split("\n")
    for (const pid of pids) {
      try {
        const state = execSync(`ps -p ${pid} -o stat=`, { stdio: "pipe" }).toString().trim()
        if (!state.startsWith("Z")) return parseInt(pid, 10)
      } catch { /* pid gone */ }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Spawn a detached process so it survives the caller exiting.
 */
function spawnService(cmd, args, env) {
  const proc = spawn(cmd, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "ignore", "pipe"],
    detached: true,
  })
  proc.stderr.on("data", (chunk) => {
    console.error(`[${cmd}] ${chunk.toString().trimEnd()}`)
  })
  proc.on("error", (err) => {
    console.error(`[${cmd}] spawn error: ${err.message}`)
  })
  // Don't let this process keep the parent alive
  proc.unref()
  return proc
}

/**
 * Start the full display stack: Xvfb -> x11vnc -> websockify.
 * Safe to call multiple times — skips services that are already running.
 */
async function startBrowserServices() {
  const xvfbOk = isRunning("Xvfb")
  const vncOk = isRunning("x11vnc")
  const wsOk = isRunning("websockify")

  if (xvfbOk && vncOk && wsOk) {
    console.log("[browser-services] Display stack already running, skipping start")
    return
  }

  console.log("[browser-services] Starting display stack...")

  // 1. Xvfb virtual display
  if (!isRunning("Xvfb")) {
    // Clean up stale lock if present
    try { execSync("rm -f /tmp/.X99-lock", { stdio: "ignore" }) } catch {}
    spawnService("Xvfb", [":99", "-screen", "0", "1280x720x24", "-ac"])
    await delay(500)
    console.log("[browser-services] Xvfb started")
  } else {
    console.log("[browser-services] Xvfb already running")
  }

  // 2. VNC server
  if (!isRunning("x11vnc")) {
    spawnService("x11vnc", [
      "-display", ":99",
      "-nopw",
      "-forever",
      "-shared",
      "-rfbport", "5900",
    ])
    await delay(500)
    console.log("[browser-services] x11vnc started")
  } else {
    console.log("[browser-services] x11vnc already running")
  }

  // 3. WebSocket bridge + noVNC web client
  if (!isRunning("websockify")) {
    spawnService("websockify", [
      "--web", "/usr/share/novnc/",
      "6080",
      "localhost:5900",
    ])
    await delay(500)
    console.log("[browser-services] websockify started")
  } else {
    console.log("[browser-services] websockify already running")
  }

  console.log("[browser-services] Display stack ready (noVNC on port 6080)")
}

/**
 * Stop all display stack processes.
 */
function stopBrowserServices() {
  for (const name of ["firefox-esr", "websockify", "x11vnc", "Xvfb"]) {
    try {
      execSync(`pkill -x ${name}`, { stdio: "ignore" })
      console.log(`[browser-services] Stopped ${name}`)
    } catch {
      // not running
    }
  }
}

/**
 * Get the current status of all browser services.
 */
function getBrowserStatus() {
  return {
    running: isRunning("Xvfb"),
    pids: {
      xvfb: getPid("Xvfb"),
      vnc: getPid("x11vnc"),
      websockify: getPid("websockify"),
      firefox: getPid("firefox-esr"),
    },
  }
}

/**
 * Open Firefox ESR on display :99, navigating to the given URL.
 * If Firefox is already running, kills and relaunches with new URL.
 */
async function openFirefox(url) {
  if (isRunning("firefox-esr")) {
    console.log(`[browser-services] Restarting Firefox for: ${url}`)
    try { execSync("pkill -x firefox-esr", { stdio: "ignore" }) } catch {}
    await delay(1000)
  } else {
    console.log(`[browser-services] Launching Firefox ESR: ${url}`)
  }

  spawnService("firefox-esr", ["--no-remote", url], { DISPLAY: ":99" })
}

module.exports = {
  startBrowserServices,
  stopBrowserServices,
  getBrowserStatus,
  openFirefox,
}
