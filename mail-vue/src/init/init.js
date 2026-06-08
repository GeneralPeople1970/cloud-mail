import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import router from "@/router";
import {websiteConfig} from "@/request/setting.js";
import i18n from "@/i18n/index.js";
import {setDebugEnabled} from "@/utils/debug-capture.js";

export async function init() {
    document.title = '\u200B'

    const settingStore = useSettingStore();
    const userStore = useUserStore();
    const accountStore = useAccountStore();

    const token = localStorage.getItem('token');
    if (!settingStore.lang) {
        let lang = navigator.language.split('-')[0]
        lang = lang === 'zh' ? lang : 'en'
        settingStore.lang = lang
    }

    i18n.global.locale.value = settingStore.lang

    let setting = null;

    if (token) {
        const userPromise = loginUserInfo().catch(e => {
            console.error(e);
            return null;
        });

        const [s, user] = await Promise.all([loadWebsiteConfig(), userPromise]);
        setting = s;
        settingStore.settings = setting;
        setDebugEnabled(Number(setting.debug) === 1);
        settingStore.domainList = setting.domainList;
        document.title = setting.title;

        if (user) {
            accountStore.currentAccountId = user.account.accountId;
            accountStore.currentAccount = user.account;
            userStore.user = user;

            const routers = permsToRouter(user.permKeys);
            routers.forEach(routerData => {
                router.addRoute('layout', routerData);
            });
        }

    } else {
        setting = await loadWebsiteConfig();
        settingStore.settings = setting;
        setDebugEnabled(Number(setting.debug) === 1);
        settingStore.domainList = setting.domainList;
        document.title = setting.title;
    }
}

async function loadWebsiteConfig() {
    try {
        const setting = await websiteConfig();
        return normalizeWebsiteConfig(setting);
    } catch (error) {
        console.error('websiteConfig failed', error);
        return normalizeWebsiteConfig({});
    }
}

function normalizeWebsiteConfig(setting = {}) {
    return {
        ...setting,
        title: setting.title || 'Cloud Mail',
        domainList: Array.isArray(setting.domainList) ? setting.domainList : [],
        background: setting.background || '',
        r2Domain: setting.r2Domain || '',
        loginOpacity: setting.loginOpacity ?? 1,
        loginDarkenFactor: setting.loginDarkenFactor ?? 0,
        manyEmail: setting.manyEmail ?? 0,
        addEmail: setting.addEmail ?? 0,
        register: setting.register ?? 1,
        loginDomain: setting.loginDomain ?? 1,
        linuxdoSwitch: setting.linuxdoSwitch ?? false,
        minEmailPrefix: setting.minEmailPrefix ?? 1,
        randomEmailSubdomains: setting.randomEmailSubdomains ?? '',
        randomEmailLength: setting.randomEmailLength ?? 10,
        randomEmailMode: setting.randomEmailMode || 'letters,numbers',
        randomEmailDomainSource: setting.randomEmailDomainSource === 'custom' ? 'custom' : 'cloudflare',
        randomEmailDomainList: setting.randomEmailDomainList || '',
        randomEmailAvailableDomainList: Array.isArray(setting.randomEmailAvailableDomainList)
            ? setting.randomEmailAvailableDomainList
            : (Array.isArray(setting.domainList) ? setting.domainList : []),
        debug: Number(setting.debug) === 1 ? 1 : 0,
        expiredEmailAutoDelete: Number(setting.expiredEmailAutoDelete) === 1 ? 1 : 0,
        expiredEmailDays: normalizeExpiredEmailDays(setting.expiredEmailDays),
        sidebarMenuConfig: setting.sidebarMenuConfig || '',
        authDomainSource: setting.authDomainSource === 'custom' ? 'custom' : 'cloudflare',
        authDomainList: setting.authDomainList || '',
        loginRegisterDomainList: Array.isArray(setting.loginRegisterDomainList)
            ? setting.loginRegisterDomainList
            : (Array.isArray(setting.domainList) ? setting.domainList : [])
    };
}

function normalizeExpiredEmailDays(value) {
    const days = Number(value)
    if (!days || Number.isNaN(days) || days < 1) return 30
    return Math.min(3650, Math.floor(days))
}
