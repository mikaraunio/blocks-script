/*	PIXILAB Blocks driver for the Nexmosphere line of controllers and elements:
https://nexmosphere.com/technology/xperience-platform/

Note: This driver will work with Blocks 6.1 and later. It uses new capabilities in Blocks, resulting
in a different property path structure. Hence, this is NOT a dropin replacement for the older
Nexmosphere driver. If you have a Blocks system that depends on the propety paths and structure
of the older driver, that driver is still available on our github page. Please contact
support@pixilab.se if you need help obtaining it.

The number of expected element ports on the Nexmosphere controller defaults to 8, but can be
overridden in the Driver Options field by specifiying Number of interface channels as a number.

Alternatively, the elements can be specified explicitly in the Driver Options field using
a JSON array like this:

[{
	"modelCode": "XTB4N",
	"ifaceNo": 1,
	"name": "Buttons"
},{
	"modelCode": "XWL56",
	"ifaceNo": 2,
	"name": "Led"
},{
	"modelCode": "XY116",
	"ifaceNo": 3,
	"name": "Distance"
}]

The "name" settings above are optional, but will make the property paths more
readable and independent of which port the element is connected to on the controller.
If specified, names MUST be unique within the controller.

Copyright (c) PIXILAB Technologies AB, Sweden (http://pixilab.se). All Rights Reserved.
Created 2021 by Mattias Andersson.

*/


import { NetworkTCP, SerialPort } from "system/Network";
import { Driver } from "system_lib/Driver";
import { callable, driver, max, min, property } from "system_lib/Metadata";
import { AggregateElem } from "../system_lib/ScriptBase";

// Parse RFID tag detection from XR-DR01 Rfid element
const kRfidPacketParser = /^XR\[P(.)(\d+)]$/;

// Parse interfaceNumber and attached Data
const kPortPacketParser = /^X(\d+)([AB])\[(.+)]$/;

// Controllers response to a product code request (D003B[TYPE]) controller response D001B[TYPE=XRDR1  ]
const kProductCodeParser = /D(\d+)B\[TYPE=(.+)]$/;

// A simple map-like object type
interface Dictionary<TElem> { [id: string]: TElem; }

// A class constructor function
interface BaseInterfaceCtor<T> { new(driver: Nexmosphere, index: number): T; }

type ConnType = NetworkTCP | SerialPort;	// I accept either type of backend

@driver('NetworkTCP', { port: 4001 })
@driver('SerialPort', { baudRate: 115200 })
export class Nexmosphere extends Driver<ConnType> {

	// Maps Nexmosphere model name to its implementation type
	private static interfaceRegistry: Dictionary<BaseInterfaceCtor<BaseInterface>>;

	private readonly specifiedInterfaces: IfaceInfo[] = []; // Interfaces hardcoded using Driver Options.
	private readonly SEND_INTERVAL = 100; // How often to send messages, in ms
	private pollEnabled = true; // Enabled unless interfaces hardcoded in Driver options
	private numInterfaces = 8; // Number of "interface channels" in the Nexmosphere controller.

	private lastTag: TagInfo;	// Most recently received RFID TagInfo, awaiting the port message
	private pollIndex = 0;		// Most recently polled interface
	private firstConnect = true;
	private awake = false;		// Set once we receive first data from device
	private sendQueue: string[] = [];
	private sendTimer: CancelablePromise<void> | undefined = undefined;

	private readonly interface: BaseInterface[]; // Interfaces discovered, keyed by 0-based index
	private readonly element: Dictionary<BaseInterface>; // Named aggregate properties for each interface

