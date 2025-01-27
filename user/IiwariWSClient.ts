import {Script, ScriptEnv} from "system_lib/Script";
import {property, resource} from "system_lib/Metadata";
import { SimpleWebsocket, WebsocketConnection, TextMessage } from "system/SimpleWebsocket";

const reconnDelayMs = 500;
const address = 'ws://192.168.2.245:8123/'

export class IiwariWSClient extends Script {
	private mLastMessage = "";	// Backing store for lastMessage property
	private resetTimer?: CancelablePromise<any>; // Message reset timer, if any

	public constructor(env: ScriptEnv) {
		super(env);
		this.connect();
	}

	private connect() {
		SimpleWebsocket.connect(address).then((connection: WebsocketConnection) => {
			console.log('Iiwari WS connected')
			connection.subscribe('textReceived', this.handleMessage);
			connection.subscribe('finish', (sender) => {
				console.log('Iiwari WS disconnected, reconnecting in ' + reconnDelayMs + ' ms')
				const reconnectAwaiter = wait(reconnDelayMs);
				reconnectAwaiter.then(() => this.connect());
			})
		})
	}

	private handleMessage(sender: WebsocketConnection, message: TextMessage) {
		console.log(message.text);
	}
}
