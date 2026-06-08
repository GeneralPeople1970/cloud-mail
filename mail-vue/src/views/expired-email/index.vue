<template>
  <div class="email-list-box">
    <emailScroll
        ref="expiredEmailScroll"
        :get-emailList="getEmailList"
        :email-delete="expiredEmailDelete"
        :star-add="starAdd"
        :star-cancel="starCancel"
        :show-star="false"
        show-user-info
        show-status
        :allow-delete="false"
        actionLeft="4px"
        :show-account-icon="false"
        :time-sort="params.timeSort"
        :item-height="65"
        @jump="jumpContent"
        @refresh-before="refreshBefore"
        @right-search="rightSearch"
        @selection-change="selectionChange"
        :type="'all-email'"
    >
      <template #first>
        <el-input
            v-model="searchValue"
            :placeholder="$t('searchByContent')"
            class="search-input"
        >
          <template #prefix>
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="params.searchType"
                  :placeholder="$t('select')"
                  class="select"
              >
                <el-option key="3" :label="$t('sender')" :value="'name'"/>
                <el-option key="4" :label="$t('subject')" :value="'subject'"/>
                <el-option key="1" :label="$t('user')" :value="'user'"/>
                <el-option key="2" :label="$t('selectEmail')" :value="'account'"/>
              </el-select>
              <div class="search-type">
                <span>{{ selectTitle }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-select v-model="params.type" class="status-select" @change="search">
          <el-option key="1" :label="$t('all')" value="all"/>
          <el-option key="3" :label="$t('received')" value="receive"/>
          <el-option key="2" :label="$t('sent')" value="send"/>
          <el-option key="4" :label="$t('selectDeleted')" value="delete"/>
          <el-option key="5" :label="$t('noRecipientTitle')" value="noone"/>
        </el-select>
        <el-select v-model="dayType" class="days-select" @change="daysChange">
          <el-option :label="$t('expiredEmailSevenDays')" value="7"/>
          <el-option :label="$t('expiredEmailFourteenDays')" value="14"/>
          <el-option :label="$t('expiredEmailThirtyDays')" value="30"/>
          <el-option :label="$t('custom')" value="custom"/>
        </el-select>
        <el-input-number
            v-if="dayType === 'custom'"
            v-model="customDays"
            class="custom-days"
            :min="1"
            :max="3650"
            :step="1"
            size="small"
            @change="daysChange"
        />
        <Icon class="icon" icon="iconoir:search" @click="search" width="20" height="20"/>
        <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
              v-if="params.timeSort === 0" width="28" height="28"/>
        <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
              width="28" height="28"/>
      </template>
      <template #afterReload>
        <Icon
            class="icon delete-selected"
            v-if="selectedEmailCount > 0"
            icon="uiw:delete"
            width="16"
            height="16"
            @click="deleteSelected"
        />
        <Icon
            class="icon clear"
            icon="fluent:broom-sparkle-16-regular"
            width="22"
            height="22"
            @click="deleteCurrentExpired"
        />
        <div class="auto-delete-control">
          <span>{{ $t('expiredEmailAutoDelete') }}</span>
          <el-switch
              v-model="autoDelete"
              :active-value="1"
              :inactive-value="0"
              size="small"
              @change="saveExpiredSetting"
          />
          <el-button size="small" type="primary" :loading="settingLoading" @click="saveExpiredSetting">
            {{ $t('save') }}
          </el-button>
        </div>
      </template>
    </emailScroll>
  </div>
</template>

<script setup>
import {computed, defineOptions, reactive, ref} from "vue";
import {Icon} from "@iconify/vue";
import router from "@/router/index.js";
import emailScroll from "@/components/email-scroll/index.vue";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import {useI18n} from "vue-i18n";
import {starAdd, starCancel} from "@/request/star.js";
import {expiredEmailBatchDelete, expiredEmailDelete, expiredEmailList} from "@/request/expired-email.js";
import {settingSet} from "@/request/setting.js";

defineOptions({
  name: 'expired-email'
})

const {t} = useI18n()
const emailStore = useEmailStore()
const settingStore = useSettingStore()
const expiredEmailScroll = ref({})
const searchValue = ref('')
const mySelect = ref()
const selectedEmailCount = ref(0)
const settingLoading = ref(false)
const autoDelete = ref(Number(settingStore.settings.expiredEmailAutoDelete) === 1 ? 1 : 0)
const customDays = ref(normalizeDays(settingStore.settings.expiredEmailDays))
const dayType = ref(['7', '14', '30'].includes(String(settingStore.settings.expiredEmailDays))
    ? String(settingStore.settings.expiredEmailDays)
    : 'custom')

const params = reactive({
  timeSort: 0,
  type: 'all',
  userEmail: null,
  accountEmail: null,
  name: null,
  subject: null,
  searchType: 'name'
})

const currentDays = computed(() => dayType.value === 'custom' ? normalizeDays(customDays.value) : Number(dayType.value))

const selectTitle = computed(() => {
  if (params.searchType === 'user') return t('user')
  if (params.searchType === 'account') return t('selectEmail')
  if (params.searchType === 'name') return t('sender')
  if (params.searchType === 'subject') return t('subject')
})

function openSelect() {
  mySelect.value.toggleMenu()
}

function normalizeDays(value) {
  const days = Number(value)
  if (!days || Number.isNaN(days) || days < 1) return 30
  return Math.min(3650, Math.floor(days))
}

function daysChange() {
  if (dayType.value === 'custom') {
    customDays.value = normalizeDays(customDays.value)
  }
  search()
}

function getEmailList(emailId, size) {
  return expiredEmailList({emailId, size, days: currentDays.value, ...params})
}

function selectionChange(rows) {
  selectedEmailCount.value = rows.length
}

function refreshBefore() {
  searchValue.value = null
  params.timeSort = 0
  params.type = 'all'
  params.userEmail = null
  params.accountEmail = null
  params.name = null
  params.subject = null
  params.searchType = 'name'
}

function rightSearch(type, value) {
  params.searchType = type
  searchValue.value = value
  search()
}

function search() {
  params.userEmail = null
  params.accountEmail = null
  params.name = null
  params.subject = null

  if (params.searchType === 'user') params.userEmail = searchValue.value
  if (params.searchType === 'account') params.accountEmail = searchValue.value
  if (params.searchType === 'name') params.name = searchValue.value
  if (params.searchType === 'subject') params.subject = searchValue.value

  expiredEmailScroll.value.refreshList()
}

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  search()
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'physics'
  emailStore.contentData.showDelete = true
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  router.push({name: 'content'})
}

