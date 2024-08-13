/*	PIXILAB Blocks driver for the Arduino Rapids Noise ad-hoc protocol

Copyright (c) Diago Global Inc. All Rights Reserved.
Created 2024 by Mika Raunio.

Protocol:

→ SET000 – SET100 (Set value)
← OK000 – OK100

→ SET (Query)
← OK056

→ JOTAIN MUUTA
← ERROR

→ SET200 : GAME OVER (Special 1)
← OK200
→ SET300 : YOU WIN (Special 2)
← OK300
*/

import { NetworkTCP, SerialPort } from "system/Network";
import { Driver } from "system_lib/Driver";
import { driver, max, min, property } from "system_lib/Metadata";

const OkResponseParser = /^OK(\d\d\d)$/

type ConnType = NetworkTCP | SerialPort;	// I accept either type of backend

@driver('NetworkTCP', { port: 4001 })
@driver('SerialPort', { baudRate: 19200 })
export class ArduinoRapids extends Driver<ConnType> {
	private mConnected: boolean = false;
	private mIntensity: number = 0;

	@property("Connected to server", true)
	public set connected(val: boolean) { this.mConnected = val; }
	public get connected() { return this.mConnected; }

	@property("Intensity", true)
	@min(0)
	@max(300)
	public set intensity(val: number) {
		const setIntensity: number = Math.floor(val);
		this.send('SET' + ('000' + setIntensity).slice(-3));
	}
	public get intensity() { return this.mIntensity; }

	public constructor(private connection: ConnType) {
		super(connection);
		connection.autoConnect();
		this.connected = connection.connected;
		if (this.connected) {
			this.setupConnection();
		}

		connection.subscribe('textReceived', (sender, message) => {
			if (message.text) { // Ignore empty message, sometimes caused by separated CR/LF chars
				log("Data from device", message.text);
				const parseResult = OkResponseParser.exec(message.text);
				if (parseResult) {
					const newIntensity = parseInt(parseResult[1]);
					if (!isNaN(newIntensity)) {
						const oldIntensity = this.mIntensity;
						this.mIntensity = newIntensity;
						if (oldIntensity != newIntensity) {
							this.changed('intensity');
						}
					}
				}
			} else {
				console.error("ERROR: unknown data from device", message.text);
			}
		});

		connection.subscribe('connect', (sender, message) => {
			log("Connect state changed to", this.connection.connected);
			this.connected = this.connection.connected;
			if (message.type === 'Connection' && connection.connected) {
				this.setupConnection();
			} else {
				// Disconnected
			}
		});
	}

	// @callable("Send raw string data to the device")
	protected send(rawData: string) {
		this.connection.sendText(rawData, "\n");
		log("Sent: "+ rawData);
	}

	protected setupConnection() {
		this.send('SET');  // Query current intensity
	}
}

const DEBUG = true;
function log(...messages: any[]) {
	if (DEBUG)
		console.info(messages);
}
