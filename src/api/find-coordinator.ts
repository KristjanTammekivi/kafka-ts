import { createApi } from "../utils/api";
import { KafkaTSApiError } from "../utils/error";

export const KEY_TYPE = {
    GROUP: 0,
    TRANSACTION: 1,
};

export const FIND_COORDINATOR = createApi({
    apiKey: 10,
    apiVersion: 4,
    request: (encoder, data: { keyType: number; keys: string[] }) =>
        encoder
            .writeUVarInt(0)
            .writeInt8(data.keyType)
            .writeCompactArray(data.keys, (encoder, key) => encoder.writeCompactString(key))
            .writeUVarInt(0),
    response: (decoder) => {
        const result = {
            _tag: decoder.readTagBuffer(),
            throttleTimeMs: decoder.readInt32(),
            coordinators: decoder.readCompactArray((decoder) => ({
                key: decoder.readCompactString(),
                nodeId: decoder.readInt32(),
                host: decoder.readCompactString()!,
                port: decoder.readInt32(),
                errorCode: decoder.readInt16(),
                errorMessage: decoder.readCompactString(),
                _tag: decoder.readTagBuffer(),
            })),
            _tag2: decoder.readTagBuffer(),
        };
        result.coordinators.forEach((coordinator) => {
            if (coordinator.errorCode)
                throw new KafkaTSApiError(coordinator.errorCode, coordinator.errorMessage, result);
        });
        return result;
    },
});
