import http from '@/axios/index.js';

export function randomEmailList(params) {
    return http.get('/randomEmail/list', {params: {...params}})
}

export function randomEmailLatest(address, emailId) {
    return http.get('/randomEmail/latest', {params: {address, emailId}, noMsg: true, timeout: 35 * 1000})
}
