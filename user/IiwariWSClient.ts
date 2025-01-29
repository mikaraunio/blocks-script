import {Script, ScriptEnv} from "system_lib/Script";
import {property, resource} from "system_lib/Metadata";
import { SimpleWebsocket, WebsocketConnection, TextMessage } from "system/SimpleWebsocket";
import { VisitorTracking } from "./VisitorTracking";

/*

{
  "zones": [
    {
      "id": "01937754-1f08-88b2-9f9e-0d2772e16582",
      "name": "Paikannusalue"
    },
    {
      "id": "01937757-eb43-c8c8-8812-b8aa0ba9768c",
      "name": "Trigger1"
    },
    {
      "id": "01937758-b940-9b3f-8122-058e92efef0b",
      "name": "Trigger2"
    },
    {
      "id": "01937758-e2e7-294f-5cd0-36168e5729a2",
      "name": "Trigger3"
    },
    {
      "id": "01937759-48bf-4012-2225-49b653b93247",
      "name": "Messut"
    },
    {
      "id": "0193775a-042a-2efa-e5e8-f5dea9b7f330",
      "name": "Materials"
    },
    {
      "id": "0193775a-5003-ce40-18e2-b32b8a15c5ea",
      "name": "Moving screen"
    },
    {
      "id": "0193775a-a067-b818-9d85-b7216020c229",
      "name": "Screens"
    }
  ]
}

*/

const RECONN_DELAY_MS = 2.5 * 1000;
const HEARTBEAT_INTERVAL_MS = 0;
const RECEIVE_TIMEOUT_MS = 30 * 1000;
// const URL = 'wss://dash.iiwari.cloud/api/v1/sites/016fd235-8e10-1486-23f6-5e6cc6f4827b/stream?events=20,21'  // Iiwari Snowpolis Test
const URL = 'wss://dash.iiwari.cloud/api/v1/sites/01937750-6649-c7b2-cb9c-81305a6e45c3/stream?events=20,21'  // Tripla
// const URL = 'ws://192.168.2.245:8123/'  // Local wscat test
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
		(((Script as any).user.VisitorTracking) as VisitorTracking).simulateRfid('FOO', 'FOOFOO')
	}
}
