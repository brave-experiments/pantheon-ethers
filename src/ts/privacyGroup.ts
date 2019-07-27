
import * as errors from "@ethersproject/errors";
import { keccak256 } from "@ethersproject/keccak256";

import * as RLP from "./rlp"
import * as RegEx from './utils/RegEx'

export declare type PrivacyGroupOptions = {
    privateFrom?: string;
    privateFor?: string[] | string;
    privacyGroupId?: string;
}

// This logic has been derived from the PagaSys's EEA Web3js client
// https://github.com/PegaSysEng/web3js-eea/blob/master/src/index.js
export function generatePrivacyGroup(privacyGroupOptions: PrivacyGroupOptions): string {

    if (typeof(privacyGroupOptions) !== 'object') {
        errors.throwArgumentError("invalid PrivacyGroupOptions as not an object", "privacyGroupOptions", privacyGroupOptions);
    }

    // if privateFor is a string then it should be the privacy group id
    if (typeof(privacyGroupOptions.privateFor) === 'string') {
        if (privacyGroupOptions.privateFor.match(RegEx.base64) &&
            privacyGroupOptions.privateFor.length === 44) {

            return privacyGroupOptions.privateFor;
        }
        else {
            throw errors.makeError("invalid privateFor. When set to the privacy group, it needs to be a base64 encoded string of 44 characters", "privacyGroupOptions.privateFor", privacyGroupOptions);
        }
    }

    // throw if privateFor is not a string, not an array or an empty array
    if (!Array.isArray(privacyGroupOptions.privateFor)) {
        errors.throwArgumentError("invalid privateFor. Has to be array of base64 encoded strings or the base64 encoded privacy group", "privacyGroupOptions.privateFor", privacyGroupOptions);
    }
    if (privacyGroupOptions.privateFor.length === 0) {
        errors.throwArgumentError("invalid privateFor. Empty array of base64 encoded strings", "privacyGroupOptions.privateFor", privacyGroupOptions);
    }

    if (typeof(privacyGroupOptions.privateFrom) !== 'string' ||
        !privacyGroupOptions.privateFrom.match(RegEx.base64) ||
        privacyGroupOptions.privateFrom.length !== 44)
    {
        errors.throwArgumentError("invalid privateFrom. Has to be base64 encoded string of 44 characters", "privacyGroupOptions.privateFrom", privacyGroupOptions);
    }

    privacyGroupOptions.privateFor.forEach(privateAddress => {
        if (typeof(privateAddress) !== 'string' ||
            !privateAddress.match(RegEx.base64) ||
            privateAddress.length !== 44)
        {
            errors.throwArgumentError("invalid privateFor. When an array, it needs to be base64 encoded strings of 44 characters", "privacyGroupOptions.privateFor", privacyGroupOptions);
        }
    })

    const publicAddresses = privacyGroupOptions.privateFor.concat(privacyGroupOptions.privateFrom)

    const participants = publicAddresses.map(publicKey =>
    {
            const buffer = Buffer.from(publicKey, "base64");

            let hash = 1;
            buffer.forEach(value => {
                // Do some tricky bit operations
                hash = (31 * hash + ((value << 24) >> 24)) & 0xffffffff;
            });

            return { buffer, hash };

        })
        .sort((a, b) => a.hash - b.hash)
        .map(x => x.buffer)

    // RLP encode the array of buffers sorted by hash
    const rlp = RLP.encode(participants);

    // Get the hash of the rlp encoding
    const rlpHash = keccak256(rlp);
    // Need to strip the 0x prefix from the hex string before converting to a buffer
    const rlpHashBuf = Buffer.from(rlpHash.substring(2), 'hex');
    // Return base64 encoded
    return rlpHashBuf.toString('base64');
};
