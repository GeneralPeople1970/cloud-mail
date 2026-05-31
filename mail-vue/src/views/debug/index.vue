<template>
  <div class="debug-page">
    <div class="debug-header">
      <div>
        <h2>{{ $t('debug') }}</h2>
        <p>{{ $t('debugDesc') }}</p>
      </div>
      <div class="actions">
        <el-button :loading="loading" type="primary" @click="runDiagnostics">{{ $t('debugRunDiagnostics') }}</el-button>
        <el-button @click="copyReport">{{ $t('debugCopyReport') }}</el-button>
        <el-button @click="clearErrors">{{ $t('debugClearErrors') }}</el-button>
        <el-button type="warning" @click="clearSiteCache">{{ $t('debugClearSiteCache') }}</el-button>
      </div>
    </div>

    <section class="debug-section debug-switch-section">
      <div>
        <div class="section-title">{{ $t('debugCapture') }}</div>
        <p>{{ $t('debugCaptureDesc') }}</p>
      </div>
      <el-switch
          v-model="debugEnabled"
          :loading="savingDebug"
          :active-value="1"
          :inactive-value="0"
          @change="saveDebugSwitch"
      />
    </section>

    <el-alert
        class="deploy-alert"
        type="warning"
        :closable="false"
        show-icon
        :title="$t('debugDeployAlertTitle')"
        :description="$t('debugDeployAlertDesc')"/>

    <div class="summary-grid">
      <div class="summary-item">
        <span>{{ $t('debugCurrentUrl') }}</span>
        <strong>{{ runtime.location }}</strong>
      </div>
      <div class="summary-item">
        <span>API Base</span>
        <strong>{{ runtime.apiBase }}</strong>
      </div>
      <div class="summary-item">
        <span>Token</span>
        <strong>{{ runtime.hasToken ? $t('exists') : $t('notExists') }}</strong>
      </div>
      <div class="summary-item">
        <span>{{ $t('debugFrontendErrorCount') }}</span>
        <strong>{{ frontendErrors.length }}</strong>
      </div>
    </div>

    <section class="debug-section">
      <div class="section-title">{{ $t('debugApiDiagnostics') }}</div>
      <el-table :data="checks" border>
        <el-table-column prop="name" :label="$t('debugItem')" min-width="130"/>
        <el-table-column prop="url" :label="$t('debugRequestUrl')" min-width="240" show-overflow-tooltip/>
        <el-table-column :label="$t('status')" width="120">
          <template #default="{ row }">
            <el-tag :type="statusType(row)">{{ row.statusText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="elapsed" :label="$t('debugElapsed')" width="90"/>
        <el-table-column prop="message" :label="$t('debugResponseMessage')" min-width="180" show-overflow-tooltip/>
        <el-table-column prop="dataKeys" label="data keys" min-width="220" show-overflow-tooltip/>
      </el-table>
    </section>

    <section class="debug-section">
      <div class="section-title">{{ $t('debugFrontendErrors') }}</div>
      <el-empty v-if="frontendErrors.length === 0" :description="$t('debugNoFrontendErrors')"/>
      <el-table v-else :data="frontendErrors" border>
        <el-table-column prop="time" :label="$t('time')" width="210"/>
        <el-table-column prop="type" :label="$t('type')" width="160"/>
        <el-table-column prop="message" :label="$t('error')" min-width="260" show-overflow-tooltip/>
        <el-table-column prop="path" :label="$t('page')" min-width="260" show-overflow-tooltip/>
      </el-table>
    </section>

    <section class="debug-section">
      <div class="section-title">{{ $t('debugFullReport') }}</div>
      <pre class="report">{{ report }}</pre>
    </section>
  </div>
</template>

<script setup>
import {computed, onMounted, ref} from 'vue';
import {storeToRefs} from 'pinia';
import {useI18n} from 'vue-i18n';
import {useSettingStore} from '@/store/setting.js';
import {useUserStore} from '@/store/user.js';
import {settingSet} from '@/request/setting.js';
import {clearDebugErrors, getDebugErrors, setDebugEnabled} from '@/utils/debug-capture.js';

defineOptions({
  name: 'debug'
});

const API_BASE = import.meta.env.VITE_BASE_URL || '/api';
const {t} = useI18n();
const settingStore = useSettingStore();
const userStore = useUserStore();
const {settings, domainList} = storeToRefs(settingStore);

const loading = ref(false);
const savingDebug = ref(false);
const debugEnabled = ref(Number(settings.value?.debug) === 1 ? 1 : 0);
const checks = ref([]);
const frontendErrors = ref(getDebugErrors());

const runtime = computed(() => ({
  generatedAt: new Date().toISOString(),
  location: window.location.href,
  origin: window.location.origin,
  apiBase: API_BASE,
  hasToken: Boolean(localStorage.getItem('token')),
  userAgent: navigator.userAgent,
  language: navigator.language,
  scriptAssets: Array.from(document.scripts)
      .map(script => script.src)
      .filter(Boolean)
      .slice(-10)
}));

const storeSnapshot = computed(() => ({
  lang: settingStore.lang,
  domainCount: Array.isArray(domainList.value) ? domainList.value.length : 'not-array',
  settingKeys: Object.keys(settings.value || {}).sort(),
  randomEmail: {
    subdomainsType: typeof settings.value?.randomEmailSubdomains,
    length: settings.value?.randomEmailLength,
    mode: settings.value?.randomEmailMode
  },
  debug: settings.value?.debug,
  user: {
    hasUser: Boolean(userStore.user?.userId || userStore.user?.email),
    permKeys: Array.isArray(userStore.user?.permKeys) ? userStore.user.permKeys : []
  }
}));

const report = computed(() => JSON.stringify({
  runtime: runtime.value,
  store: storeSnapshot.value,
  endpointChecks: checks.value,
  frontendErrors: frontendErrors.value
}, null, 2));

const checkDefinitions = computed(() => [
  {name: t('debugPublicConfig'), path: () => '/setting/websiteConfig'},
  {name: t('debugSystemSetting'), path: () => '/setting/query'},
  {name: t('debugCurrentUser'), path: () => '/my/loginUserInfo'},
  {name: t('debugRandomEmailList'), path: () => `/randomEmail/list?page=1&size=1&address=${encodeURIComponent(buildRandomDiagnosticAddress())}`}
]);

onMounted(() => {
  runDiagnostics();
});

async function runDiagnostics() {
  loading.value = true;
  frontendErrors.value = getDebugErrors();
  checks.value = [];

  const results = [];
  for (const definition of checkDefinitions.value) {
    results.push(await runCheck(definition));
    checks.value = [...results];
  }

  loading.value = false;
}

async function saveDebugSwitch(value) {
  savingDebug.value = true;
  const debug = Number(value) === 1 ? 1 : 0;

  try {
    await settingSet({debug});
    settingStore.settings = {...settingStore.settings, debug};
    debugEnabled.value = debug;
    setDebugEnabled(debug === 1);
    ElMessage({
      message: debug === 1 ? t('debugEnabledMsg') : t('debugDisabledMsg'),
      type: 'success',
      plain: true
    });
  } catch (e) {
    debugEnabled.value = Number(settingStore.settings.debug) === 1 ? 1 : 0;
  } finally {
    savingDebug.value = false;
  }
}

async function runCheck(definition) {
  const url = buildApiUrl(definition.path());
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Authorization: localStorage.getItem('token') || '',
        'accept-language': settingStore.lang || navigator.language || 'zh'
      }
    });
    const text = await response.text();
    const json = parseJson(text);
    const data = json && typeof json.data === 'object' && json.data !== null ? json.data : null;

    return {
      name: definition.name,
      url,
      ok: response.ok && (!json || json.code === 200),
      httpStatus: response.status,
      statusText: `${response.status}${json?.code ? ` / ${json.code}` : ''}`,
      elapsed: `${Math.round(performance.now() - started)}ms`,
      contentType: response.headers.get('content-type') || '',
      message: json?.message || response.statusText || '',
      dataKeys: data ? Object.keys(data).join(', ') : '',
      bodyPreview: redact(text).slice(0, 3000)
    };
  } catch (error) {
    return {
      name: definition.name,
      url,
      ok: false,
      httpStatus: '',
      statusText: error.name === 'AbortError' ? 'timeout' : 'error',
      elapsed: `${Math.round(performance.now() - started)}ms`,
      contentType: '',
      message: error.message || String(error),
      dataKeys: '',
      bodyPreview: ''
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildRandomDiagnosticAddress() {
  const domain = (Array.isArray(domainList.value) && domainList.value[0] ? domainList.value[0] : '@example.com')
      .replace(/^@?/, '@');
  return `debug-diagnostic-${Date.now()}${domain}`;
}

function buildApiUrl(path) {
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  const apiPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${apiPath}`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function redact(text) {
  return String(text)
      .replace(/("(?:secretKey|siteKey|tgBotToken|s3AccessKey|s3SecretKey|jwt_secret|token|Authorization)"\s*:\s*)"[^"]*"/gi, '$1"***"')
      .replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, '$1***');
}

function statusType(row) {
  if (row.ok) return 'success';
  if (row.statusText === 'timeout') return 'warning';
  return 'danger';
}

async function copyReport() {
  await navigator.clipboard.writeText(report.value);
  ElMessage({
    message: t('debugReportCopied'),
    type: 'success',
    plain: true
  });
}

function clearErrors() {
  clearDebugErrors();
  frontendErrors.value = [];
}

async function clearSiteCache() {
  try {
    await ElMessageBox.confirm(t('debugClearSiteCacheConfirm'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    });
  } catch (e) {
    return;
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
  }

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  }

  if (indexedDB.databases) {
    const databases = await indexedDB.databases();
    await Promise.all(databases
        .map(database => database.name)
        .filter(Boolean)
        .map(name => new Promise(resolve => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = request.onerror = request.onblocked = resolve;
        })));
  }

  localStorage.clear();
  sessionStorage.clear();
  window.location.replace('/login');
}
</script>

<style scoped lang="scss">
.debug-page {
  height: 100%;
  overflow: auto;
  padding: 18px;
  color: var(--el-text-color-primary);
}

.debug-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;

  h2 {
    margin: 0 0 6px;
    font-size: 22px;
  }

  p {
    margin: 0;
    color: var(--el-text-color-secondary);
  }
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.deploy-alert {
  margin-bottom: 14px;
}

.debug-switch-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 0;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);

  p {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  .section-title {
    margin-bottom: 6px;
  }
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.summary-item {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);

  span {
    display: block;
    margin-bottom: 6px;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }
}

.debug-section {
  margin-top: 14px;
}

.section-title {
  margin-bottom: 8px;
  font-weight: 600;
}

.report {
  min-height: 260px;
  max-height: 420px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 900px) {
  .debug-header {
    display: block;
  }

  .actions {
    justify-content: flex-start;
    margin-top: 12px;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .debug-page {
    padding: 12px;
  }

  .debug-switch-section {
    align-items: flex-start;
    flex-direction: column;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