	public constructor(private connection: ConnType) {
		super(connection);
		this.element = this.namedAggregateProperty("element", BaseInterface);
		this.interface = [];

		// Check if the driver has been configured with options, and if so, parse them.
		if (connection.options) {
			const options = JSON.parse(connection.options);
			if (typeof options === "number") {
				this.numInterfaces = options;
				this.pollEnabled = true;
			}
			if (typeof options === "object") {
				this.specifiedInterfaces = options;
				this.pollEnabled = false;
				for (let iface of this.specifiedInterfaces) {
					log("Specified interfaces", iface.ifaceNo, iface.modelCode, iface.name);
					this.addInterface(iface.ifaceNo, iface.modelCode, iface.name);
				}
			}
		}

		connection.autoConnect();

		// Listen for data from the Nexmosphere bus
		connection.subscribe('textReceived', (sender, message) => {
			if (message.text) { // Ignore empty message, sometimes caused by separated CR/LF chars
				if (this.awake)
					this.handleMessage(message.text);
				else {
					// First data from device - reset polling and consider me awake now
					this.awake = true;
					this.pollIndex = 0;
				}
			}
		});

		// Poll for connected interfaces once connected (not if hardcoded by Driver options)
		connection.subscribe('connect', (sender, message) => {
			// Initiate polling once connected and only first time (may reconnect several times)
			if (message.type === 'Connection' && connection.connected) { // Just connected
				log("Connected, polling: " + this.pollEnabled)
				if (!this.pollIndex && this.pollEnabled)	// Not yet polled for interfaces and polling is enabled
					this.pollNext();	// Get started
				if (this.firstConnect) {
					this.firstConnect = false;
				} else {
					log("Reconfiguring devices on reconnect");
					this.reconfigureAll();
				}
				if (this.sendTimer === undefined) {
					this.runSendLoop(); // Start the message sender loop
				}
			} else {	// Connection failed or disconnected
				log("Disconnected")
				if (!this.interface.length)	// Got NO interfaces - re-start polling on next connect
					this.pollIndex = 0;
				if (this.sendTimer !== undefined) {
					this.sendQueue = []; // cancel any queued outgoing messages
					this.sendTimer.cancel(); // and stop the message sender loop
					this.sendTimer = undefined;
				}
			}
		});
	}

	static registerInterface(ctor: BaseInterfaceCtor<BaseInterface>, ...modelName: string[]) {
		if (!Nexmosphere.interfaceRegistry)
			Nexmosphere.interfaceRegistry = {};	// First time init
		modelName.forEach(function (name) {
			Nexmosphere.interfaceRegistry[name] = ctor;
		});
	}

	/*	Poll next port, then next one (if any) with some delay between each.
	*/
	private pollNext() {

		let ix = this.pollIndex + 1 | 0; // |0 forces integer value

		//Jumping to the next expected portrange if using an XM system with shop-bus.
		if (ix % 10 === 9) {	// Skip all checks unless ix ends in 9 (which seems to be invariant)
			const tens = Math.round(ix / 10);
			if (ix < 200) {
				switch (tens) {
					case 0:
						ix = 111;	// Big jump from 9 up to 111
						break;
					case 11:		// These ones skip from 119 to 121, etc
					case 12:
					case 13:
					case 14:
					case 15:
						ix += 2;
						break;
					case 16:
						ix = 211;
						break;
				}
			} else {	// Deal with 200 and up
				switch (tens % 10) {	// All the rest are the same based on 2nd index digit
					case 1:		// Small skip - same as above
					case 2:
					case 3:
					case 4:
						ix += 2;
						break;
					case 5:
						if (ix >= 959)
							throw "Port number is out of range for the device."
						ix += 311 - 259;	// Larger incremental jump, e.g. from 259 to 311
						break;
				}
			}
		}
		this.pollIndex = ix;

		this.queryPortConfig(ix);
		let pollAgain = false;
		if (this.pollIndex < this.numInterfaces) // Poll next one soon
			pollAgain = true;
		else if (!this.interface.length) {	// Restart poll if no fish so far
			this.pollIndex = 0;
			pollAgain = true;
		}
		if (pollAgain && this.connection.connected)
			wait(500).then(() => this.pollNext());
	}


	/**
	* Send a query for what's connected to port (1-based)
	*/
	private queryPortConfig(portNumber: number,) {
		let sensorMessage: string = (("000" + portNumber).slice(-3)); // Pad index with leading zeroes
		sensorMessage = "D" + sensorMessage + "B[TYPE]";
		log("QQuery", sensorMessage);
		this.send(sensorMessage);
	}

