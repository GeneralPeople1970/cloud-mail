<template>
  <el-dialog
      v-model="visible"
      :title="$t('shareEmailLink')"
      width="520"
      @closed="resetDialog"
  >
    <div class="share-dialog">
      <div class="share-account">{{ displayTitle }}</div>
      <el-alert
          v-if="status.enabled && !shareUrl && !batchMode"
          :closable="false"
          type="info"
          :title="$t('shareLinkOnlyShownAfterGenerate')"
      />
      <el-alert
          v-if="status.expired"
          :closable="false"
          type="warning"
          :title="$t('shareLinkExpired')"
      />
      <div class="form-row">
        <span>{{ $t('shareExpireTime') }}</span>
        <el-select v-model="expireType" class="expire-select" @change="handleExpireTypeChange">
          <el-option :label="$t('shareExpireForever')" value="forever"/>
          <el-option :label="$t('shareExpireOneHour')" value="hour"/>
          <el-option :label="$t('shareExpireOneDay')" value="day"/>
          <el-option :label="$t('shareExpireSevenDays')" value="week"/>
          <el-option :label="$t('shareExpireThirtyDays')" value="month"/>
          <el-option :label="$t('shareExpireCustom')" value="custom"/>
        </el-select>
      </div>
      <el-date-picker
          v-if="expireType === 'custom'"
          v-model="customExpireTime"
          type="datetime"
          class="custom-time"
          :placeholder="$t('shareExpireCustom')"
      />
      <div class="status-line" v-if="!batchMode">
        <span>{{ $t('status') }}:</span>
        <el-tag v-if="status.enabled" type="success">{{ $t('shareEnabled') }}</el-tag>
        <el-tag v-else type="info">{{ $t('shareDisabled') }}</el-tag>
        <el-tag v-if="status.openCount" type="primary">{{ $t('shareOpenCount') }} {{ status.openCount }}</el-tag>
      </div>
      <div class="status-line" v-if="status.enabled && status.expireTime">
        <span>{{ $t('validUntil') }}:</span>
        <span>{{ formatExpire(status.expireTime) }}</span>
      </div>
      <el-input v-if="shareUrl" v-model="shareUrl" readonly>
        <template #append>
          <el-button @click="copyText(shareUrl)">{{ $t('copy') }}</el-button>
        </template>
      </el-input>
      <div class="batch-result" v-if="batchResults.length">
        <div class="batch-item" v-for="item in batchResults" :key="item.address">
          <div>
            <span class="batch-address">{{ item.address }}</span>
            <el-tag size="small" :type="item.ok ? 'success' : 'danger'">
              {{ item.ok ? $t('shareEnabled') : $t('error') }}
            </el-tag>
          </div>
          <el-button v-if="item.url" size="small" @click="copyText(item.url)">{{ $t('copy') }}</el-button>
          <span v-else class="batch-message">{{ item.message }}</span>
        </div>
      </div>
      <div class="actions">
        <el-button
            v-if="canUpdateDate"
            :loading="updating"
            @click="updateShareDate"
        >
          {{ $t('updateShareExpire') }}
        </el-button>
        <el-button
            type="primary"
            :loading="saving"
            @click="saveShare"
        >
          {{ primaryText }}
        </el-button>
        <el-button
            v-if="status.enabled && !batchMode"
            :loading="cancelling"
            @click="cancelShare"
        >
          {{ $t('cancelShareLink') }}
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import {computed, reactive, ref, watch} from "vue";
import dayjs from "dayjs";
import {useI18n} from "vue-i18n";
import {
  adminEmailShareAddressStatus,
  adminEmailShareBatchSave,
  adminEmailShareCancel,
  adminEmailShareReset,
  adminEmailShareSave,
  adminEmailShareStatus,
  adminEmailShareUpdate,
  emailShareAddressStatus,
  emailShareCancel,
  emailShareReset,
  emailShareSave,
  emailShareStatus,
  emailShareUpdate
} from "@/request/email-share.js";
import {formatDetailDate} from "@/utils/day.js";

const props = defineProps({
  modelValue: Boolean,
  account: Object,
  address: String,
  share: Object,
  batchAddresses: Array,
  admin: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'changed'])
const {t} = useI18n()
const saving = ref(false)
const updating = ref(false)
const cancelling = ref(false)
const expireType = ref('forever')
const customExpireTime = ref(null)
const shareUrl = ref('')
const batchResults = ref([])
const status = reactive({
  enabled: false,
  expired: false,
  accountId: null,
  shareLinkId: null,
  accountEmail: '',
  address: '',
  expireTime: null,
  openCount: 0
})

const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})

const batchMode = computed(() => (props.batchAddresses || []).length > 0)
const canUpdateDate = computed(() => status.enabled && status.shareLinkId && !batchMode.value)
const displayTitle = computed(() => {
  if (batchMode.value) return t('batchShareCount', {total: props.batchAddresses.length})
  return props.share?.address || props.address || props.account?.email || status.address || status.accountEmail || ''
})
const primaryText = computed(() => {
  if (batchMode.value) return t('batchShare')
  return status.enabled ? t('resetShareLink') : t('generateShareLink')
})

watch(() => props.modelValue, value => {
  if (value) {
    initDialog()
  }
})

function initDialog() {
  batchResults.value = []
  if (props.share) {
    applyStatus(props.share)
    shareUrl.value = loadCachedUrl(props.share.shareLinkId)
    initExpireFromStatus()
    return
  }
  if (batchMode.value) {
    return
  }
  fetchStatus()
}

