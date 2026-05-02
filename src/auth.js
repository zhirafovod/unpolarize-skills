import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import readline from "node:readline";

const TOKEN_DIR = path.join(os.homedir(), ".unpolarize");
const TOKEN_PATH = path.join(TOKEN_DIR, "token");

export function getBaseUrl() {
  return (
    process.env.UNPOLARIZE_API_URL ||
    "https://unpolarize-652421979088.us-west1.run.app"
  );
}

export function loadToken() {
  if (process.env.UNPOLARIZE_TOKEN) return process.env.UNPOLARIZE_TOKEN;
  try {
    return fs.readFileSync(TOKEN_PATH, "utf8").trim();
  } catch {
    return "";
  }
}

export function saveToken(token) {
  fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
}

function deleteToken() {
  try {
    fs.unlinkSync(TOKEN_PATH);
  } catch {
    // already gone
  }
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} "${url}"`);
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function loginWithBrowser() {
  const baseUrl = getBaseUrl().replace(/\/api\/?$/, "").replace(/\/$/, "");

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost`);

      if (url.pathname === "/callback") {
        const token = url.searchParams.get("token");
        if (token) {
          saveToken(token);
          const payload = decodeJwtPayload(token);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html><body style="font-family:system-ui;text-align:center;padding:60px;background:#0d1117;color:#e6edf3">
              <h2 style="color:#4fc3f7">Logged in to Unpolarize</h2>
              <p>You can close this tab and return to the terminal.</p>
              ${payload ? `<p style="color:#8b949e">User ID: ${payload.sub}</p>` : ""}
            </body></html>
          `);
          server.close();
          resolve(token);
        } else {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing token parameter");
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const callbackUrl = `http://localhost:${port}/callback`;
      const signinUrl = `${baseUrl}/signin?callback=${encodeURIComponent(callbackUrl)}`;

      console.error(`Opening browser to sign in...`);
      console.error(`If the browser doesn't open, visit:\n  ${signinUrl}\n`);
      openBrowser(signinUrl);
    });

    // Timeout after 120 seconds
    setTimeout(() => {
      server.close();
      reject(new Error("Login timed out after 120 seconds"));
    }, 120_000);
  });
}

async function loginWithCredentials() {
  const identifier = await prompt("Username or email: ");
  // Read password without echo
  const passwordPromise = new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    process.stderr.write("Password: ");
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    let password = "";
    const onData = (ch) => {
      const c = ch.toString();
      if (c === "\n" || c === "\r") {
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.removeListener("data", onData);
        process.stderr.write("\n");
        rl.close();
        resolve(password);
      } else if (c === "\u0003") {
        process.exit(1);
      } else if (c === "\u007f" || c === "\b") {
        password = password.slice(0, -1);
      } else {
        password += c;
      }
    };
    stdin.on("data", onData);
  });
  const password = await passwordPromise;

  const payload = identifier.includes("@")
    ? { email: identifier, password }
    : { username: identifier, password };

  const res = await fetch(`${getBaseUrl()}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sign in failed: ${text}`);
  }

  const data = await res.json();
  saveToken(data.token);
  return data.token;
}

export async function login(noBrowser = false) {
  try {
    const token = noBrowser
      ? await loginWithCredentials()
      : await loginWithBrowser();

    const payload = decodeJwtPayload(token);
    console.error(`\nAuthenticated successfully!`);
    if (payload) {
      const exp = new Date(payload.exp * 1000);
      console.error(`  User ID: ${payload.sub}`);
      console.error(`  Expires: ${exp.toLocaleString()}`);
    }
    console.error(`  Token saved to: ${TOKEN_PATH}`);
  } catch (err) {
    console.error(`Login failed: ${err.message}`);
    process.exit(1);
  }
}

export function logout() {
  deleteToken();
  console.error("Logged out. Token removed.");
}

export function status() {
  const token = loadToken();
  if (!token) {
    console.error("Not logged in. Run: unpolarize-skills login");
    process.exit(1);
  }

  const payload = decodeJwtPayload(token);
  if (!payload) {
    console.error("Invalid token. Run: unpolarize-skills login");
    process.exit(1);
  }

  const exp = new Date(payload.exp * 1000);
  const now = new Date();
  const expired = now > exp;

  console.error(`Unpolarize authentication status:`);
  console.error(`  API:     ${getBaseUrl()}`);
  console.error(`  User ID: ${payload.sub}`);
  console.error(`  Expires: ${exp.toLocaleString()}${expired ? " (EXPIRED)" : ""}`);
  console.error(`  Token:   ${TOKEN_PATH}`);

  if (expired) {
    console.error(`\nToken expired. Run: unpolarize-skills login`);
    process.exit(1);
  }
}

export async function handleCli(args) {
  const command = args[0];
  const noBrowser = args.includes("--no-browser");

  switch (command) {
    case "login":
      await login(noBrowser);
      break;
    case "logout":
      logout();
      break;
    case "status":
      status();
      break;
    default:
      return false; // not a CLI command
  }
  return true;
}