	/**
	* Send raw messages to the Nexmosphere controller
	*/
	@callable("Send raw string data to the Nexmosphere controller")
	send(rawData: string) {
		this.sendQueue.push(rawData);
	}

	private runSendLoop() {
		let next = this.sendQueue.shift();
		if (next !== undefined) {
			this.connection.sendText(next, "\r\n");
			log("Sent: " + next);
		}
		this.sendTimer = wait(this.SEND_INTERVAL);
		this.sendTimer.then(() => this.runSendLoop());
	}

	// Expose reInitialize to tasks to re-build set of dynamic properties
	@callable("Re-initialize driver, after changing device configuration")
	reInitialize() {
		super.reInitialize();
	}

	/**
	* Look for the messages we care about and act on those.
	*/
	private handleMessage(msg: string) {
		log("Data from device", msg);

		let parseResult = kRfidPacketParser.exec(msg);
		if (parseResult) {
			// Just store first part until the port packet arrives
			this.lastTag = {
				isPlaced: parseResult[1] === 'B',
				tagNumber: parseInt(parseResult[2])
			};
		} else if ((parseResult = kPortPacketParser.exec(msg))) {
			// Incoming data from a sensor
			const portNumber = parseInt(parseResult[1]); //get the recieving interface
			const dataRecieved = parseResult[3]; //get input data as string
			log("Incoming data from port", portNumber, "Data", dataRecieved);
			const index = portNumber - 1;
			const interfacePort = this.interface[index];
			if (interfacePort)
				interfacePort.receiveData(dataRecieved, this.lastTag);
			else
				console.warn("Message from unexpected port", portNumber);
		} else if ((parseResult = kProductCodeParser.exec(msg))) {
			// Reply from the interface scan
			log("QReply", msg);
			const modelInfo: ModelInfo = {
				modelCode: parseResult[2].trim()  // Remove any trailing whitespace in the product code.
			}
			const portNumber = (parseResult[1]);
			this.addInterface(parseInt(portNumber), modelInfo.modelCode);

		} else {
			console.warn("Unknown command received from controller", msg)
		}
	}

	/**
	 * Find subclass matching modelCode and instantiate proper BaseInterface subclass.
	 */
	private addInterface(
		portNumber: number,	// 1-based interface/port number
		modelCode: string, // Nexmosphere's element model code
		name?: string	  // optional name (from Config Options)
	) {
		const ix = portNumber - 1;
		let ctor = Nexmosphere.interfaceRegistry[modelCode];
		if (!ctor) {
			console.warn("Unknown interface model - using generic 'unknown' type", modelCode);
			ctor = UnknownInterface;
		}
		// Make it accessible both by name and 0-based interface index

		const iface = new ctor(this, ix);
		let ifaceName = name;
		if (!ifaceName) {	// Synthesize a name
			ifaceName = iface.userFriendlyName();
			if (!(iface instanceof UnknownInterface)) // Skip funky FFF... "model code"
				ifaceName = ifaceName + '_' + modelCode;
			ifaceName = ifaceName + '_' + portNumber
		}

		this.interface[ix] = this.element[ifaceName] = iface;
	}

	@callable('Reconfigure all')
	reconfigureAll()
	{
		for (let element of this.interface) {
			if (element) {
				element.reconfigure();
			}
		}
	}
}

/**
 * Interface base class.
 */
class BaseInterface extends AggregateElem {
	constructor(
		protected readonly driver: Nexmosphere,
		protected readonly index: number
	) {
		super();
		this.reconfigure();
	}

	public reconfigure() {
		return;
	}

	receiveData(data: string, tag?: TagInfo): void {
		console.log("Unexpected data recieved on interface " + this.index + " " + data);
	}

	userFriendlyName() {
		return "Unknown";
	}
}

// Generic interface used when no matching type found, just providing its last data as a string
class UnknownInterface extends BaseInterface {
	private propValue: string;

	@property("Raw data last received from unknown device type", true)
	get unknown() {
		return this.propValue;
	}
	set unknown(value: string) {
		this.propValue = value;
	}

