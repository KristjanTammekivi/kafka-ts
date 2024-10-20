import { TcpSocketConnectOpts } from "net";
import { TLSSocketOptions } from "tls";
import { API } from "./api";
import { Connection, SendRequest } from "./connection";
import { KafkaTSError } from "./utils/error";
import { memo } from "./utils/memo";

export type SASLOptions = { mechanism: "PLAIN"; username: string; password: string };

type BrokerOptions = {
    clientId: string | null;
    options: TcpSocketConnectOpts;
    sasl: SASLOptions | null;
    ssl: TLSSocketOptions | null;
};

export class Broker {
    private connection: Connection;
    public sendRequest: SendRequest;

    constructor(private options: BrokerOptions) {
        this.connection = new Connection({
            clientId: this.options.clientId,
            connection: this.options.options,
            ssl: this.options.ssl,
        });
        this.sendRequest = this.connection.sendRequest.bind(this.connection);
    }

    public async connect() {
        await this.connection.connect();
        await this.validateApiVersions();
        await this.saslHandshake();
        await this.saslAuthenticate();
        return this;
    }

    public ensureConnected = memo(() => this.connect());

    public async disconnect() {
        await this.connection.disconnect();
    }

    private async validateApiVersions() {
        const { versions } = await this.sendRequest(API.API_VERSIONS, {});

        const apiByKey = Object.fromEntries(Object.values(API).map((api) => [api.apiKey, api]));
        versions.forEach(({ apiKey, minVersion, maxVersion }) => {
            if (!apiByKey[apiKey]) {
                return;
            }
            const { apiVersion } = apiByKey[apiKey];
            if (apiVersion < minVersion || apiVersion > maxVersion) {
                throw new KafkaTSError(`API ${apiKey} version ${apiVersion} is not supported by the broker`);
            }
        });
    }

    private async saslHandshake() {
        if (!this.options.sasl) {
            return;
        }
        await this.sendRequest(API.SASL_HANDSHAKE, { mechanism: this.options.sasl.mechanism });
    }

    private async saslAuthenticate() {
        if (this.options.sasl?.mechanism !== "PLAIN") {
            return;
        }
        const { username, password } = this.options.sasl;
        const authBytes = [null, username, password].join("\u0000");
        await this.sendRequest(API.SASL_AUTHENTICATE, { authBytes: Buffer.from(authBytes) });
    }
}