function fetchStatus() {
  const accountId = props.account?.accountId
  const address = props.address
  if (!accountId && !address) {
    return
  }

  const request = props.admin
      ? (accountId ? adminEmailShareStatus : adminEmailShareAddressStatus)
      : (accountId ? emailShareStatus : emailShareAddressStatus)

  request(accountId || address).then(data => {
    applyStatus(data)
    shareUrl.value = loadCachedUrl(data.shareLinkId)
    initExpireFromStatus()
  })
}

function applyStatus(data = {}) {
  status.enabled = Boolean(data.enabled)
  status.expired = Boolean(data.expired)
  status.accountId = data.accountId
  status.shareLinkId = data.shareLinkId
  status.accountEmail = data.accountEmail
  status.address = data.address || data.accountEmail
  status.expireTime = data.expireTime
  status.openCount = data.openCount || 0
}

function initExpireFromStatus() {
  if (status.expireTime) {
    expireType.value = 'custom'
    customExpireTime.value = dayjs(status.expireTime).toDate()
  }
}

function handleExpireTypeChange() {
  if (expireType.value !== 'custom') {
    customExpireTime.value = null
  }
}

function buildExpireTime() {
  if (expireType.value === 'forever') return null
  if (expireType.value === 'hour') return dayjs().add(1, 'hour').toISOString()
  if (expireType.value === 'day') return dayjs().add(1, 'day').toISOString()
  if (expireType.value === 'week') return dayjs().add(7, 'day').toISOString()
  if (expireType.value === 'month') return dayjs().add(30, 'day').toISOString()
  return customExpireTime.value ? dayjs(customExpireTime.value).toISOString() : null
}

function ensureCustomTime() {
  if (expireType.value === 'custom' && !customExpireTime.value) {
    ElMessage({
      message: t('shareExpireRequired'),
      type: 'warning',
      plain: true
    })
    return false
  }
  return true
}

function saveShare() {
  if (!ensureCustomTime()) return
  if (batchMode.value) {
    batchShare()
    return
  }
  if (status.enabled && status.shareLinkId) {
    resetShare()
    return
  }

  saving.value = true
  const request = props.admin ? adminEmailShareSave : emailShareSave
  request(props.account?.accountId, buildExpireTime(), props.address).then(data => {
    handleGenerated(data)
  }).finally(() => {
    saving.value = false
  })
}

function resetShare() {
  saving.value = true
  const request = props.admin ? adminEmailShareReset : emailShareReset
  request(status.shareLinkId, buildExpireTime()).then(data => {
    handleGenerated(data)
  }).finally(() => {
    saving.value = false
  })
}

function batchShare() {
  saving.value = true
  adminEmailShareBatchSave(props.batchAddresses, buildExpireTime()).then(list => {
    batchResults.value = list.map(item => {
      const url = item.ok && item.token ? buildShareUrl(item.token) : ''
      if (item.shareLinkId && url) {
        cacheUrl(item.shareLinkId, url)
      }
      return {...item, url}
    })
    emit('changed')
  }).finally(() => {
    saving.value = false
  })
}

function updateShareDate() {
  if (!ensureCustomTime()) return
  updating.value = true
  const request = props.admin ? adminEmailShareUpdate : emailShareUpdate
  request(status.shareLinkId, buildExpireTime()).then(data => {
    applyStatus(data)
    emit('changed')
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true
    })
  }).finally(() => {
    updating.value = false
  })
}

function handleGenerated(data) {
  applyStatus(data)
  shareUrl.value = buildShareUrl(data.token)
  cacheUrl(data.shareLinkId, shareUrl.value)
  emit('changed')
  ElMessage({
    message: t('shareLinkGenerated'),
    type: 'success',
    plain: true
  })
}

function cancelShare() {
  cancelling.value = true
  const request = props.admin ? adminEmailShareCancel : emailShareCancel
  request(status.accountId, status.shareLinkId).then(() => {
    status.enabled = false
    status.expired = false
    status.expireTime = null
    shareUrl.value = ''
    emit('changed')
    ElMessage({
      message: t('shareLinkCancelled'),
      type: 'success',
      plain: true
    })
  }).finally(() => {
    cancelling.value = false
  })
}

async function copyText(text) {
  if (!text) {
    ElMessage({
      message: t('shareLinkOnlyShownAfterGenerate'),
      type: 'warning',
      plain: true
    })
    return
  }
  await navigator.clipboard.writeText(text)
  ElMessage({
    message: t('copySuccessMsg'),
    type: 'success',
    plain: true
  })
}

function buildShareUrl(token) {
  return `${window.location.origin}/share/${token}`
}

function cacheUrl(shareLinkId, url) {
  if (!shareLinkId || !url) return
  localStorage.setItem(`email-share-url-${shareLinkId}`, url)
}

function loadCachedUrl(shareLinkId) {
  return shareLinkId ? localStorage.getItem(`email-share-url-${shareLinkId}`) || '' : ''
}

function formatExpire(time) {
  return formatDetailDate(time)
}

function resetDialog() {
  shareUrl.value = ''
  batchResults.value = []
  expireType.value = 'forever'
  customExpireTime.value = null
  applyStatus({})
}
</script>

<style scoped lang="scss">
.share-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.share-account {
  font-weight: 600;
  word-break: break-all;
}

.form-row,
.status-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.form-row > span,
.status-line > span:first-child {
  color: var(--el-text-color-regular);
  flex: 0 0 auto;
}

.expire-select,
.custom-time {
  width: 100%;
}

.batch-result {
  display: grid;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.batch-item {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}

.batch-address {
  margin-right: 8px;
  word-break: break-all;
}

.batch-message {
  color: var(--el-color-danger);
  font-size: 12px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