	receiveData(data: string) {
		this.unknown = data;
	}
}
// Instantiated manually, so no need to register

/**
 * RFID detector.
 */
class RfidInterface extends BaseInterface {

	private mTagNumber = 0;
	private mIsPlaced = false;

	@property("Last recieved RFID tag ID", false)
	get tagNumber(): number {
		return this.mTagNumber;
	}
	set tagNumber(value: number) {
		this.mTagNumber = value;
	}

	@property("RFID tag is detected", true)
	get isPlaced(): boolean { return this.mIsPlaced; }
	set isPlaced(value: boolean) { this.mIsPlaced = value; }

	receiveData(data: string, tag?: TagInfo) {
		this.isPlaced = tag.isPlaced
		this.tagNumber = tag.tagNumber;
	}

	userFriendlyName() {
		return "RFID";
	}
}
Nexmosphere.registerInterface(RfidInterface, "XRDR1");

class NfcInterface extends BaseInterface {
	private lastTagEvent: string = "";

	// Property backing
	private mTagUID = "";
	private mIsPlaced = false;

	@property("Last recieved tag UID", false)
	get tagUID(): string { return this.mTagUID; }
	set tagUID(value: string) { this.mTagUID = value; }

	@property("A tag is placed", true)
	get isPlaced(): boolean { return this.mIsPlaced; }
	set isPlaced(value: boolean) { this.mIsPlaced = value; }


	receiveData(data: string) {
		console.log(data);
		let splitData = data.split(":");
		const newTagData = splitData[1];
		const newTagEvent = splitData[0];
		this.lastTagEvent = newTagEvent;

		switch (newTagEvent) {
			case "TD=UID":
				this.isPlaced = true;
				this.tagUID = newTagData;
				break;
			case "TR=UID":
				this.isPlaced = false
				break;
			default:
				super.receiveData(data);
				break;
		}
	}

	userFriendlyName() {
		return "NFC";
	}
}
Nexmosphere.registerInterface(NfcInterface, "XRDW2");

class XWaveLedInterface extends BaseInterface {
	private mX_Wave_Command = "";

	@property("Command sent")
	set X_Wave_Command(value: string) {
		this.sendData(value)
		this.mX_Wave_Command = value;
	}
	get X_Wave_Command(): string { return this.mX_Wave_Command; }

	private sendData(data: string) {
		const myIfaceNo = (("000" + (this.index + 1)).slice(-3));
		const message = "X" + myIfaceNo + "B[" + data + "]";
		this.driver.send(message);
	}

	userFriendlyName() {
		return "LED";
	}
}
Nexmosphere.registerInterface(XWaveLedInterface, "XWC56", "XWL56");

/**
* Proximity sensors
*/
class ProximityInterface extends BaseInterface {
	private mProximity: number = 0;

	@property("Proximity zone", true)
	get proximity(): number { return this.mProximity; }
	set proximity(value: number) { this.mProximity = value; }

	receiveData(data: string) {
		this.proximity = parseInt(data);
	}

	userFriendlyName() {
		return "Prox";
	}
}
Nexmosphere.registerInterface(ProximityInterface, "XY116", "XY146", "XY176");

/**
* Proximity sensors Time of Flight versions
*/
class TimeOfFlightInterface extends BaseInterface {
	private mProximity: number;
	private mAirButton: boolean;
	private mRawData: string;
	private mTrigger1: boolean = false;
	private mTrigger2: boolean = false;
	private mTrigger3: boolean = false;
	private mTrigger4: boolean = false;
	private mTrigger5: boolean = false;
	private mTrigger6: boolean = false;
	private mTrigger7: boolean = false;
	private mTrigger8: boolean = false;
	private mTrigger9: boolean = false;
	private mTrigger10: boolean = false;

	@property("Proximity zone", true)
	get proximity(): number { return this.mProximity; }
	set proximity(value: number) { this.mProximity = value; }

	@property("Air Button", true)
	get airButton(): boolean { return this.mAirButton; }
	set airButton(value: boolean) { this.mAirButton = value; }

