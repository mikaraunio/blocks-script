import {Script, ScriptEnv} from "system_lib/Script";
import {property, resource} from "system_lib/Metadata";
import { SimpleWebsocket, WebsocketConnection, TextMessage } from "system/SimpleWebsocket";

const RECONN_DELAY_MS = 2500;
const URL = 'ws://192.168.2.245:8123/'
const HEADERS = {
	'Authorization': 'Bearer c7IIiWxOXC6jWwSPDvSWDKf5lfEUcsR79djeK5T3ScRKOMWFy4hVhU5N3l5PaOsi7VsUeXF3i7o8yfcTaB',
}

export class IiwariWSClient extends Script {
	private mLastMessage = "";	// Backing store for lastMessage property
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
			console.log('Iiwari WS connected')
			connection.subscribe('textReceived', this.handleMessage);
			connection.subscribe('finish', (sender) => {
				console.log('Iiwari WS disconnected, reconnecting in ' + RECONN_DELAY_MS + ' ms');
				const reconnectAwaiter = wait(RECONN_DELAY_MS);
				reconnectAwaiter.then(() => this.connect());

			});
		})
	}

	private handleMessage(sender: WebsocketConnection, message: TextMessage) {
		console.log(message.text);
	}
}
