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
            randomEmailMode: 'letters,numbers',
            randomEmailDomainSource: 'cloudflare',
            randomEmailDomainList: '',
            randomEmailAvailableDomainList: [],
            debug: 0,
            sidebarMenuConfig: '',
            authDomainSource: 'cloudflare',
            authDomainList: '',
            loginRegisterDomainList: [],
        },
        lang: '',
    }),
    actions: {

    },
    persist: {
        pick: ['lang'],
    },
})
