<template>
  <div class="random-email-box">
    <emailScroll ref="randomEmailScroll"
                 :get-emailList="getEmailList"
                 :show-star="false"
                 :allow-delete="false"
                 :show-checkbox="false"
                 show-user-info
                 show-status
                 actionLeft="4px"
                 :show-account-icon="false"
                 :time-sort="params.timeSort"
                 :item-height="65"
                 :type="'all-email'"
                 @jump="jumpContent"
    >
      <template #first>
        <div class="random-toolbar">
          <el-input
              v-model="randomLocal"
              :placeholder="$t('randomPrefix')"
              class="segment-input random-local"
              readonly
          />
          <span class="at-symbol">@</span>
          <el-select
              v-model="domainPrefix"
              class="middle-select"
              clearable
              :placeholder="$t('customMiddleOptional')"
              :disabled="domainPrefixOptions.length === 0"
              @change="search"
          >
            <el-option
                v-for="prefix in domainPrefixOptions"
                :key="prefix"
                :label="prefix"
                :value="prefix"
            />
          </el-select>
          <el-select v-model="baseDomain" class="domain-select" @change="search">
            <el-option
                v-for="domain in baseDomainList"
                :key="domain"
                :label="domain"
                :value="domain"
            />
          </el-select>
          <Icon class="icon toolbar-icon" icon="iconoir:copy" width="20" height="20" @click="copyAddress"/>
          <Icon class="icon toolbar-icon" icon="fluent:share-24-regular" width="20" height="20" @click="openShare"/>
          <Icon class="icon toolbar-icon random-icon" :class="quotaExhausted ? 'disabled-icon' : ''" icon="iconoir:shuffle" width="20" height="20" @click="generateRandom"/>
          <Icon class="icon toolbar-icon" icon="iconoir:search" width="20" height="20" @click="search"/>
          <Icon class="icon toolbar-icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
                v-if="params.timeSort === 0" width="28" height="28"/>
          <Icon class="icon toolbar-icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
                width="28" height="28"/>
        </div>
        <div class="current-address" v-if="currentAddress">
          <span>{{ currentAddress }}</span>
          <span class="quota-text">{{ quotaText }}</span>
        </div>
      </template>
      <template #name="{ email }">
        {{ email.name || email.sendEmail || $t('unknown') }}
      </template>
      <template #subject="{ email }">
        {{ email.subject || $t('noSubject') }}
      </template>
    </emailScroll>
    <email-share-dialog v-model="shareShow" :address="currentAddress" />
  </div>
</template>

<script setup>
import {computed, defineOptions, onMounted, reactive, ref, watch} from "vue";
import {Icon} from "@iconify/vue";
import router from "@/router/index.js";
import {useRoute} from "vue-router";
import {useI18n} from "vue-i18n";
import emailScroll from "@/components/email-scroll/index.vue";
import {randomEmailGenerate, randomEmailLatest, randomEmailList, randomEmailQuota} from "@/request/random-email.js";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import {sleep} from "@/utils/time-utils.js";
import {isEmail} from "@/utils/verify-utils.js";
import EmailShareDialog from "@/components/email-share-dialog/index.vue";

defineOptions({
  name: 'random-email'
})

const route = useRoute()
const {t} = useI18n()
const emailStore = useEmailStore()
const settingStore = useSettingStore()
const randomEmailScroll = ref({})
const randomLocal = ref('')
const domainPrefix = ref('')
const baseDomain = ref('')
const activeAddress = ref('')
const shareShow = ref(false)
const quota = reactive({
  limit: 0,
  used: 0,
  remaining: null,
  unlimited: true
})

const params = reactive({
  timeSort: 0
})

const baseDomainList = computed(() => {
  return (settingStore.domainList || [])
      .map(domain => String(domain || '').trim())
      .filter(Boolean)
      .map(domain => domain.replace(/^@/, ''))
})

const domainPrefixOptions = computed(() => {
  return Array.from(new Set(String(settingStore.settings.randomEmailSubdomains || '')
      .split(',')
      .map(prefix => prefix.trim().toLowerCase())
      .filter(prefix => /^[a-z0-9-]+$/.test(prefix))))
})

