import {Script, ScriptEnv} from "system_lib/Script";
import {property, resource} from "system_lib/Metadata";
import { SimpleWebsocket, WebsocketConnection, TextMessage } from "system/SimpleWebsocket";

const RECONN_DELAY_MS = 2500;
const HEARTBEAT_INTERVAL_MS = 5000;
const URL = 'ws://192.168.2.245:8123/'
const HEADERS = {
	'Authorization': 'Bearer c7IIiWxOXC6jWwSPDvSWDKf5lfEUcsR79djeK5T3ScRKOMWFy4hVhU5N3l5PaOsi7VsUeXF3i7o8yfcTaB',
}

export class IiwariWSClient extends Script {
	private mLastMessage = "";
	private reconnectAwaiter: CancelablePromise<void>;
	private heartbeatAwaiter: CancelablePromise<void>;
	private connection: WebsocketConnection;

	public constructor(env: ScriptEnv) {
		super(env);
		this.connect();
	}

	private connect() {
		SimpleWebsocket.connect(
			URL,
			8192,
			HEADERS
		).then((connection: WebsocketConnection) => {
			this.connection = connection;
			console.log('Iiwari WS: Connected')
			connection.subscribe('textReceived', this.handleMessage);
			connection.subscribe('finish', this.handleFinish);
			this.sendHeartbeat();
		}).catch((error) => {
			console.log('Iiwari WS: Connection failed, error:', error);
			this.reconnect();
		});
	}

	private sendHeartbeat() {
		if (!this.connection) {
			console.log('Iivari WS: Connection undefined in heartbeat sender')
			return;
		}

		this.connection.sendText('');
		if (this.heartbeatAwaiter) {
			this.heartbeatAwaiter.cancel();
		}
		this.heartbeatAwaiter = wait(HEARTBEAT_INTERVAL_MS);
		this.heartbeatAwaiter.then(() => this.sendHeartbeat());
	}

	private handleFinish(sender: WebsocketConnection) {
		console.log('Iiwari WS: Disconnected, reconnecting in ' + RECONN_DELAY_MS + ' ms');
		this.reconnect();
	}

	private reconnect() {
		console.log('Iiwari WS: Reconnecting in ' + RECONN_DELAY_MS + ' ms');
		if (this.heartbeatAwaiter) {
			this.heartbeatAwaiter.cancel();
			this.heartbeatAwaiter = undefined;
		}
		if (this.reconnectAwaiter) {
			this.reconnectAwaiter.cancel();
		}
		this.reconnectAwaiter = wait(RECONN_DELAY_MS);
		this.reconnectAwaiter.then(() => this.connect());
	}

	private handleMessage(sender: WebsocketConnection, message: TextMessage) {
		console.log(message.text);
	}
}
