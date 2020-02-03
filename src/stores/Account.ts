import { createStore } from 'pinia'
import { Account } from '@nimiq/hub-api';
import { useAddressStore } from './Address';

export type AccountState = {
    accountInfos: {[id: string]: AccountInfo},
    activeAccountId: string | null,
}

// Mirror of Hub WalletType, which is not exported
export enum AccountType {
    LEGACY = 1,
    BIP39 = 2,
    LEDGER = 3,
}

export type AccountInfo = Omit<Account, 'accountId' | 'type' | 'contracts' | 'addresses'> & {
    id: string,
    type: AccountType,
    addresses: string[],
}

export const useAccountStore = createStore({
    id: 'accounts',
    state: () => ({
        accountInfos: {},
        activeAccountId: 'abc',
    } as AccountState),
    getters: {
        accountInfos: state => state.accountInfos,
        activeAccountId: state => state.activeAccountId,
        activeAccountInfo: state => state.activeAccountId
            ? state.accountInfos[state.activeAccountId]
            : null,
    },
    actions: {
        selectAccount(accountId: string) {
            this.state.activeAccountId = accountId;
            const { selectAddress } = useAddressStore();

            // FIXME: Instead of always selecting the first address, store which address was selected per account.
            selectAddress(this.activeAccountInfo.value!.addresses[0])
        },
        addAccountInfo(accountInfo: AccountInfo, selectIt = true) {
            // Need to re-assign the whole object in Vue 2 for change detection.
            // TODO: Only add new accountInfo in Vue 3.
            this.state.accountInfos = {
                ...this.state.accountInfos,
                [accountInfo.id]: accountInfo,
            };

            if (selectIt) this.state.activeAccountId = accountInfo.id;
        },
        setAccountInfos(accountInfos: AccountInfo[]) {
            const newAccountInfos: {[id: string]: AccountInfo} = {}

            for (const accountInfo of accountInfos) {
                newAccountInfos[accountInfo.id] = accountInfo
            }

            this.state.accountInfos = newAccountInfos;

            // If no account selected yet, or selected account does not exist anymore, select the first available.
            // TODO: Replace with account selection screen?
            if (!this.state.activeAccountId || !this.state.accountInfos[this.state.activeAccountId]) {
                this.state.activeAccountId = accountInfos[0] ? accountInfos[0].id : null;
            }
        },
        updateLabel(accountId, newLabel) {
            this.state.accountInfos[accountId].label = newLabel;
        },
        addAddressToAccount(accountId: string, address: string) {
            if (this.state.accountInfos[accountId].addresses.includes(address)) return;
            this.state.accountInfos[accountId].addresses.push(address);
        }
    },
})