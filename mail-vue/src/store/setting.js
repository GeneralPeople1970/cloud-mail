import { defineStore } from 'pinia'

export const useSettingStore = defineStore('setting', {
    state: () => ({
        domainList: [],
        settings: {
            r2Domain: '',
            loginOpacity: 1.00,
            loginDarkenFactor: 0,
            randomEmailSubdomains: '',
            randomEmailLength: 10,
            randomEmailMode: 'alnum',
        },
        lang: '',
    }),
    actions: {

    },
    persist: {
        pick: ['lang'],
    },
})
