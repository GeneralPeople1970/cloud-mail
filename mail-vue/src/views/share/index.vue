<template>
  <div class="share-page">
    <header class="share-header">
      <div>
        <div class="share-title">{{ $t('sharedInbox') }}</div>
        <div class="share-account">{{ meta.accountEmail || $t('loading') }}</div>
      </div>
      <div class="share-actions">
        <el-button circle @click="refresh" :loading="loading">
          <Icon icon="ion:reload" width="18" height="18"/>
        </el-button>
        <el-button v-if="meta.accountEmail" circle @click="copyAccount">
          <Icon icon="fluent-color:clipboard-24" width="18" height="18"/>
        </el-button>
      </div>
    </header>

    <main v-if="invalid" class="invalid">
      <el-empty :description="$t('shareLinkInvalid')"/>
    </main>

    <main v-else class="share-main">
      <section class="mail-list">
        <div
            v-for="item in emails"
            :key="item.emailId"
            class="mail-item"
            :class="{active: selectedEmail?.emailId === item.emailId}"
            @click="openDetail(item)"
        >
          <div class="mail-item-top">
            <span class="sender">{{ item.name || item.sendEmail || $t('unknown') }}</span>
            <span class="time">{{ fromNow(item.createTime) }}</span>
          </div>
          <div class="subject">{{ item.subject || $t('noSubject') }}</div>
          <div class="preview">{{ htmlToText(item) }}</div>
        </div>
        <div class="list-footer">
          <el-button v-if="!noMore" text :loading="loadingMore" @click="loadMore">{{ $t('loadMore') }}</el-button>
          <span v-else-if="emails.length">{{ $t('noMoreData') }}</span>
          <el-empty v-else-if="!loading" :description="$t('noMessagesFound')"/>
        </div>
      </section>

      <section class="mail-detail">
        <el-empty v-if="!selectedEmail" :description="$t('selectEmailToView')"/>
        <div v-else class="detail-content">
          <div class="detail-title">{{ selectedEmail.subject || $t('noSubject') }}</div>
          <div class="detail-meta">
            <div><strong>{{ $t('from') }}</strong> {{ selectedEmail.name }} &lt;{{ selectedEmail.sendEmail }}&gt;</div>
            <div><strong>{{ $t('recipient') }}</strong> {{ formatReceive(selectedEmail.recipient) }}</div>
            <div>{{ formatDetailDate(selectedEmail.createTime) }}</div>
          </div>
          <ShadowHtml class="shadow-html" :html="formatImage(selectedEmail.content)" v-if="selectedEmail.content"/>
          <pre v-else class="email-text">{{ selectedEmail.text }}</pre>
          <div class="att" v-if="selectedEmail.attList?.length">
            <div class="att-title">{{ $t('attachments') }}</div>
            <div class="att-item" v-for="att in selectedEmail.attList" :key="att.attId">
              <span class="att-name">{{ att.filename }}</span>
              <span class="att-size">{{ formatBytes(att.size) }}</span>
              <a :href="cvtR2Url(att.key)" download>{{ $t('download') }}</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import {onMounted, reactive, ref} from "vue";
import {useRoute} from "vue-router";
import {Icon} from "@iconify/vue";
import {useI18n} from "vue-i18n";
import ShadowHtml from "@/components/shadow-html/index.vue";
import {publicEmailShareDetail, publicEmailShareList, publicEmailShareMeta} from "@/request/email-share.js";
import {formatDetailDate, fromNow} from "@/utils/day.js";
import {cvtR2Url, toOssDomain} from "@/utils/convert.js";
import {useSettingStore} from "@/store/setting.js";
import {formatBytes} from "@/utils/file-utils.js";

const route = useRoute()
const {t} = useI18n()
const settingStore = useSettingStore()
const token = String(route.params.token || '')
const meta = reactive({
  accountEmail: '',
  expireTime: null
})
const emails = ref([])
const selectedEmail = ref(null)
const loading = ref(false)
const loadingMore = ref(false)
const noMore = ref(false)
const invalid = ref(false)
const pageSize = 30

