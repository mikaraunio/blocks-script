import {Script, ScriptEnv} from "system_lib/Script";
import {property, resource} from "system_lib/Metadata";
import { SimpleWebsocket, WebsocketConnection, TextMessage } from "system/SimpleWebsocket";


export class IiwariWSClient extends Script {
	private mLastMessage = "";	// Backing store for lastMessage property
	private resetTimer?: CancelablePromise<any>; // Message reset timer, if any

	public constructor(env: ScriptEnv) {
		super(env);
		this.connect();
	}

	private connect() {
		SimpleWebsocket.connect('ws://192.168.2.245/').then((connection: WebsocketConnection) => {
			connection.subscribe('textReceived', this.handleMessage);
			connection.subscribe('finish', (sender) => {
				let reconnectAwaiter = wait(500);
				reconnectAwaiter.then(() => this.connect());
			})
		})
	}

	private handleMessage(sender: WebsocketConnection, message: TextMessage) {
		console.log(message);
	}
}