	@property("Raw data last received", true)
	get rawData(): string { return this.mRawData; }
	set rawData(value: string) { this.mRawData = value; }

	@property("Proximity 1 or below", true)
	get triggerOn1(): boolean { return this.mTrigger1; }
	set triggerOn1(value: boolean) { this.mTrigger1 = value; }

	@property("Proximity 2 or below", true)
	get triggerOn2(): boolean { return this.mTrigger2; }
	set triggerOn2(value: boolean) { this.mTrigger2 = value; }

	@property("Proximity 3 or below", true)
	get triggerOn3(): boolean { return this.mTrigger3; }
	set triggerOn3(value: boolean) { this.mTrigger3 = value; }

	@property("Proximity 4 or below", true)
	get triggerOn4(): boolean { return this.mTrigger4; }
	set triggerOn4(value: boolean) { this.mTrigger4 = value; }

	@property("Proximity 5 or below", true)
	get triggerOn5(): boolean { return this.mTrigger5; }
	set triggerOn5(value: boolean) { this.mTrigger5 = value; }

	@property("Proximity 6 or below", true)
	get triggerOn6(): boolean { return this.mTrigger6; }
	set triggerOn6(value: boolean) { this.mTrigger6 = value; }

	@property("Proximity 7 or below", true)
	get triggerOn7(): boolean { return this.mTrigger7; }
	set triggerOn7(value: boolean) { this.mTrigger7 = value; }

	@property("Proximity 8 or below", true)
	get triggerOn8(): boolean { return this.mTrigger8; }
	set triggerOn8(value: boolean) { this.mTrigger8 = value; }

	@property("Proximity 9 or below", true)
	get triggerOn9(): boolean { return this.mTrigger9; }
	set triggerOn9(value: boolean) { this.mTrigger9 = value; }

	@property("Proximity 10 or below", true)
	get triggerOn10(): boolean { return this.mTrigger10; }
	set triggerOn10(value: boolean) { this.mTrigger10 = value; }

	receiveData(data: string) {
		const splitData = data.split("=");
		const sensorValue = splitData[1];
		this.rawData = data;
		switch (sensorValue) {
			case "AB":
				this.airButton = true;
				this.proximity = 1; //We define AB as zone 1
				break;
			case "XX":
				this.airButton = false;
				this.proximity = 999; //We define indefinite as zone 999
				break;
			default:	// Assume others are zone numbers
				const proximity = parseInt(sensorValue);
				if (!isNaN(proximity)) {
					this.proximity = parseInt(sensorValue);
					this.airButton = false;
				}
				break;
		}
		this.triggerOn1 = this.proximity <= 1;
		this.triggerOn2 = this.proximity <= 2;
		this.triggerOn3 = this.proximity <= 3;
		this.triggerOn4 = this.proximity <= 4;
		this.triggerOn5 = this.proximity <= 5;
		this.triggerOn6 = this.proximity <= 6;
		this.triggerOn7 = this.proximity <= 7;
		this.triggerOn8 = this.proximity <= 8;
		this.triggerOn9 = this.proximity <= 9;
		this.triggerOn10 = this.proximity <= 10;

	}

	userFriendlyName() {
		return "TOF";
	}
}
Nexmosphere.registerInterface(TimeOfFlightInterface, "XY240","XY241");

/**
 *Modle a Gesture detector interface.
 */
class AirGestureInterface extends BaseInterface {
	private mGesture = "";

	public reconfigure() {
		let ifaceStr: string = (("000" + (this.index + 1)).slice(-3)); // Pad index with leading zeroes
		this.driver.send("X" + ifaceStr + "S[5:1]"); // Deactivate AirButton
		this.driver.send("X" + ifaceStr + "S[6:1]"); // Deactivate AirSwipe
		this.driver.send("X" + ifaceStr + "S[7:2]"); // Activate AirWheel
		log('Reconfigured AirGesture element on interface ' + (this.index + 1));
	}

	@property("Gesture detected", true)
	get gesture(): string { return this.mGesture; }

	receiveData(data: string) {
		this.mGesture = data;
		this.changed("gesture"); // We still want property changes if the same event repeats
	}