onMounted(async () => {
  await fetchMeta()
  if (!invalid.value) {
    await refresh()
  }
})

async function fetchMeta() {
  try {
    const data = await publicEmailShareMeta(token)
    meta.accountEmail = data.accountEmail
    meta.expireTime = data.expireTime
  } catch (e) {
    invalid.value = true
  }
}

async function refresh() {
  loading.value = true
  try {
    const data = await publicEmailShareList({token, emailId: 0, size: pageSize, timeSort: 0})
    emails.value = data.list || []
    noMore.value = emails.value.length < pageSize
    selectedEmail.value = emails.value[0] || null
  } catch (e) {
    invalid.value = true
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value || noMore.value) return
  loadingMore.value = true
  try {
    const lastId = emails.value.length ? emails.value.at(-1).emailId : 0
    const data = await publicEmailShareList({token, emailId: lastId, size: pageSize, timeSort: 0})
    emails.value.push(...(data.list || []))
    noMore.value = (data.list || []).length < pageSize
  } finally {
    loadingMore.value = false
  }
}

async function openDetail(email) {
  try {
    const data = await publicEmailShareDetail(token, email.emailId)
    selectedEmail.value = data.email
  } catch (e) {
    invalid.value = true
  }
}

async function copyAccount() {
  await navigator.clipboard.writeText(meta.accountEmail)
  ElMessage({
    message: t('copySuccessMsg'),
    type: 'success',
    plain: true
  })
}

function htmlToText(email) {
  if (email.text) return cleanText(email.text)
  if (!email.content) return ''
  const div = document.createElement('div')
  div.innerHTML = email.content.replace(/<(img|iframe|object|embed|video|audio|source|link)[^>]*>/gi, '')
  div.querySelectorAll('script, style, title').forEach(el => el.remove())
  return cleanText(div.textContent || div.innerText || '')
}

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function formatImage(content) {
  const domain = settingStore.settings.r2Domain
  return String(content || '').replace(/{{domain}}/g, toOssDomain(domain) + '/')
}

function formatReceive(recipient) {
  try {
    return JSON.parse(recipient || '[]').map(item => item.address).join(', ')
  } catch (e) {
    return ''
  }
}
</script>

<style scoped lang="scss">
.share-page {
  height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
}

.share-header {
  min-height: 58px;
  padding: 10px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: var(--header-actions-border);
}

.share-title {
  font-size: 18px;
  font-weight: 700;
}

.share-account {
  margin-top: 4px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.share-actions {
  display: flex;
  gap: 8px;
}

.share-main {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(280px, 390px) 1fr;
}

.mail-list {
  overflow-y: auto;
  border-right: 1px solid var(--el-border-color);
}

.mail-item {
  padding: 12px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.mail-item:hover,
.mail-item.active {
  background: var(--el-fill-color-light);
}

.mail-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sender,
.subject,
.preview {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sender {
  font-weight: 600;
}

.time,
.preview {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.subject {
  margin-top: 6px;
}

.preview {
  margin-top: 4px;
}

.list-footer {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}

.mail-detail {
  min-width: 0;
  overflow-y: auto;
}

.detail-content {
  padding: 18px 22px 32px;
}

.detail-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 12px;
}

.detail-meta {
  display: grid;
  gap: 6px;
  color: var(--el-text-color-regular);
  border-bottom: 1px solid var(--el-border-color);
  padding-bottom: 12px;
  margin-bottom: 18px;
  word-break: break-word;
}

.email-text {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

.att {
  margin-top: 24px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 12px;
  max-width: 620px;
}

.att-title {
  font-weight: 700;
  margin-bottom: 10px;
}

.att-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 12px;
  padding: 7px 0;
  align-items: center;
}

.att-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.att-size {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.invalid {
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 900px) {
  .share-main {
    grid-template-columns: 1fr;
    grid-template-rows: 42vh 1fr;
  }

  .mail-list {
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color);
  }
}
</style>
