import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createConnection} from 'node:net';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const windows = process.platform === 'win32';
let child;
let stopping = false;

function options(args) {
  let port = 3000;
  let open = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-open') open = false;
    else if (args[i] === '--port') {
      const value = args[++i];
      if (!value || !/^\d+$/.test(value)) throw new Error('--port 后请输入 1—65535 的整数。');
      port = Number(value);
      if (port < 1 || port > 65535) throw new Error('端口范围为 1—65535。');
    } else throw new Error(`未知选项：${args[i]}。支持 --port 3001 和 --no-open。`);
  }
  return {port, open};
}

function run(command, args) {
  const current = spawn(command, args, {cwd: root, stdio: 'inherit', windowsHide: true});
  child = current;
  const done = new Promise((resolve, reject) => {
    current.once('error', reject);
    current.once('exit', (code, signal) => {
      if (child === current) child = undefined;
      if (code === 0 || stopping) resolve();
      else reject(new Error(`运行中断（${signal || code}），请检查上方提示。`));
    });
  });
  // The server can exit while its readiness check is still in progress.
  void done.catch(() => {});
  return {current, done};
}

function portInUse(port) {
  return new Promise(resolve => {
    const socket = createConnection({host: '127.0.0.1', port});
    const finish = occupied => {socket.destroy(); resolve(occupied);};
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1200, () => finish(true));
  });
}

async function isOurSite(url) {
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(2000), redirect: 'error'});
    return response.ok && (await response.text()).includes('<title>群演 · 社会演化实验室</title>');
  } catch {return false;}
}

async function openBrowser(url) {
  // url only contains a fixed loopback host and a validated numeric port.
  const command = windows ? 'powershell.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = windows ? ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${url}'`] : [url];
  await new Promise(resolve => {
    const opener = spawn(command, args, {stdio: 'ignore', windowsHide: true});
    opener.once('error', () => {console.log(`请手动打开 ${url}`); resolve();});
    opener.once('exit', code => {if (code) console.log(`请手动打开 ${url}`); resolve();});
  });
}

function stop() {
  if (stopping) return;
  stopping = true;
  if (!child?.pid) return;
  if (windows) {
    // Only stop the process tree created by this launcher.
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {stdio: 'ignore', windowsHide: true});
    killer.once('error', () => child?.kill());
  } else child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

async function main() {
  const {port, open} = options(process.argv.slice(2));
  if (Number(process.versions.node.split('.')[0]) < 24) {
    throw new Error('一键启动需要 Node.js 24 或更新版本：https://nodejs.org/en/download');
  }
  const url = `http://localhost:${port}/`;
  console.log('\n群演 · 社会演化实验室\n');
  if (await portInUse(port)) {
    if (!await isOurSite(`http://127.0.0.1:${port}/`)) {
      throw new Error(`端口 ${port} 已被占用。可运行 node scripts/launch.mjs --port ${port === 65535 ? 3001 : port + 1} 使用另一个端口。`);
    }
    console.log(`网站已经运行：${url}\n如需加载修改后的代码，请先在原启动窗口按 Ctrl+C，再重新启动。`);
    if (open) await openBrowser(url);
    return;
  }

  const cache = join(root, '.local-run');
  const stamp = join(cache, 'dependencies.sha256');
  const fingerprint = createHash('sha256')
    .update(readFileSync(join(root, 'package-lock.json')))
    .update(readFileSync(join(root, 'package.json')))
    .update(`${process.platform}/${process.arch}/${process.versions.node.split('.')[0]}`)
    .digest('hex');
  const cli = join(root, 'node_modules', 'vinext', 'dist', 'cli.js');
  if (!existsSync(cli) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== fingerprint) {
    console.log('1/3 安装依赖（首次运行需要联网，请稍候）…');
    const install = windows
      ? run('cmd.exe', ['/d', '/s', '/c', 'npm.cmd ci --include=dev --no-audit --no-fund'])
      : run('npm', ['ci', '--include=dev', '--no-audit', '--no-fund']);
    await install.done;
    if (stopping) return;
    mkdirSync(cache, {recursive: true});
    writeFileSync(stamp, fingerprint);
  } else console.log('1/3 依赖已就绪。');

  console.log('2/3 准备网站…');
  await run(process.execPath, [cli, 'build']).done;
  if (stopping) return;
  console.log('3/3 启动本地网站…');
  const server = run(process.execPath, [cli, 'start', '--hostname', '127.0.0.1', '--port', String(port)]);
  let ready = false;
  const deadline = Date.now() + 60_000;
  while (!stopping && server.current.exitCode === null && server.current.signalCode === null && Date.now() < deadline) {
    if (await isOurSite(`http://127.0.0.1:${port}/`)) {ready = true; break;}
    await delay(300);
  }
  if (stopping) return;
  if (!ready) {
    stop();
    await server.done;
    throw new Error('网站未能就绪，请检查上方错误。修复后重新运行启动文件即可。');
  }
  console.log(`\n网站已就绪：${url}\n保持此窗口开启；按 Ctrl+C 停止。关闭网页前，请在工作台点击「保存」。\n`);
  if (open) await openBrowser(url);
  await server.done;
}

main().catch(error => {
  console.error(`\n启动失败：${error.message}\n`);
  stop();
  process.exitCode = 1;
});
