import { NetworkTCP } from "system/Network";
import { Driver } from "system_lib/Driver";
import * as Meta from "system_lib/Metadata";

@Meta.driver("NetworkTCP", { port: 23 })
export class BiampTesira extends Driver<NetworkTCP> {

	private mConnected = false; // Connected to device
	private mReady = false; // Negotiation completed
	private negotiationState: number = 0;
	private mLastSetVolume: number = 0;

	/**
	 * Create me, attached to the network socket I communicate through. When using a
	 * driver, the driver replaces the built-in functionality of the network socket
     * with the properties and callable functions exposed.
	 */
	public constructor(private socket: NetworkTCP) {
		super(socket);
		socket.autoConnect(true); // Use automatic connection mechanism
		this.mConnected = socket.connected;

		socket.subscribe("connect", (sender, message) => {
			this.connectStateChanged();
		});
		socket.subscribe("bytesReceived", (sender, msg) =>
			this.textReceived(msg.rawData)
		);
		if (socket.connected) // Socket connected up front - get going right away
			this.biAmpTesiraNegotiate();
	}

	@Meta.property("Connected to Biamp", true)
	public set connected(online: boolean) {
		this.mConnected = online;
	}
	public get connected(): boolean {
		return this.mConnected;
	}

	@Meta.property("Negotiation completed with Biamp", true)
	public set negotiated(online: boolean) {
		this.mReady = online;
	}
	public get negotiated(): boolean {
		return this.mReady;
	}

	@Meta.property("Volume", true)
	public set volume(val: number) {
		this.tell('Level1 set level 1 ' + val);
		this.mLastSetVolume =val;
	}
	public get volume(): number {
		return this.mLastSetVolume;
	}

	/**
	 * Connection state changed.
	 */
	private connectStateChanged() {
		console.info("connectStateChanged", this.socket.connected);
		this.connected = this.socket.connected; // Propagate state to clients
		if (this.socket.connected)
			this.biAmpTesiraNegotiate();
	}

	/**
	 * Got the data from Biamp Tesira Device
	 */
	private textReceived(rawData: any) {
		// Converts the rawData into hex
		let hex = this.toHex(rawData);
		// Converts the hex into ascii
		let ascii = this.toAscii(hex);
		// console.log(ascii);
		// Checks negotiation is in order
		this.biAmpTesiraNegotiate();
	}

	/**
	 * Negotiate with Biamp Tesira device
	 *
	 */
	private biAmpTesiraNegotiate() {
		if (this.socket.connected) {
			let response, converted;
			if (this.negotiationState < 3) {
				switch (this.negotiationState) {
					case 0:
						response = "\xff\xfc\x18\xff\xfc\x20\xff\xfc\x23\xff\xfc\x27\xff\xfc\x24\x0a";
						converted = this.convert(response);
						this.socket.sendBytes(converted)
						this.negotiationState = 1;
						break;
					case 1:
						response = "\xff\xfe\x03\xff\xfc\x01\xff\xfc\x22\xff\xfc\x1f\xff\xfe\x05\xff\xfc\x21\x0a";
						converted = this.convert(response);
						this.socket.sendBytes(converted)
						this.negotiationState = 2;
						break;
					case 2:
						response = "SESSION get aliases\x0a";
						converted = this.convert(response);
						this.socket.sendBytes(converted)
						this.negotiationState = 3;
						this.mReady = true;
						break;
					default:
						break;
				}
			}
		}
	}

	// This function converts the bytes into string
	toHex(bytes: any) {
		var result = '';
		for (var i = 0; i < bytes.length; ++i) {
			const byte = bytes[i];
			const text = byte.toString(16);
			result += (byte < 16 ? ' 0' : ' ') + text;
		}
		return (result);
	}

	// Convert HEX to ASCII
	private toAscii(data: any) {
		// From: https://stackoverflow.com/a/3745677
		let hex = data.toString() // Force conversion
			.replace(/ /g, ''), // Replace spaces
			str = '';
		for (let i = 0; i < hex.length; i += 2)
			str += String.fromCharCode(parseInt(hex.substr(i, 2 ), 16));
		return str;
	}

	private convert(str: string) {
		let bytes:any = [];
		let bytes2:any = [];
		let bytes3:any = [];
		for (let i = 0; i < str.length; ++i) {
			let code = str.charCodeAt(i);
			bytes = bytes.concat([code]);
			bytes3.push(code);
			bytes2 = bytes2.concat([code & 0xff, code / 256 >>> 0]);
		}
		return bytes3;
	}

	private tell(data: string) {
		let bytes = this.convert(data + '\x0a');
		this.socket.sendBytes(bytes);
	}
}
