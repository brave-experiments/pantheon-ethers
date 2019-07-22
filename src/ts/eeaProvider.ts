
import { TransactionReceipt, TransactionRequest, TransactionResponse } from "@ethersproject/abstract-provider";
import { BigNumber } from "@ethersproject/bignumber";
import { hexDataLength, hexValue } from "@ethersproject/bytes";
import { hexlify } from "./bytes";
import * as errors from "@ethersproject/errors";
import { Networkish } from "@ethersproject/networks";
import { checkProperties, resolveProperties, shallowCopy } from "@ethersproject/properties";
import { JsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";
import { ConnectionInfo, fetchJson, poll } from "@ethersproject/web";

import { EeaFormatter } from './eeaFormatter'
import { PrivacyGroupOptions, generatePrivacyGroup } from './privacyGroup'
import { EeaTransaction, allowedTransactionKeys } from './eeaTransaction'
import * as RegEx from './utils/RegEx'

export class EeaJsonRpcSigner extends JsonRpcSigner {

    sendUncheckedTransaction(transaction: TransactionRequest): Promise<string> {
        transaction = shallowCopy(transaction);

        let fromAddress = this.getAddress().then((address) => {
            if (address) { address = address.toLowerCase(); }
            return address;
        });

        // The JSON-RPC for eth_sendTransaction uses 90000 gas; if the user
        // wishes to use this, it is easy to specify explicitly, otherwise
        // we look it up for them.
        if (transaction.gasLimit == null) {
            let estimate = shallowCopy(transaction);
            estimate.from = fromAddress;
            transaction.gasLimit = this.provider.estimateGas(estimate);
        }

        return Promise.all([
            resolveProperties(transaction),
            fromAddress
        ]).then((results) => {
            let tx = results[0];
            let hexTx = (<any>this.provider.constructor).hexlifyTransaction(tx);
            hexTx.from = results[1];

            // method overridden to use EEA send transaction
            return this.provider.send("eea_sendTransaction", [ hexTx ]).then((hash) => {
                return hash;
            }, (error) => {
                if (error.responseText) {
                    // See: JsonRpcProvider.sendTransaction (@TODO: Expose a ._throwError??)
                    if (error.responseText.indexOf("insufficient funds") >= 0) {
                        errors.throwError("insufficient funds", errors.INSUFFICIENT_FUNDS, {
                            transaction: tx
                        });
                    }
                    if (error.responseText.indexOf("nonce too low") >= 0) {
                        errors.throwError("nonce has already been used", errors.NONCE_EXPIRED, {
                            transaction: tx
                        });
                    }
                    if (error.responseText.indexOf("replacement transaction underpriced") >= 0) {
                        errors.throwError("replacement fee too low", errors.REPLACEMENT_UNDERPRICED, {
                            transaction: tx
                        });
                    }
                }
                throw error;
            });
        });
    }
}


function getResult(payload: { error?: { code?: number, data?: any, message?: string }, result?: any }): any {
    if (payload.error) {
        // @TODO: not any
        let error: any = new Error(payload.error.message);
        error.code = payload.error.code;
        error.data = payload.error.data;
        throw error;
    }

    return payload.result;
}

function getLowerCase(value: string): string {
    if (value) { return value.toLowerCase(); }
    return value;
}

let defaultFormatter: EeaFormatter = null;

export class EeaJsonRpcProvider extends JsonRpcProvider {

    formatter: EeaFormatter;

    constructor(url?: ConnectionInfo | string, network?: Networkish) {

        super(url, network);

        this.formatter = new.target.getFormatter();
    }

    static getFormatter(): EeaFormatter {
        if (defaultFormatter == null) {
            defaultFormatter = new EeaFormatter();
        }
        return defaultFormatter;
    }

    send(method: string, params: any): Promise<any> {
        const id = this._nextId++
        let request = {
            method: method,
            params: params,
            id,
            jsonrpc: "2.0"
        };

        return fetchJson(this.connection, JSON.stringify(request), getResult)
            .then((result) => {
                this.emit("debug", {
                    action: "send",
                    request: request,
                    response: result,
                    provider: this
                });

                if (result && result.message) {
                    throw errors.makeError(result.message, result.code, {})
                }

                return result;
            })
            .catch((err) => {
                throw errors.makeError(`Failed JSON-RPC call.`, err.code, {
                    method, params, cause: err,
                });
            });
    }

    sendPrivateTransaction(signedTransaction: string | Promise<string>): Promise<TransactionResponse> {
        return this._runPerform("sendPrivateTransaction", {
            signedTransaction: () => Promise.resolve(signedTransaction).then(t => hexlify(t))
        }).then((result) => {
            const parsedTransaction = this.formatter.transaction(signedTransaction)
            return this._wrapTransaction(parsedTransaction, result);
        }, (error) => {
            error.transaction = this.formatter.transaction(signedTransaction);
            if (error.transaction.hash) {
                (<any>error).transactionHash = error.transaction.hash;
            }
            throw error;
        });
    }

    _wrapTransaction(tx: EeaTransaction, hash?: string): TransactionResponse {
        if (hash != null && hexDataLength(hash) !== 32) { throw new Error("invalid response - sendPrivateTransaction"); }

        // @ts-ignore
        let result = <TransactionResponse>tx;

        // Check the hash we expect is the same as the hash the server reported
        if (hash != null && tx.hash !== hash) {
            // TODO do not throw an error for now.
            // Pantheon derives the transaction hash differently for private transactions so will remove this check for now
            // Pantheon transaction hash code
            // https://github.com/PegaSysEng/pantheon/blob/8d43c888491e10905c42be9a4feedbb1332c4ef5/ethereum/core/src/main/java/tech/pegasys/pantheon/ethereum/privacy/PrivateTransaction.java#L385
            tx.hash = hash
            // errors.throwError("Transaction hash mismatch from Provider.sendPrivateTransaction.", errors.UNKNOWN_ERROR, { expectedHash: tx.hash, returnedHash: hash });
        }

        // @TODO: (confirmations? number, timeout? number)
        result.wait = (confirmations?: number) => {

            // We know this transaction *must* exist (whether it gets mined is
            // another story), so setting an emitted value forces us to
            // wait even if the node returns null for the receipt
            if (confirmations !== 0) {
                this._emitted["t:" + tx.hash] = "pending";
            }

            return this.waitForTransaction(tx.hash, confirmations).then((receipt) => {
                if (receipt == null && confirmations === 0) { return null; }

                // No longer pending, allow the polling loop to garbage collect this
                this._emitted["t:" + tx.hash] = receipt.blockNumber;

                if (receipt.status === 0) {
                    errors.throwError("transaction failed", errors.CALL_EXCEPTION, {
                        transactionHash: tx.hash,
                        transaction: tx
                    });
                }
                return receipt;
            });
        };

        return result;
    }

    _getPrivacyGroupId(privacyGroupOptions: PrivacyGroupOptions): Promise<string> {

        let privacyGroupId: string

        if (typeof(privacyGroupOptions) !== 'object') {
            errors.throwArgumentError("invalid privacyGroupOptions. Has to be object with privateFrom and either privateFor or privacyGroupId.", "privacyGroupOptions", privacyGroupOptions);
        }

        if (privacyGroupOptions.hasOwnProperty('privacyGroupId')) {
            if (typeof(privacyGroupOptions.privacyGroupId) === 'string' &&
                privacyGroupOptions.privacyGroupId.match(RegEx.base64) &&
                privacyGroupOptions.privacyGroupId.length === 44) {

                privacyGroupId = privacyGroupOptions.privacyGroupId;
            }
            else {
                errors.throwArgumentError("invalid privacyGroupId. Has to be base64 encoded string of 44 characters.", "privacyGroupId", privacyGroupOptions);
            }
        }
        // No privacyGroupId so need to generate from privateFrom and privateFor properties
        else if (privacyGroupOptions.hasOwnProperty('privateFrom') &&
            privacyGroupOptions.hasOwnProperty('privateFor')
        ) {
            privacyGroupId = generatePrivacyGroup(privacyGroupOptions)
        }
        else {
            errors.throwArgumentError("invalid privacyGroupOptions. Either privacyGroupId or privateFrom and privateFor properties must exist", "privacyGroupOptions", privacyGroupOptions);
        }

        return Promise.resolve(privacyGroupId);
    }

    getPrivateTransactionCount(
        addressOrName: string | Promise<string>,
        privacyGroupOptions: PrivacyGroupOptions,
    ): Promise<number> {
        return this._runPerform("getPrivateTransactionCount", {
            address: () => this._getAddress(addressOrName),
            privacyGroupId: () => this._getPrivacyGroupId(privacyGroupOptions),
        }).then((result: any) => {
            return BigNumber.from(result).toNumber();
        });
    }

    getPrivateTransactionReceipt(transactionHash: string): Promise<TransactionReceipt> {
        return this.ready.then(() => {
            return resolveProperties({ transactionHash: transactionHash }).then(({ transactionHash }) => {
                let params = { transactionHash: this.formatter.hash(transactionHash, true) };
                return poll(() => {
                    return this.perform("getPrivateTransactionReceipt", params).then((result) => {
                        if (result == null) {
                            if (this._emitted["t:" + transactionHash] == null) {
                                return null;
                            }
                            return undefined;
                        }

                        return this.formatter.privateReceipt(result);
                    }).catch((err) => {
                        errors.throwError(`Failed to get private transaction receipt for tx hash ${transactionHash}. Error: ${err.message}`, err.code, err);
                    });
                }, { onceBlock: this });
            });
        });
    }

    createPrivacyGroup(
        privateFrom: string | Promise<string>,
        name: string | Promise<string>,
        description: string | Promise<string>,
        addresses: string[] | Promise<string[]>,
    ): Promise<string> {
        return this._runPerform("createPrivacyGroup", {
            privateFrom: () => Promise.resolve(privateFrom),
            name: () => Promise.resolve(name),
            description: () => Promise.resolve(description),
            addresses: () => Promise.resolve(addresses),
        });
    }

    deletePrivacyGroup(
        privateFrom: string | Promise<string>,
        privacyGroupId: string | Promise<string>,
    ): Promise<string> {
        return this._runPerform("deletePrivacyGroup", {
            privateFrom: () => Promise.resolve(privateFrom),
            privacyGroupId: () => Promise.resolve(privacyGroupId),
        });
    }

    findPrivacyGroup(
        addresses: string[] | Promise<string[]>,
    ): Promise<string[]> {
        return this._runPerform("findPrivacyGroup", {
            addresses: () => Promise.resolve(addresses),
        });
    }

    // Override the base perform method to add the eea calls
    perform(method: string, params: any): Promise<any> {
        switch (method) {
            case "sendPrivateTransaction":
                // method overridden to use EEA send raw transaction
                return this.send("eea_sendRawTransaction", [ params.signedTransaction ])
                    .catch((error: any) => {
                        if (error.responseText) {
                            // "insufficient funds for gas * price + value"
                            if (error.responseText.indexOf("insufficient funds") > 0) {
                                errors.throwError("insufficient funds", errors.INSUFFICIENT_FUNDS, { });
                            }
                            // "nonce too low"
                            if (error.responseText.indexOf("nonce too low") > 0) {
                                errors.throwError("nonce has already been used", errors.NONCE_EXPIRED, { });
                            }
                            // "replacement transaction underpriced"
                            if (error.responseText.indexOf("replacement transaction underpriced") > 0) {
                                errors.throwError("replacement fee too low", errors.REPLACEMENT_UNDERPRICED, { });
                            }
                        }
                        throw error;
                    });

            case "getPrivateTransactionCount":
                return this.send("eea_getTransactionCount", [ getLowerCase(params.address), params.privacyGroupId ]);

            case "getPrivateTransactionReceipt":
                return this.send("eea_getTransactionReceipt", [ params.transactionHash ]);

            case "createPrivacyGroup":
                return this.send("eea_createPrivacyGroup", [
                    params.privateFrom,
                    params.name,
                    params.description,
                    params.addresses]);

            case "deletePrivacyGroup":
                return this.send("eea_deletePrivacyGroup", [ params.privateFrom, params.privacyGroupId ]);

            case "findPrivacyGroup":
                return this.send("eea_findPrivacyGroup", [ params.addresses ]);

            default:
                return super.perform(method, params)
        }
    }


    // Convert an ethers.js transaction into a JSON-RPC transaction
    //  - gasLimit => gas
    //  - All values hexlified
    //  - All numeric values zero-striped
    // NOTE: This allows a TransactionRequest, but all values should be resolved
    //       before this is called
    static hexlifyTransaction(transaction: TransactionRequest, allowExtra?: { [key: string]: boolean }): { [key: string]: string } {
        // Check only allowed properties are given
        let allowed = shallowCopy(allowedTransactionKeys);
        if (allowExtra) {
            for (let key in allowExtra) {
                if (allowExtra[key]) { allowed[key] = true; }
            }
        }
        checkProperties(transaction, allowed);

        let result: { [key: string]: string } = {};

        // Some nodes (INFURA ropsten; INFURA mainnet is fine) do not like leading zeros.
        ["gasLimit", "gasPrice", "nonce", "value"].forEach(function(key) {
            if ((<any>transaction)[key] == null) { return; }
            let value = hexValue((<any>transaction)[key]);
            if (key === "gasLimit") { key = "gas"; }
            result[key] = value;
        });

        ["from", "to", "data"].forEach(function(key) {
            if ((<any>transaction)[key] == null) { return; }
            result[key] = hexlify((<any>transaction)[key]);
        });

        // Add extra EEA transaction keys
        ["privateFrom", "privateFor", "restricted"].forEach(function(key) {
            if ((<any>transaction)[key] == null) { return; }
            result[key] = hexlify((<any>transaction)[key]);
        });

        return result;
    }
}
