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
          <Icon class="icon toolbar-icon" icon="material-symbols:content-copy-outline-rounded" width="20" height="20" @click="copyAddress"/>
          <Icon class="icon toolbar-icon random-icon" icon="material-symbols:shuffle-rounded" width="22" height="22" @click="generateRandom"/>
          <Icon class="icon toolbar-icon" icon="iconoir:search" width="20" height="20" @click="search"/>
          <Icon class="icon toolbar-icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
                v-if="params.timeSort === 0" width="28" height="28"/>
          <Icon class="icon toolbar-icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
                width="28" height="28"/>
        </div>
        <div class="current-address" v-if="currentAddress">
          {{ currentAddress }}
        </div>
      </template>
      <template #name="{ email }">
        {{ email.name || email.sendEmail || $t('unknown') }}
      </template>
      <template #subject="{ email }">
        {{ email.subject || $t('noSubject') }}
      </template>
    </emailScroll>
  </div>
</template>

<script setup>
import {computed, defineOptions, onMounted, reactive, ref, watch} from "vue";
import {Icon} from "@iconify/vue";
import router from "@/router/index.js";
import {useRoute} from "vue-router";
import {useI18n} from "vue-i18n";
import emailScroll from "@/components/email-scroll/index.vue";
import {randomEmailLatest, randomEmailList} from "@/request/random-email.js";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import {sleep} from "@/utils/time-utils.js";
import {isEmail} from "@/utils/verify-utils.js";

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

const currentAddress = computed(() => {
  if (!randomLocal.value || !baseDomain.value) {
    return ''
  }

  const domain = domainPrefix.value ? `${domainPrefix.value}.${baseDomain.value}` : baseDomain.value
  return `${randomLocal.value}@${domain}`.toLowerCase()
})

const cache = localStorage.getItem('random-email-params')
if (cache) {
  const localParams = JSON.parse(cache)
  randomLocal.value = sanitizeLocalPart(localParams.randomLocal || '')
  domainPrefix.value = sanitizeDomainPrefix(localParams.domainPrefix || '')
  baseDomain.value = localParams.baseDomain || ''
  activeAddress.value = localParams.activeAddress || ''
  params.timeSort = localParams.timeSort || 0
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

watch(() => ({
  randomLocal: randomLocal.value,
  domainPrefix: domainPrefix.value,
  baseDomain: baseDomain.value,
  activeAddress: activeAddress.value,
  timeSort: params.timeSort
}), (value) => {
  localStorage.setItem('random-email-params', JSON.stringify(value))
}, {
  deep: true
})

if (!randomLocal.value) {
  generateRandom(false)
}

if (!activeAddress.value && currentAddress.value) {
  activeAddress.value = currentAddress.value
}

onMounted(() => {
  latest()
})

function sanitizeLocalPart(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9._-]/g, '')
}

function sanitizeDomainPrefix(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '')
}

function randomText() {
  const modes = normalizeRandomMode(settingStore.settings.randomEmailMode)
  const length = normalizeLength(settingStore.settings.randomEmailLength)
  const charMap = {
    letters: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '._-'
  }
  const chars = Array.from(new Set(modes.flatMap(mode => charMap[mode].split('')))).join('')
  let value = ''
  const array = new Uint32Array(length)

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(array)
  }

  for (let i = 0; i < length; i++) {
    const index = array[i] ? array[i] % chars.length : Math.floor(Math.random() * chars.length)
    value += chars[index]
  }

  return value
}

function normalizeRandomMode(value) {
  const aliases = {
    alnum: ['letters', 'numbers'],
    hex: ['letters', 'numbers'],
    letters: ['letters'],
    numbers: ['numbers'],
    symbols: ['symbols']
  }
  const modes = String(value || '')
      .split(',')
      .flatMap(item => aliases[item.trim()] || [item.trim()])
      .filter(item => ['letters', 'numbers', 'symbols'].includes(item))
  const unique = Array.from(new Set(modes))
  return unique.length ? unique : ['letters', 'numbers']
}

function normalizeLength(value) {
  const length = Number(value)
  if (Number.isNaN(length)) {
    return 10
  }
  return Math.min(32, Math.max(4, length))
}

function generateRandom(refresh = true) {
  randomLocal.value = randomText()

  if (refresh) {
    search()
  }
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

  activeAddress.value = currentAddress.value
  randomEmailScroll.value.refreshList()
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
  const address = activeAddress.value || currentAddress.value
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
  width: 100%;
  padding: 3px 0 0;
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 20px;
  word-break: break-all;
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
