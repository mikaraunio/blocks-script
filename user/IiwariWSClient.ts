import {Script, ScriptEnv} from "system_lib/Script";
import {property, resource} from "system_lib/Metadata";
import { SimpleWebsocket, WebsocketConnection, TextMessage } from "system/SimpleWebsocket";

const RECONN_DELAY_MS = 2.5 * 1000;
const HEARTBEAT_INTERVAL_MS = 0;
const RECEIVE_TIMEOUT_MS = 30 * 1000;
const URL = 'ws://192.168.2.245:8123/'
const HEADERS = {
	'Authorization': 'Bearer c7IIiWxOXC6jWwSPDvSWDKf5lfEUcsR79djeK5T3ScRKOMWFy4hVhU5N3l5PaOsi7VsUeXF3i7o8yfcTaB',
}

export class IiwariWSClient extends Script {
	private mLastMessage = "";
	private reconnectAwaiter: CancelablePromise<void>;
	private heartbeatAwaiter: CancelablePromise<void>;
	private receiveTimeoutAwaiter: CancelablePromise<void>;
	private connection: WebsocketConnection | undefined = undefined;

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
			this.waitForReceiveTimeout();
		}).catch((error) => {
			console.log('Iiwari WS: Connection failed, error:', error);
			this.reconnect();
		});
	}

	private waitForReceiveTimeout() {
		if (RECEIVE_TIMEOUT_MS == 0) {
			console.log('Iivari WS: Disabling receive timeouts')
			return;
		}

		if (!this.connection) {
			console.log('Iivari WS: skipping receiveTimeout, not connected')
			return;
		}

		if (this.receiveTimeoutAwaiter) {
			this.receiveTimeoutAwaiter.cancel();
		}
		this.receiveTimeoutAwaiter = wait(HEARTBEAT_INTERVAL_MS);
		this.heartbeatAwaiter.then(() => {
			if (!this.connection) {
				console.log('Iivari WS: Connection already closed when entering receive timeout handler.')
				return;
			}
			console.log('Iivari WS: No messages received in ' + HEARTBEAT_INTERVAL_MS + ' ms, disconnecting.')
			this.connection.disconnect();
			this.connection = undefined;
			this.reconnect();
		});

	}

	private sendHeartbeat() {
		if (HEARTBEAT_INTERVAL_MS == 0) {
			console.log('Iivari WS: Disabling heartbeat messages')
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
		console.log('Iiwari WS: Disconnected, reconnecting in ' + RECONN_DELAY_MS + ' ms');
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
		this.waitForReceiveTimeout();
		console.log(message.text);
	}
}