const allowedEmailDomains = computed(() => {
  const domains = []

  for (const baseDomain of baseDomainList.value) {
    domains.push(baseDomain)

    for (const prefix of domainPrefixOptions.value) {
      domains.push(`${prefix}.${baseDomain}`)
    }
  }

  return Array.from(new Set(domains))
})

const currentAddress = computed(() => {
  if (!randomLocal.value || !baseDomain.value) {
    return ''
  }

  const domain = domainPrefix.value ? `${domainPrefix.value}.${baseDomain.value}` : baseDomain.value
  return `${randomLocal.value}@${domain}`.toLowerCase()
})

const quotaExhausted = computed(() => {
  return !quota.unlimited && quota.remaining <= 0
})

const quotaText = computed(() => {
  if (quota.unlimited) {
    return t('randomEmailRemainingUnlimited')
  }
  return t('randomEmailRemaining', {remaining: Math.max(0, quota.remaining || 0), total: quota.limit})
})

const cache = localStorage.getItem('random-email-params')
if (cache) {
  try {
    const localParams = JSON.parse(cache)
    randomLocal.value = sanitizeLocalPart(localParams.randomLocal || '')
    domainPrefix.value = sanitizeDomainPrefix(localParams.domainPrefix || '')
    baseDomain.value = sanitizeBaseDomain(localParams.baseDomain || '')
    params.timeSort = Number(localParams.timeSort) || 0
  } catch (e) {
    localStorage.removeItem('random-email-params')
  }
}

watch(() => baseDomainList.value, (list) => {
  if (!list.length) {
    baseDomain.value = ''
    return
  }

  if (!baseDomain.value || !list.includes(baseDomain.value)) {
    baseDomain.value = list[0]
  }
}, {
  immediate: true
})

watch(() => domainPrefixOptions.value, (list) => {
  if (domainPrefix.value && !list.includes(domainPrefix.value)) {
    domainPrefix.value = ''
  }
}, {
  immediate: true
})

watch(() => currentAddress.value, () => {
  ensureActiveAddress()
}, {
  immediate: true
})

watch(() => ({
  randomLocal: randomLocal.value,
  domainPrefix: domainPrefix.value,
  baseDomain: baseDomain.value,
  timeSort: params.timeSort
}), (value) => {
  localStorage.setItem('random-email-params', JSON.stringify(value))
}, {
  deep: true
})

ensureActiveAddress()

onMounted(() => {
  loadQuota().then(() => {
    if (!randomLocal.value) {
      generateRandom()
    }
  })
  latest()
})

function applyQuota(data = {}) {
  quota.limit = Number(data.limit) || 0
  quota.used = Number(data.used) || 0
  quota.remaining = data.remaining === null || data.remaining === undefined ? null : Number(data.remaining)
  quota.unlimited = Boolean(data.unlimited)
}

function loadQuota() {
  return randomEmailQuota().then(applyQuota)
}

function sanitizeLocalPart(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9._-]/g, '')
}

function sanitizeDomainPrefix(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '')
}

function sanitizeBaseDomain(value) {
  return String(value || '').toLowerCase().replace(/^@/, '').replace(/[^a-z0-9.-]/g, '')
}

function getEmailDomain(address) {
  const parts = String(address || '').toLowerCase().split('@')
  return parts.length === 2 ? parts[1] : ''
}

function isAllowedAddress(address) {
  const domain = getEmailDomain(address)
  return Boolean(domain && allowedEmailDomains.value.includes(domain))
}

function ensureActiveAddress() {
  if (!currentAddress.value || !isEmail(currentAddress.value) || !isAllowedAddress(currentAddress.value)) {
    activeAddress.value = ''
    return ''
  }

  if (!activeAddress.value || !isAllowedAddress(activeAddress.value)) {
    activeAddress.value = currentAddress.value
  }

  return activeAddress.value
}

function applyAddress(address) {
  const [localPart, domain = ''] = String(address || '').toLowerCase().split('@')
  const matchedBase = baseDomainList.value.find(item => domain === item || domain.endsWith(`.${item}`)) || baseDomain.value
  randomLocal.value = sanitizeLocalPart(localPart)
  baseDomain.value = sanitizeBaseDomain(matchedBase)
  domainPrefix.value = domain === matchedBase ? '' : sanitizeDomainPrefix(domain.slice(0, -matchedBase.length - 1))
}