function deleteSelected() {
  const selected = expiredEmailScroll.value.getSelectedMails?.() || []
  const emailIds = selected.map(item => item.emailId)
  if (!emailIds.length) return

  ElMessageBox.confirm(t('delEmailsConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    expiredEmailDelete(emailIds).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true
      })
      emailStore.deleteIds = emailIds
      expiredEmailScroll.value.refreshList()
    })
  })
}

function deleteCurrentExpired() {
  ElMessageBox.confirm(t('expiredEmailClearConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    expiredEmailBatchDelete({days: currentDays.value, ...params}).then((data) => {
      ElMessage({
        message: t('expiredEmailClearSuccess', {total: data?.total || 0}),
        type: 'success',
        plain: true
      })
      expiredEmailScroll.value.refreshList()
    })
  })
}

function saveExpiredSetting() {
  settingLoading.value = true
  const form = {
    expiredEmailAutoDelete: autoDelete.value,
    expiredEmailDays: currentDays.value
  }
  settingSet(form).then(() => {
    settingStore.settings = {...settingStore.settings, ...form}
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true
    })
  }).finally(() => {
    settingLoading.value = false
  })
}
</script>

<style scoped lang="scss">
.email-list-box {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.search-input {
  width: 100%;
  max-width: 280px;
  height: 28px;

  .setting-icon {
    position: relative;
    top: 3px;
  }
}

.select {
  position: absolute;
  width: 40px;
  opacity: 0;
  pointer-events: none;
}

.search-type {
  display: flex;
  color: var(--el-text-color-regular);
}

.status-select {
  width: 102px;
}

.days-select {
  width: 116px;
}

.custom-days {
  width: 128px;
}

.icon {
  cursor: pointer;
}

.auto-delete-control {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  font-size: 13px;
}

:deep(.el-select__wrapper) {
  padding: 2px 10px;
  min-height: 28px;
}

:deep(.el-input-number .el-input__wrapper) {
  min-height: 28px;
}

:deep(.delete) {
  display: none;
}
</style>
