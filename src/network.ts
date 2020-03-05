/* eslint-disable no-console */
import { watch } from '@vue/composition-api';
import { NetworkClient } from '@nimiq/network-client';

import { SignedTransaction } from '@nimiq/hub-api';
import { useAddressStore } from './stores/Address';
import { useTransactionsStore, Transaction } from './stores/Transactions';
import { useNetworkStore } from './stores/Network';
import { useCashlinkStore } from './stores/Cashlink';

let isLaunched = false;

export async function launchNetwork() {
    if (isLaunched) return;
    isLaunched = true;

    const client = NetworkClient.createInstance();
    await client.init();

    const { state: network$ } = useNetworkStore();
    const transactionsStore = useTransactionsStore();
    const addressStore = useAddressStore();

    function balancesListener(balances: Map<string, number>) {
        console.debug('Got new balances for', [...balances.keys()]);
        for (const [address, balance] of balances) {
            addressStore.patchAddress(address, { balance });
        }
    }
    client.on(NetworkClient.Events.BALANCES, balancesListener);

    client.on(NetworkClient.Events.CONSENSUS, (consensus) => network$.consensus = consensus);

    client.on(NetworkClient.Events.HEAD_HEIGHT, (height) => {
        console.debug('Head is now at', height);
        network$.height = height;
    });

    client.on(NetworkClient.Events.PEER_COUNT, (peerCount) => network$.peerCount = peerCount);

    function transactionListener(plain: Transaction) {
        transactionsStore.addTransactions([plain]);
    }
    client.on(NetworkClient.Events.TRANSACTION, transactionListener);

    // Subscribe to new addresses (for balance updates and transactions)
    const subscribedAddresses = new Set<string>();
    watch(addressStore.addressInfos, () => {
        const newAddresses: string[] = [];
        for (const address of Object.keys(addressStore.state.addressInfos)) {
            if (subscribedAddresses.has(address)) continue;
            subscribedAddresses.add(address);
            newAddresses.push(address);
        }
        if (!newAddresses.length) return;

        console.debug('Subscribing addresses', newAddresses);
        client.subscribe(newAddresses);
    });

    // Fetch transactions for active address
    const fetchedAddresses = new Set<string>();
    watch(addressStore.activeAddress, () => {
        const address = addressStore.activeAddress.value;

        if (!address || fetchedAddresses.has(address)) return;
        fetchedAddresses.add(address);

        const knownTxDetails = Object.values(transactionsStore.state.transactions)
            .filter((tx) => tx.sender === address || tx.recipient === address);

        network$.fetchingTxHistory++;

        console.debug('Fetching transaction history for', address, knownTxDetails);
        client.getTransactionsByAddress(address, 0, knownTxDetails, 100)
            .then((txDetails) => {
                transactionsStore.addTransactions(txDetails);
            })
            .catch(() => fetchedAddresses.delete(address))
            .finally(() => network$.fetchingTxHistory--);
    });

    // Fetch transactions for claimed cashlinks
    const cashlinkStore = useCashlinkStore();
    const fetchedCashlinks = new Set<string>();
    watch(cashlinkStore.claimed, () => {
        const newAddresses: string[] = [];
        for (const address of cashlinkStore.state.claimed) {
            if (fetchedCashlinks.has(address)) continue;
            fetchedCashlinks.add(address);
            newAddresses.push(address);
        }
        if (!newAddresses.length) return;

        console.debug(`Fetching history for ${newAddresses.length} claimed cashlink(s)`);

        for (const address of newAddresses) {
            const knownTxDetails = Object.values(transactionsStore.state.transactions)
                .filter((tx) => tx.sender === address || tx.recipient === address);

            network$.fetchingTxHistory++;

            console.debug('Fetching transaction history for', address, knownTxDetails);
            client.getTransactionsByAddress(address, 0, knownTxDetails, 10)
                .then((txDetails) => {
                    transactionsStore.addTransactions(txDetails);
                })
                .catch(() => fetchedCashlinks.delete(address))
                .finally(() => network$.fetchingTxHistory--);
        }
    });

    // Fetch transactions and subscribe for funded cashlinks
    watch(cashlinkStore.funded, () => {
        const newAddresses: string[] = [];
        for (const address of cashlinkStore.state.funded) {
            if (fetchedCashlinks.has(address)) continue;
            fetchedCashlinks.add(address);
            newAddresses.push(address);
        }
        if (!newAddresses.length) return;

        console.debug(`Fetching history for ${newAddresses.length} funded cashlink(s)`);

        for (const address of newAddresses) {
            const knownTxDetails = Object.values(transactionsStore.state.transactions)
                .filter((tx) => tx.sender === address || tx.recipient === address);

            network$.fetchingTxHistory++;

            console.debug('Fetching transaction history for', address, knownTxDetails);
            client.getTransactionsByAddress(address, 0, knownTxDetails, 10)
                .then((txDetails) => {
                    if (!txDetails.find((tx) => tx.sender === address)) {
                        // No claiming transactions found, subscribe address instead
                        client.subscribe(address);
                    }
                    transactionsStore.addTransactions(txDetails);
                })
                .catch(() => fetchedCashlinks.delete(address))
                .finally(() => network$.fetchingTxHistory--);
        }
    });
}

export async function sendTransaction(tx: SignedTransaction) {
    launchNetwork();

    const client = NetworkClient.Instance;

    return client.sendTransaction(tx.serializedTx as any);
}
