import { spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerDirectory = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

function requireResourceId(name, pattern) {
  const value = process.env[name]?.trim();
  if (!value || !pattern.test(value)) {
    throw new Error(`${name} 缺失或格式不正确，请在 Workers Builds 的构建变量中配置现有资源 ID。`);
  }
  return value;
}

try {
  if (process.argv.length > 2) {
    throw new Error('deploy:builds 不接受额外参数，避免忽略参数或覆盖绑定配置。');
  }

  const databaseId = requireResourceId(
    'D1_DATABASE_ID',
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,
  );
  const namespaceId = requireResourceId('KV_NAMESPACE_ID', /^[\da-f]{32}$/i);
  const sourceConfig = readFileSync(join(workerDirectory, 'wrangler.toml'), 'utf8');

  if (/^\s*\[\[\s*(?:d1_databases|kv_namespaces)\s*\]\]/m.test(sourceConfig)) {
    throw new Error('wrangler.toml 已声明 D1/KV 绑定，请统一使用源配置或构建变量，避免重复配置。');
  }

  const configPath = join(workerDirectory, `.wrangler-builds-${process.pid}.toml`);
  const config = `${sourceConfig.trimEnd()}

[[d1_databases]]
binding = "db"
database_id = "${databaseId}"

[[kv_namespaces]]
binding = "kv"
id = "${namespaceId}"
`;

  writeFileSync(configPath, config, { flag: 'wx', mode: 0o600 });
  try {
    const wranglerPath = require.resolve('wrangler/bin/wrangler.js');
    const result = spawnSync(process.execPath, [wranglerPath, 'deploy', '--config', configPath, '--keep-vars'], {
      cwd: workerDirectory,
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    unlinkSync(configPath);
  }
} catch (error) {
  console.error(`Workers Builds 部署失败：${error.message}`);
  process.exitCode = 1;
}
