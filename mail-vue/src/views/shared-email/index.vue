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
      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="loadList"/>
    </div>
    <el-table
        :data="list"
        height="100%"
        v-loading="loading"
        element-loading-background="transparent"
    >
      <el-table-column prop="address" :label="$t('emailAccount')" min-width="210"/>
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
      <el-table-column :label="$t('action')" width="250" fixed="right">
        <template #default="{row}">
          <div class="actions">
            <el-button size="small" @click="copyCached(row)">{{ $t('copy') }}</el-button>
            <el-button size="small" @click="openEdit(row)">{{ $t('change') }}</el-button>
            <el-button size="small" type="primary" @click="openReset(row)">{{ $t('reset') }}</el-button>
            <el-button size="small" @click="cancel(row)">{{ $t('cancel') }}</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <email-share-dialog
        v-model="dialogShow"
        :share="currentShare"
        :admin="scope === 'all'"
        @changed="loadList"
    />
  </div>
</template>

<script setup>
import {computed, defineOptions, ref} from "vue";
import {Icon} from "@iconify/vue";
import {useI18n} from "vue-i18n";
import {useUserStore} from "@/store/user.js";
import {adminEmailShareCancel, adminEmailShareList, emailShareCancel, emailShareList} from "@/request/email-share.js";
import {formatDetailDate} from "@/utils/day.js";
import EmailShareDialog from "@/components/email-share-dialog/index.vue";

defineOptions({
  name: 'shared-email'
})

const {t} = useI18n()
const userStore = useUserStore()
const loading = ref(false)
const list = ref([])
const scope = ref('mine')
const dialogShow = ref(false)
const currentShare = ref(null)

const isAdmin = computed(() => userStore.user?.permKeys?.includes('*'))

loadList()

function loadList() {
  loading.value = true
  const request = scope.value === 'all' ? adminEmailShareList : emailShareList
  request().then(data => {
    list.value = data || []
  }).finally(() => {
    loading.value = false
  })
}

function copyCached(row) {
  const url = localStorage.getItem(`email-share-url-${row.shareLinkId}`)
  if (!url) {
    ElMessage({
      message: t('shareLinkOnlyShownAfterGenerate'),
      type: 'warning',
      plain: true
    })
    return
  }
  navigator.clipboard.writeText(url).then(() => {
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true
    })
  })
}

function openEdit(row) {
  currentShare.value = row
  dialogShow.value = true
}

function openReset(row) {
  currentShare.value = row
  dialogShow.value = true
}

function cancel(row) {
  const request = scope.value === 'all' ? adminEmailShareCancel : emailShareCancel
  request(row.accountId, row.shareLinkId).then(() => {
    ElMessage({
      message: t('shareLinkCancelled'),
      type: 'success',
      plain: true
    })
    loadList()
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
  display: flex;
  justify-content: space-between;
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
}

.page-title {
  font-weight: 700;
  white-space: nowrap;
}

.icon {
  cursor: pointer;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(76px, 1fr));
  gap: 6px;
}

.actions :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}
</style>
