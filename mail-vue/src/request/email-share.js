import http from '@/axios/index.js';

export function emailShareStatus(accountId) {
    return http.get('/emailShare/status', {params: {accountId}})
}

export function emailShareAddressStatus(address) {
    return http.get('/emailShare/status', {params: {address}})
}

export function emailShareList() {
    return http.get('/emailShare/list')
}

export function emailShareAccountStatusMap() {
    return http.get('/emailShare/accountStatusMap')
}

export function emailShareSave(accountId, expireTime, address) {
    return http.post('/emailShare/save', {accountId, expireTime, address})
}

export function emailShareUpdate(shareLinkId, expireTime) {
    return http.post('/emailShare/update', {shareLinkId, expireTime})
}

export function emailShareReset(shareLinkId, expireTime) {
    return http.post('/emailShare/reset', {shareLinkId, expireTime})
}

export function emailShareCancel(accountId, shareLinkId) {
    return http.post('/emailShare/cancel', {accountId, shareLinkId})
}

export function adminEmailShareStatus(accountId) {
    return http.get('/emailShare/admin/status', {params: {accountId}})
}

export function adminEmailShareAddressStatus(address) {
    return http.get('/emailShare/admin/status', {params: {address}})
}

export function adminEmailShareList() {
    return http.get('/emailShare/admin/list')
}

export function adminEmailShareSave(accountId, expireTime, address) {
    return http.post('/emailShare/admin/save', {accountId, expireTime, address})
}

export function adminEmailShareBatchSave(addresses, expireTime) {
    return http.post('/emailShare/admin/batchSave', {addresses, expireTime})
}

export function adminEmailShareUpdate(shareLinkId, expireTime) {
    return http.post('/emailShare/admin/update', {shareLinkId, expireTime})
}

export function adminEmailShareReset(shareLinkId, expireTime) {
    return http.post('/emailShare/admin/reset', {shareLinkId, expireTime})
}

export function adminEmailShareCancel(accountId, shareLinkId) {
    return http.post('/emailShare/admin/cancel', {accountId, shareLinkId})
}

export function publicEmailShareMeta(token) {
    return http.get('/emailShare/public/meta', {params: {token}, noMsg: true})
}

export function publicEmailShareList(params) {
    return http.get('/emailShare/public/list', {params, noMsg: true})
}

export function publicEmailShareLatest(token, emailId) {
    return http.get('/emailShare/public/latest', {params: {token, emailId}, noMsg: true, timeout: 35 * 1000})
}

export function publicEmailShareDetail(token, emailId) {
    return http.get('/emailShare/public/detail', {params: {token, emailId}, noMsg: true})
}
