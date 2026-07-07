/**
 * duo-bridge logger. TTY-aware. Colors + spinner + category tags for humans,
 * plain lines for pipes/logfiles.
 *
 * Public surface (unchanged): createLogger(level) -> { debug, info, warn, error }
 * Additions:
 *   log.cat(name)         -> child logger with a persistent [category] tag
 *   log.startSpinner(msg) -> { update(msg), succeed(msg), fail(msg), stop() }
 *   log.banner(lines)     -> boxed banner at boot
 *
 * Behaviour:
 *   - Interactive TTY (isTTY && no NO_COLOR):  colored, dim timestamps,
 *     category tags, animated spinners, one active spinner at a time.
 *   - Non-TTY / NO_COLOR / DUO_BRIDGE_LOG_PLAIN=true:  plain lines identical to
 *     v0.8.1 format.
 */
import { format } from 'node:util';
import http from 'node:http';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

// --- in-memory log ring + live SSE fan-out (task 3) ----------------------
// Every emitted line is tee'd (plain, ansi-stripped) into a bounded ring so a
// tiny localhost HTTP server can dump recent logs and stream new ones. The
// buffer is module-global because createLogger()/log.cat() produce many logger
// instances that all share one surface.
const LOG_RING_CAP = 1000;
const logRing = [];
const sseClients = new Set();

function teeToBuffer(plainLine) {
  logRing.push(plainLine);
  if (logRing.length > LOG_RING_CAP) logRing.shift();
  if (sseClients.size === 0) return;
  const framed = `data: ${plainLine.replace(/\r?\n/g, '\\n')}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(framed);
    } catch {
      sseClients.delete(res);
    }
  }
}

let logServer = null;

/** The bound log-server URL (e.g. http://127.0.0.1:PORT/logs), or null. */
export function getLogServerUrl() {
  return logServer?.url ?? null;
}

/**
 * Serve the log ring on 127.0.0.1 only (task 3). GET /logs dumps the buffer as
 * plain text; GET /logs/stream is an SSE feed of new lines. Port comes from
 * DUO_BRIDGE_LOG_PORT (0/unset => a free port). Never throws into the caller:
 * a taken port or any listen error is logged as a warning and swallowed.
 * Returns the chosen URL, or null if the server could not start.
 */
export function startLogServer(log, env = process.env) {
  if (logServer) return logServer.url;
  const requested = Number.parseInt(env.DUO_BRIDGE_LOG_PORT ?? '', 10);
  const port = Number.isFinite(requested) ? requested : 0;

  let server;
  try {
    server = http.createServer((req, res) => {
      const path = (req.url || '').split('?')[0];
      if (path === '/logs') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`${logRing.join('\n')}\n`);
        return;
      }
      if (path === '/logs/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`data: ${logRing.length} buffered line(s); streaming new logs...\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found. try /logs or /logs/stream\n');
    });
  } catch (err) {
    log?.warn?.(`log server could not be created: ${err.message}`);
    return null;
  }

  server.on('error', (err) => {
    log?.warn?.(`log server disabled (${err.code || err.message}); continuing without it.`);
    logServer = null;
  });
  server.unref?.();
  server.listen(port, '127.0.0.1', () => {
    const chosen = server.address()?.port;
    const url = `http://127.0.0.1:${chosen}/logs`;
    logServer = { server, url };
    log?.info?.(`logs at ${url} (live: ${url}/stream)`);
  });
  return logServer?.url ?? null;
}

const PLAIN =
  process.env.NO_COLOR === '1' ||
  process.env.NO_COLOR === 'true' ||
  process.env.DUO_BRIDGE_LOG_PLAIN === 'true' ||
  !process.stdout.isTTY;

const c = PLAIN ? plainColors() : ansiColors();

function ansiColors() {
  const wrap = (open, close) => (s) => `\x1b[${open}m${s}\x1b[${close}m`;
  return {
    dim: wrap(2, 22),
    bold: wrap(1, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    blue: wrap(34, 39),
    magenta: wrap(35, 39),
    cyan: wrap(36, 39),
    grey: wrap(90, 39),
    redBold: (s) => `\x1b[1;31m${s}\x1b[0m`,
    reset: '\x1b[0m',
  };
}
function plainColors() {
  const id = (s) => s;
  return {
    dim: id,
    bold: id,
    red: id,
    green: id,
    yellow: id,
    blue: id,
    magenta: id,
    cyan: id,
    grey: id,
    redBold: id,
    reset: '',
  };
}

const LEVEL_TAG = {
  debug: c.grey('DEBUG'),
  info: c.cyan('INFO '),
  warn: c.yellow('WARN '),
  error: c.redBold('ERROR'),
};

const SPINNER_FRAMES = [
  '\u280B',
  '\u2819',
  '\u2839',
  '\u2838',
  '\u283C',
  '\u2834',
  '\u2826',
  '\u2827',
  '\u2807',
  '\u280F',
];
const SPINNER_INTERVAL_MS = 80;

// Global spinner state — only one spinner may be active at a time. Log lines
// arriving while a spinner is running clear the spinner line, print the log,
// then redraw the spinner on a fresh line below.
let activeSpinner = null;

function clearSpinnerLine() {
  if (!activeSpinner) return;
  process.stdout.write('\r\x1b[2K');
}
function redrawSpinner() {
  if (!activeSpinner) return;
  activeSpinner._render();
}

function timeStamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  if (PLAIN) return d.toISOString();
  return c.dim(`${hh}:${mm}:${ss}.${ms}`);
}

