<template>
  <div class="shared-email-page">
    <div class="header-actions">
      <div class="header-left">
        <span class="page-title">{{ $t('sharedEmail') }}</span>
        <el-radio-group v-if="isAdmin" v-model="scope" size="small" @change="loadList">
          <el-radio-button label="mine">{{ $t('mySharedEmail') }}</el-radio-button>
          <el-radio-button label="all">{{ $t('allSharedEmail') }}</el-radio-button>
        </el-radio-group>
      </div>
      <div class="header-tools">
        <span v-if="selectedRows.length" class="selected-count">{{ $t('selectedCount', {total: selectedRows.length}) }}</span>
        <Icon v-if="selectedRows.length" class="icon" icon="iconoir:copy" width="20" height="20" @click="copySelected"/>
        <Icon v-if="selectedRows.length" class="icon" icon="mdi:calendar-edit-outline" width="20" height="20" @click="openBatchExpire"/>
        <Icon v-if="selectedRows.length" class="icon" icon="material-symbols:restart-alt" width="21" height="21" @click="resetSelected"/>
        <Icon v-if="selectedRows.length" class="icon" icon="material-symbols:link-off" width="21" height="21" @click="cancelSelected"/>
        <Icon v-if="selectedRows.length" class="icon" icon="uiw:delete" width="16" height="16" @click="deleteSelected"/>
        <Icon class="icon reload-icon" icon="ion:reload" width="18" height="18" @click="loadList"/>
      </div>
    </div>
    <el-table
        :data="list"
        height="100%"
        v-loading="loading"
        element-loading-background="transparent"
        @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="46"/>
      <el-table-column prop="address" :label="$t('emailAccount')" min-width="210"/>
      <el-table-column :label="$t('shareMailCount')" prop="emailCount" width="105"/>
      <el-table-column :label="$t('shareSource')" width="110">
        <template #default="{row}">
          <el-tag :type="row.sourceType === 'account' ? 'primary' : 'warning'">
            {{ row.sourceType === 'account' ? $t('account') : $t('randomEmail') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('status')" width="110">
        <template #default="{row}">
          <el-tag v-if="row.enabled" type="success">{{ $t('shareEnabled') }}</el-tag>
          <el-tag v-else-if="row.expired" type="warning">{{ $t('shareLinkExpired') }}</el-tag>
          <el-tag v-else type="info">{{ $t('shareDisabled') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('shareOpenCount')" prop="openCount" width="105"/>
      <el-table-column :label="$t('validUntil')" min-width="165">
        <template #default="{row}">
          {{ row.expireTime ? formatDetailDate(row.expireTime) : $t('shareExpireForever') }}
        </template>
      </el-table-column>
      <el-table-column :label="$t('date')" min-width="165">
        <template #default="{row}">
          {{ formatDetailDate(row.createTime) }}
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="expireDialogShow" :title="$t('updateShareExpire')" width="340">
      <div class="expire-form">
        <el-select v-model="expireType">
          <el-option :label="$t('shareExpireForever')" value="forever"/>
          <el-option :label="$t('shareExpireOneHour')" value="hour"/>
          <el-option :label="$t('shareExpireOneDay')" value="day"/>
          <el-option :label="$t('shareExpireSevenDays')" value="week"/>
          <el-option :label="$t('shareExpireThirtyDays')" value="month"/>
          <el-option :label="$t('shareExpireCustom')" value="custom"/>
        </el-select>
        <el-date-picker
            v-if="expireType === 'custom'"
            v-model="customExpireTime"
            type="datetime"
            :placeholder="$t('shareExpireCustom')"
            :teleported="false"
        />
        <el-button type="primary" :loading="batchLoading" @click="updateSelectedExpire">{{ $t('save') }}</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import {computed, defineOptions, ref} from "vue";
import {Icon} from "@iconify/vue";
import {useI18n} from "vue-i18n";
import {useUserStore} from "@/store/user.js";
import {
  adminEmailShareCancel,
  adminEmailShareDelete,
  adminEmailShareList,
  adminEmailShareReset,
  adminEmailShareUpdate,
  emailShareCancel,
  emailShareDelete,
  emailShareList,
  emailShareReset,
  emailShareUpdate
} from "@/request/email-share.js";
import {formatDetailDate} from "@/utils/day.js";
import dayjs from "dayjs";

defineOptions({
  name: 'shared-email'
})

const {t} = useI18n()
const userStore = useUserStore()
const loading = ref(false)
const batchLoading = ref(false)
const list = ref([])
const scope = ref('mine')
const selectedRows = ref([])
const expireDialogShow = ref(false)
const expireType = ref('forever')
const customExpireTime = ref(null)

const isAdmin = computed(() => userStore.user?.permKeys?.includes('*'))

loadList()

function loadList() {
  loading.value = true
  selectedRows.value = []
  const request = scope.value === 'all' ? adminEmailShareList : emailShareList
  request().then(data => {
    list.value = data || []
  }).finally(() => {
    loading.value = false
  })
}

function handleSelectionChange(rows) {
  selectedRows.value = rows || []
}

function copySelected() {
  const urls = selectedRows.value
      .map(row => localStorage.getItem(`email-share-url-${row.shareLinkId}`))
      .filter(Boolean)
  if (!urls.length) {
    ElMessage({
      message: t('shareLinkOnlyShownAfterGenerate'),
      type: 'warning',
      plain: true
    })
    return
  }
  navigator.clipboard.writeText(urls.join('\n')).then(() => {
    ElMessage({
      message: urls.length === selectedRows.value.length ? t('copySuccessMsg') : t('shareLinkOnlyShownAfterGenerate'),
      type: urls.length === selectedRows.value.length ? 'success' : 'warning',
      plain: true
    })
  })
}

function openBatchExpire() {
  expireType.value = 'forever'
  customExpireTime.value = null
  expireDialogShow.value = true
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

function buildShareUrl(token) {
  return `${window.location.origin}/share/${token}`
}

function cacheUrl(shareLinkId, token) {
  if (shareLinkId && token) {
    localStorage.setItem(`email-share-url-${shareLinkId}`, buildShareUrl(token))
  }
}

async function updateSelectedExpire() {
  if (!ensureCustomTime()) return
  batchLoading.value = true
  const request = scope.value === 'all' ? adminEmailShareUpdate : emailShareUpdate
  try {
    await Promise.all(selectedRows.value.map(row => request(row.shareLinkId, buildExpireTime())))
    expireDialogShow.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true
    })
    loadList()
  } finally {
    batchLoading.value = false
  }
}

async function resetSelected() {
  const request = scope.value === 'all' ? adminEmailShareReset : emailShareReset
  batchLoading.value = true
  try {
    const results = await Promise.all(selectedRows.value.map(row => request(row.shareLinkId, row.expireTime)))
    results.forEach(item => cacheUrl(item.shareLinkId, item.token))
    ElMessage({
      message: t('shareLinkGenerated'),
      type: 'success',
      plain: true
    })
    loadList()
  } finally {
    batchLoading.value = false
  }
}

function cancelSelected() {
  const request = scope.value === 'all' ? adminEmailShareCancel : emailShareCancel
  Promise.all(selectedRows.value.map(row => request(row.accountId, row.shareLinkId))).then(() => {
    ElMessage({
      message: t('shareLinkCancelled'),
      type: 'success',
      plain: true
    })
    loadList()
  })
}

function deleteSelected() {
  ElMessageBox.confirm(t('delShareConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    const rows = [...selectedRows.value]
    const request = scope.value === 'all' ? adminEmailShareDelete : emailShareDelete
    Promise.all(rows.map(row => request(row.shareLinkId))).then(() => {
      rows.forEach(row => localStorage.removeItem(`email-share-url-${row.shareLinkId}`))
      ElMessage({
        message: t('shareLinkDeleted'),
        type: 'success',
        plain: true
      })
      loadList()
    })
  })
}
</script>

<style scoped lang="scss">
.shared-email-page {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}

.header-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 8px 15px;
  box-shadow: var(--header-actions-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-wrap: wrap;
}

.page-title {
  font-weight: 700;
  white-space: nowrap;
}

.icon {
  cursor: pointer;
}

.header-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  min-height: 28px;
  flex-wrap: wrap;
}

.selected-count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.expire-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