function generateRandom() {
  if (quotaExhausted.value) {
    ElMessage({
      message: t('randomEmailQuotaExceeded'),
      type: 'warning',
      plain: true
    })
    return
  }

  randomEmailGenerate({
    baseDomain: baseDomain.value,
    domainPrefix: domainPrefix.value
  }).then(data => {
    applyAddress(data.address)
    applyQuota(data)
    search()
  })
}

async function copyAddress() {
  if (!currentAddress.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(currentAddress.value)
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true
    })
  } catch (e) {
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true
    })
  }
}

function search() {
  if (!currentAddress.value) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true
    })
    return
  }

  if (!isEmail(currentAddress.value)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true
    })
    return
  }

  if (!isAllowedAddress(currentAddress.value)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true
    })
    return
  }

  activeAddress.value = currentAddress.value
  randomEmailScroll.value.refreshList()
}

function openShare() {
  if (!currentAddress.value || !isEmail(currentAddress.value) || !isAllowedAddress(currentAddress.value)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true
    })
    return
  }
  shareShow.value = true
}

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  search()
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'physics'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  emailStore.contentData.showDelete = false
  router.push({name: 'content'})
}

function getEmailList(emailId, size) {
  const address = ensureActiveAddress()

  if (!address) {
    return Promise.resolve({
      list: [],
      total: 0,
      latestEmail: {
        emailId: 0,
        accountId: 0,
        userId: 0,
      }
    })
  }

  return randomEmailList({
    address,
    emailId,
    size,
    timeSort: params.timeSort
  })
}

async function latest() {
  while (true) {
    const autoRefresh = settingStore.settings.autoRefresh

    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000)

    if (autoRefresh < 2) {
      continue
    }

    if (route.name !== 'random-email') {
      continue
    }

    if (params.timeSort !== 0) {
      continue
    }

    const latestId = randomEmailScroll.value.latestEmail?.emailId
    const address = activeAddress.value

    if (!address || (!latestId && latestId !== 0)) {
      continue
    }

    try {
      const list = await randomEmailLatest(address, latestId)

      for (let email of list) {
        randomEmailScroll.value.addItem(email)
        await sleep(50)
      }
    } catch (e) {
      if (e.code === 401 || e.code === 403) {
        settingStore.settings.autoRefresh = 0
      }
      console.error(e)
    }
  }
}
</script>

<style scoped lang="scss">
.random-email-box {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.random-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.segment-input {
  height: 28px;

  :deep(.el-input__wrapper) {
    min-height: 28px;
  }
}

.random-local {
  width: 155px;
}

.at-symbol {
  color: var(--el-text-color-regular);
  line-height: 28px;
  user-select: none;
}

.middle-select {
  width: 150px;
}

.domain-select {
  width: 145px;
}

.middle-select,
.domain-select {
  :deep(.el-select__wrapper) {
    padding: 2px 10px;
    min-height: 28px;
  }
}

.current-address {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
  padding: 3px 0 0;
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 20px;
  word-break: break-all;
}

.quota-text {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.icon {
  cursor: pointer;
  flex-shrink: 0;
}

.toolbar-icon,
.random-icon {
  filter: none;
  text-shadow: none;
  color: var(--el-text-color-primary);
  opacity: 1;
}

.disabled-icon {
  cursor: not-allowed;
  color: var(--el-text-color-disabled);
  opacity: 0.45;
}

:deep(.toolbar-icon *),
:deep(.random-icon *) {
  filter: none;
  text-shadow: none;
  opacity: 1;
}

:deep(.header-actions) {
  padding-top: 8px;
  padding-bottom: 8px;
  align-items: flex-start;
}

@media (max-width: 767px) {
  .random-toolbar {
    gap: 6px;
  }

  .random-local {
    width: 128px;
  }

  .middle-select {
    width: 124px;
  }

  .domain-select {
    width: 132px;
  }
}
</style>