function formatLine(lvl, category, msg) {
  if (PLAIN) {
    const cat = category ? `[${category}] ` : '';
    return `[${new Date().toISOString()}] [${lvl.toUpperCase()}] ${cat}${msg}`;
  }
  const catTag = category ? ` ${c.grey(`[${category}]`)}` : '';
  return `${timeStamp()} ${LEVEL_TAG[lvl]}${catTag} ${msg}`;
}

export function createLogger(level = 'info') {
  const threshold = LEVELS[level] ?? LEVELS.info;
  return _makeLogger(threshold, null);
}

function _makeLogger(threshold, category) {
  const write = (lvl, msg, err) => {
    if (LEVELS[lvl] < threshold) return;
    // format the payload if `msg` was passed util.format-style
    const text = typeof msg === 'string' ? msg : format(msg);
    const line = formatLine(lvl, category, text);
    const stream = lvl === 'error' || lvl === 'warn' ? process.stderr : process.stdout;

    // Tee a plain (ansi-stripped) copy into the ring/SSE surface for the log
    // server, regardless of TTY colouring on the console stream.
    let errText;
    if (err) errText = err instanceof Error ? err.stack || err.message : format(err);
    teeToBuffer(stripAnsi(errText ? `${line}\n${errText}` : line));

    // Pause any active spinner while we print, then resume.
    if (activeSpinner) clearSpinnerLine();
    stream.write(`${line}\n`);
    if (errText) {
      stream.write(`${errText}\n`);
    }
    if (activeSpinner) redrawSpinner();
  };

  const logger = {
    debug: (msg, err) => write('debug', msg, err),
    info: (msg, err) => write('info', msg, err),
    warn: (msg, err) => write('warn', msg, err),
    error: (msg, err) => write('error', msg, err),
    cat(name) {
      return _makeLogger(threshold, name);
    },
    startSpinner(text) {
      return startSpinner(text, category);
    },
    banner(lines) {
      banner(lines);
    },
  };
  return logger;
}

/**
 * Start a spinner. Only one may be active at a time; a second call transparently
 * replaces the previous one (previous spinner is stopped without emitting an
 * outcome). All returned methods are safe to call after stop().
 */
function startSpinner(initialText, category) {
  if (PLAIN || !process.stdout.isTTY) {
    // No animation available — fall back to a plain info line at start and end.
    const started = Date.now();
    const tag = category ? `[${category}] ` : '';
    process.stdout.write(`[${new Date().toISOString()}] [INFO ] ${tag}${initialText}\u2026\n`);
    let currentText = initialText;
    const finish = (verb, text) => {
      const dur = ((Date.now() - started) / 1000).toFixed(1);
      const finalText = text ?? currentText;
      process.stdout.write(
        `[${new Date().toISOString()}] [INFO ] ${tag}${verb} ${finalText} (${dur}s)\n`,
      );
    };
    return {
      update(t) {
        currentText = t;
      },
      succeed(t) {
        finish('\u2713', t);
      },
      fail(t) {
        finish('\u2717', t);
      },
      stop() {},
    };
  }

  // Stop any prior spinner without a final line.
  if (activeSpinner) {
    activeSpinner.stop();
  }

  let frame = 0;
  let text = initialText;
  const started = Date.now();
  const tag = category ? ` ${c.grey(`[${category}]`)}` : '';

  const render = () => {
    const glyph = c.magenta(SPINNER_FRAMES[frame % SPINNER_FRAMES.length]);
    const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
    process.stdout.write(
      `\r\x1b[2K${timeStamp()} ${glyph}${tag} ${text} ${c.dim(`(${elapsedSec}s)`)}`,
    );
  };

  const timer = setInterval(() => {
    frame += 1;
    render();
  }, SPINNER_INTERVAL_MS);
  timer.unref?.();

  const spinner = {
    _render: render,
    update(t) {
      text = t;
      render();
    },
    succeed(t) {
      spinner._finish(c.green('\u2713'), t);
    },
    fail(t) {
      spinner._finish(c.red('\u2717'), t);
    },
    stop() {
      spinner._finish(null, null);
    },
    _finish(mark, finalText) {
      clearInterval(timer);
      if (activeSpinner === spinner) activeSpinner = null;
      clearSpinnerLine();
      if (mark) {
        const dur = ((Date.now() - started) / 1000).toFixed(1);
        const ftext = finalText ?? text;
        process.stdout.write(`${timeStamp()} ${mark}${tag} ${ftext} ${c.dim(`(${dur}s)`)}\n`);
      }
    },
  };

  activeSpinner = spinner;
  render();
  return spinner;
}

/** Boxed banner shown once at boot. */
function banner(lines) {
  if (PLAIN) {
    for (const l of lines) process.stdout.write(`${l}\n`);
    return;
  }
  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length));
  const top = c.magenta(`\u256D${'\u2500'.repeat(maxLen + 2)}\u256E`);
  const bot = c.magenta(`\u2570${'\u2500'.repeat(maxLen + 2)}\u256F`);
  process.stdout.write(`${top}\n`);
  for (const l of lines) {
    const pad = ' '.repeat(maxLen - stripAnsi(l).length);
    process.stdout.write(`${c.magenta('\u2502')} ${l}${pad} ${c.magenta('\u2502')}\n`);
  }
  process.stdout.write(`${bot}\n`);
}

function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, '');
}

export const colors = c;
