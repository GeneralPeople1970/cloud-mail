import http from '@/axios/index.js';

export function expiredEmailList(params) {
    return http.get('/expiredEmail/list', {params: {...params}})
}

export function expiredEmailDelete(emailIds) {
    return http.delete('/expiredEmail/delete?emailIds=' + emailIds)
}

export function expiredEmailBatchDelete(params) {
    return http.delete('/expiredEmail/batchDelete', {params: params})
}
