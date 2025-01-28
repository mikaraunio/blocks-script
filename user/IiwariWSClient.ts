import {Script, ScriptEnv} from "system_lib/Script";
import {property, resource} from "system_lib/Metadata";
import { SimpleWebsocket, WebsocketConnection, TextMessage } from "system/SimpleWebsocket";

const RECONN_DELAY_MS = 2.5 * 1000;
const HEARTBEAT_INTERVAL_MS = 0;
const RECEIVE_TIMEOUT_MS = 30 * 1000;
const URL = 'wss://dash.iiwari.cloud/api/v1/sites/016fd235-8e10-1486-23f6-5e6cc6f4827b/stream?events=20,21'
// const URL = 'ws://192.168.2.245:8123/'
const HEADERS = {
	'Authorization': 'Bearer c7IIiWxOXC6jWwSPDvSWDKf5lfEUcsR79djeK5T3ScRKOMWFy4hVhU5N3l5PaOsi7VsUeXF3i7o8yfcTaB',
}

export class IiwariWSClient extends Script {
	private mLastMessage: string = "";
	private reconnectAwaiter: CancelablePromise<void> | undefined = undefined;
	private heartbeatAwaiter: CancelablePromise<void> | undefined = undefined;
	private receiveTimeoutAwaiter: CancelablePromise<void> | undefined = undefined;
	private connection: WebsocketConnection | undefined = undefined;
	private lastReceivedTimestamp: number | undefined = undefined;

	public constructor(env: ScriptEnv) {
		super(env);
		console.log('Iiwari WS: Started')
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
			connection.subscribe('textReceived', (sender: WebsocketConnection, message: TextMessage) => this.handleMessage(sender, message));
			connection.subscribe('finish', (sender) => this.handleFinish(sender));
			this.lastReceivedTimestamp = Date.now();
			this.sendHeartbeat();
			this.waitForReceiveTimeout();
		}).catch((error) => {
			console.log('Iiwari WS: Connection failed, error:', error);
			this.reconnect();
		});
	}

	private waitForReceiveTimeout() {
		if (RECEIVE_TIMEOUT_MS == 0) {
			console.log('Iivari WS: Receive timeouts disabled')
			return;
		}

		this.receiveTimeoutAwaiter = wait(RECEIVE_TIMEOUT_MS);
		this.receiveTimeoutAwaiter.then(() => {
			if (!this.connection) {
				console.log('Iivari WS: Connection already closed when entering receive timeout handler')
				return;
			}
			if (this.lastReceivedTimestamp  && (Date.now() - this.lastReceivedTimestamp) > RECEIVE_TIMEOUT_MS) {
				console.log('Iivari WS: Receive timeout, no messages received in ' + RECEIVE_TIMEOUT_MS + ' ms, disconnecting')
				this.connection.disconnect();
				this.connection = undefined;
				this.reconnect();
			} else {
				this.waitForReceiveTimeout();
			}
		});

	}

	private sendHeartbeat() {
		if (HEARTBEAT_INTERVAL_MS == 0) {
			console.log('Iivari WS: Heartbeat messages disabled')
			return;
		}

		if (!this.connection) {
			console.log('Iivari WS: Skipping heartbeat send, not connected')
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
		console.log('Iiwari WS: Disconnected');
		this.connection = undefined;
		this.reconnect();
	}

	private reconnect() {
		console.log('Iiwari WS: Reconnecting in ' + RECONN_DELAY_MS + ' ms');
		if (this.heartbeatAwaiter) {
			this.heartbeatAwaiter.cancel();
			this.heartbeatAwaiter = undefined;
		}
		if (this.receiveTimeoutAwaiter) {
			this.receiveTimeoutAwaiter.cancel();
			this.receiveTimeoutAwaiter = undefined;
		}
		if (this.reconnectAwaiter) {
			this.reconnectAwaiter.cancel();
		}
		this.reconnectAwaiter = wait(RECONN_DELAY_MS);
		this.reconnectAwaiter.then(() => this.connect());
	}

	private handleMessage(sender: WebsocketConnection, message: TextMessage) {
		this.lastReceivedTimestamp = Date.now();
		console.log(message.text);
	}
}