	userFriendlyName() {
		return "Air";
	}
}
Nexmosphere.registerInterface(AirGestureInterface, "XTEF650", "XTEF30", "XTEF630", "XTEF680");


/**
 *Model a single button.
 */
interface Button {
	state: boolean;
	ledData: number;
}

const kButtonDescr = "Button pressed";
const kLedDescr = "0=off, 1=fast, 2=slow or 3=on"
/**
 *Modle a Quad Button detector interface.
 */
class QuadButtonInterface extends BaseInterface {
	private static readonly kNumButtons = 4;	// Must match number of property pairs defined below
	private readonly buttons: Button[];

	constructor(driver: Nexmosphere, index: number) {
		super(driver, index);
		this.buttons = [];
		for (let ix = 0; ix < QuadButtonInterface.kNumButtons; ++ix)
			this.buttons.push({ state: false, ledData: 0 });
	}

	@property(kButtonDescr, true)
	get button1(): boolean { return this.getBtn(1); }
	set button1(value: boolean) { this.setBtn(1, value); }

	@property(kLedDescr) @min(0) @max(3)
	get led1(): number { return this.getLed(1); }
	set led1(value: number) { this.setLed(1, value); }


	@property(kButtonDescr, true)
	get button2(): boolean { return this.getBtn(2); }
	set button2(value: boolean) { this.setBtn(2, value); }

	@property(kLedDescr) @min(0) @max(3)
	get led2(): number { return this.getLed(2); }
	set led2(value: number) { this.setLed(2, value); }


	@property(kButtonDescr, true)
	get button3(): boolean { return this.getBtn(3); }
	set button3(value: boolean) { this.setBtn(3, value); }

	@property(kLedDescr) @min(0) @max(3)
	get led3(): number { return this.getLed(3); }
	set led3(value: number) { this.setLed(3, value); }


	@property(kButtonDescr, true)
	get button4(): boolean { return this.getBtn(4); }
	set button4(value: boolean) { this.setBtn(4, value); }

	@property(kLedDescr) @min(0) @max(3)
	get led4(): number { return this.getLed(4); }
	set led4(value: number) { this.setLed(4, value); }

	// Yes, some ugly repetition above, but aggregates only do static properties

	private getBtn(oneBasedIx: number): boolean {
		return this.buttons[oneBasedIx - 1].state;
	}

	private setBtn(oneBasedIx: number, state: boolean) {
		this.buttons[oneBasedIx - 1].state = state;
	}

	private getLed(oneBasedIx: number): number {
		return this.buttons[oneBasedIx - 1].ledData;
	}

	private setLed(oneBasedIx: number, state: number) {
		this.buttons[oneBasedIx - 1].ledData = state & 3;
		this.ledStatusChanged();
	}

	/**
	 * Update button state from received data bitmask.
	 */
	receiveData(data: string) {
		let bitMask = parseInt(data);
		bitMask = bitMask >> 1;	// Unsave useless LSBit
		for (let ix = 0; ix < this.buttons.length; ++ix) {
			let isPressed: boolean = !!(bitMask & (1 << ix));
			const btn = this.buttons[ix];
			if (btn.state !== isPressed) {
				btn.state = isPressed;
				// Just fire explicitly since we assign to backing store
				this.changed("button" + (ix + 1));
			}
		}
	}

	/**
	 * Send new LED status to device.
	 */
	private ledStatusChanged() {
		let toSend = 0;
		const buttons = this.buttons;
		for (let ix = 0; ix < buttons.length; ++ix)
			toSend |= buttons[ix].ledData << ix * 2;
		this.sendCmd(toSend.toString());
	}

	private sendCmd(data: string) {
		let myIfaceNo = (("000" + (this.index + 1)).slice(-3));
		let command = "X" + myIfaceNo + "A[" + data + "]";
		this.driver.send(command);
		console.log(command);
	}

	userFriendlyName() {
		return "Btn";
	}
}
Nexmosphere.registerInterface(QuadButtonInterface, "XTB4N", "XTB4N6", "XT4FW6");


/**
 * Motion detector interface.
 */
