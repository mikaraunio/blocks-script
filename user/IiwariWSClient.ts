import {Script, ScriptEnv} from "system_lib/Script";
import {property, resource} from "system_lib/Metadata";
import { SimpleWebsocket, WebsocketConnection, TextMessage } from "system/SimpleWebsocket";

const reconnDelayMs = 2500;
const address = 'ws://192.168.2.245:8123/'
const headers = {
	'Authorization': 'Bearer c7IIiWxOXC6jWwSPDvSWDKf5lfEUcsR79djeK5T3ScRKOMWFy4hVhU5N3l5PaOsi7VsUeXF3i7o8yfcTaB',
}

export class IiwariWSClient extends Script {
	private mLastMessage = "";	// Backing store for lastMessage property

	public constructor(env: ScriptEnv) {
		super(env);
		this.connect();
	}

	private connect() {
		SimpleWebsocket.connect(address, 8192, headers).then((connection: WebsocketConnection) => {
			console.log('Iiwari WS connected')
			connection.subscribe('textReceived', this.handleMessage);
			connection.subscribe('finish', (sender) => {
				console.log('Iiwari WS disconnected, reconnecting in ' + reconnDelayMs + ' ms');
				const reconnectAwaiter = wait(reconnDelayMs);
				reconnectAwaiter.then(() => this.connect());

			});
		})
	}

	private handleMessage(sender: WebsocketConnection, message: TextMessage) {
		console.log(message.text);
	}
}
