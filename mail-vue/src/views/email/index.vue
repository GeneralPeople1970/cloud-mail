<template>
  <emailScroll ref="scroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               :email-read="emailRead"
               :show-unread="true"
               :highlight-text="emailStore.searchParams.text"
               actionLeft="4px"
               @jump="jumpContent"
               @refresh-success="onRefreshSuccess"
  >
  </emailScroll>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete, emailLatest, emailRead} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, onActivated, onDeactivated, ref, watch} from "vue";
import {sleep} from "@/utils/time-utils.js";
import router from "@/router/index.js";
import {
  inboxWs,
  isAutoRefreshEnabled,
} from "@/websocket/client.js";

defineOptions({
  name: 'email'
})

const emailStore = useEmailStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const scroll = ref({})
let pullTimer = null
let waitingForList = false
let viewVersion = 0

onActivated(() => {
  emailStore.emailScroll = scroll;
  // 收件箱实时：推送或重连后再拉 emailLatest，不按间隔轮询
  inboxWs.start({
    isEnabled: () => isAutoRefreshEnabled(settingStore.settings.autoRefresh),
    onMessage: onWsMessage,
    onReconnect: schedulePullLatest,
  });
  if (scroll.value?.latestEmail) schedulePullLatest()
})

onDeactivated(() => {
  viewVersion++
  waitingForList = false
  if (pullTimer) {
    window.clearTimeout(pullTimer)
    pullTimer = null
  }
  inboxWs.stop()
})

watch(
  [() => accountStore.currentAccountId, getAllReceive, () => emailStore.searchParams],
  () => {
    viewVersion++
    scroll.value?.refreshList?.()
  },
  {deep: true}
)

watch(() => Boolean(scroll.value?.latestEmail), ready => {
  if (ready && waitingForList) schedulePullLatest()
})

watch(() => settingStore.settings.autoRefresh, () => {
  inboxWs.sync()
})

function onRefreshSuccess() {
  inboxWs.retryNow()
}

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showDelete = true
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  router.push({name: 'content', params: {mailbox: 'inbox'}})
}

// 推送到达：非「全部收取」时忽略其它账号的信。
function onWsMessage(event) {
  const allReceive = getAllReceive()
  if (!allReceive && event?.accountId != null && Number(event.accountId) !== Number(accountStore.currentAccountId)) {
    return
  }
  schedulePullLatest()
}

// 短时间多条推送合并成一次补拉。
function schedulePullLatest() {
  if (router.currentRoute.value.name !== 'email' || !isAutoRefreshEnabled(settingStore.settings.autoRefresh)) return
  if (pullTimer) {
    window.clearTimeout(pullTimer)
  }
  pullTimer = window.setTimeout(() => {
    pullTimer = null
    void pullLatest()
  }, 150)
}

// 按当前列表最新 id 拉取之后的新邮件并插入。
async function pullLatest() {
  const searchParams = emailStore.searchParams
  if (router.currentRoute.value.name !== 'email' || !isAutoRefreshEnabled(settingStore.settings.autoRefresh)
      || searchParams.text || searchParams.startDate || searchParams.endDate) {
    return
  }

  const cursor = scroll.value?.latestEmail
  const accountId = accountStore.currentAccountId
  const allReceive = getAllReceive()

  if (!cursor || accountId !== cursor.reqAccountId || allReceive !== cursor.allReceive) {
    waitingForList = true
    return
  }
  waitingForList = false
  const version = viewVersion
  const isCurrent = () => viewVersion === version && router.currentRoute.value.name === 'email'
      && accountId === accountStore.currentAccountId && allReceive === getAllReceive()
      && searchParams === emailStore.searchParams && scroll.value?.latestEmail != null
      && isAutoRefreshEnabled(settingStore.settings.autoRefresh)

  try {
    const list = await emailLatest(cursor.emailId, accountId, allReceive);
    if (!isCurrent()) return
    if (list.length >= 50) {
      await scroll.value.refreshList()
      return
    }

    emailStore.applyFullList(list)
    for (const email of list.reverse()) {
      if (!isCurrent()) return
      email.reqAccountId = accountId
      email.allReceive = allReceive
      if (scroll.value.addItem(email)) await sleep(50)
    }
  } catch (e) {
    if (isCurrent() && (e.code === 401 || e.code === 403)) {
      settingStore.settings.autoRefresh = 1;
      inboxWs.sync();
    }
    console.error(e)
  }
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  const accountId =  accountStore.currentAccountId;
  const allReceive = getAllReceive();
  const search = emailStore.searchParams
  return emailStore.fetchList(full =>
    emailList(accountId, allReceive, emailId, 0, size, 0, full, search)
  ).then(data => {
    data.latestEmail.reqAccountId = accountId;
    data.latestEmail.allReceive = allReceive;
    return data;
  })
}

function getAllReceive() {
  return Number(accountStore.currentAccount?.allReceive || 0)
}

</script>
<style>
.icon {
  cursor: pointer;
}

</style>