class MotionInterface extends BaseInterface {
	private mMotion: number = 0;

	@property("Motion detected", true)
	set motion(value: number) { this.mMotion = value; }
	get motion(): number { return this.mMotion; }

	receiveData(data: string) {
		this.motion = parseInt(data);
	}

	userFriendlyName() {
		return "Motion";
	}
}
Nexmosphere.registerInterface(MotionInterface, "XY320");


/**
 * Rotary encoder interface.
 */
class RotaryEncoderInterface extends BaseInterface {
	private mRotation: string = "";

	@property("Rotation", true)
	get rotation(): string { return this.mRotation; }

	receiveData(data: string) {
		this.mRotation = data.substring(3);
		this.changed('rotation'); // we still want property changes if the same event repeats
	}

	userFriendlyName() {
		return "Encoder";
	}
}
Nexmosphere.registerInterface(RotaryEncoderInterface, "XDWE60");


/*
 *	Gender detector interface, indicating gender, age, gaze and some other tidbits about a person
 *	in front of the sensor (e.g., a camera).
 */
class GenderInterface extends BaseInterface {
	private static readonly kParser = /^(0|1)(M|F|U)(X|L|H)([0-8])(X|L|H)(L|C|R|U)/;
	// private subProp: GenderSubProperty<any>[];
	private mIsPerson = false;
	private mGender = 'U';
	private mGenderConfidence = 'X';
	private mAge = 0;
	private mAgeConfidence = 'X'
	private mGaze = 'U';

	@property("Person detected", true)
	get isPerson(): boolean { return this.mIsPerson; }
	set isPerson(value: boolean) { this.mIsPerson = value; }

	@property("M=Male, F=Female, U=Unidentified", true)
	get gender(): string { return this.mGender; }
	set gender(value: string) { this.mGender = value; }

	@property("X=Very Low, L=Low, H=High", true)
	get genderConfidence(): string { return this.mGenderConfidence; }
	set genderConfidence(value: string) { this.mGenderConfidence = value; }

	@property("Age range 0...8", true)
	get age(): number { return this.mAge; }
	set age(value: number) { this.mAge = value; }

	@property("X=Very Low, L=Low, H=High", true)
	get ageConfidence(): string { return this.mAgeConfidence; }
	set ageConfidence(value: string) { this.mAgeConfidence = value; }

	@property("L=Left, C=Center, R=Right, U=Unidentified", true)
	get gaze(): string { return this.mGaze; }
	set gaze(value: string) { this.mGaze = value; }

	/*	Parse out all info from single string, using kParser:

		P= Person detection 0= No Person, 1=Person detected
		G= M=Male, F=Female, U=Unidentified
		C= Confidence level gender X = Very Low, L=Low, H=High
		A= Age range estimation value between 0-8
		C= Confidence level age X = Very Low, L=Low, H=High
		G= Gaze indication L=Left, C=Center, R=Right, U=Unidentified
	*/
	receiveData(data: string) {
		const parseResult = GenderInterface.kParser.exec(data);
		if (parseResult) {
			this.isPerson = parseResult[0] === "1"; // true if 1 (there's a Person)
			this.gender = parseResult[1];
			this.genderConfidence = parseResult[2];
			this.age = parseInt(parseResult[3]);
			this.ageConfidence = parseResult[4];
			this.gaze = parseResult[5];
		}
	}

	userFriendlyName() {
		return "Gender";
	}
}
Nexmosphere.registerInterface(GenderInterface, "XY510", "XY520");


/**
 * What we know about a single RFID tag placed on (or removed from) a sensor.
 */
interface TagInfo {
	tagNumber: number;
	isPlaced: boolean;
}


interface ModelInfo {
	modelCode: string;
	serialNo?: string;
}

interface IfaceInfo {
	modelCode: string;
	ifaceNo: number;
	name?: string;
}

/**
 Log messages, allowing my logging to be easily disabled in one place.
 */
const DEBUG = false;	// Controls verbose logging
function log(...messages: any[]) {
	if (DEBUG)
		// Set to false to disable my logging
		console.info(messages);
}
