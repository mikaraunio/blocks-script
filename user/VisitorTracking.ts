/*  Copyright (c) PIXILAB Technologies AB, Sweden (http://pixilab.se).
	All Rights Reserved.
 */

import {Artnet, Channel} from 'system/Artnet';
import {MobileSpot, DisplaySpot, Spot, Visitor} from "system/Spot";
import {ScriptEnv, PropertyAccessor} from "system_lib/Script";
import {RecordBase} from "../system_lib/ScriptBase";
import {record, field, id, callable, parameter, spotParameter} from "system_lib/Metadata";
import {StationBase, VisitorRecordBase, VisitorScriptBase} from "../lib/VisitorData";

// Constants you may want to change:
const DEBUG = true;	// Set to false to disable verbose logging
const kMobileSpot = "Mob1";

@record("Data we track for each visitor")
class QRCodeAndPhoneData extends RecordBase implements VisitorRecordBase {
	@id() 	 idCode: string;		// QR Code associated with this record
	@id() 	 phone: string;		    // Phone associated with this record
	@field() @spotParameter() name: string;			// Name provided by visitor
	@field() @spotParameter() color: string;			// Favorite color provided by visitor
	@field() @spotParameter() email: string;			// Email address provided by visitor
	@field() @spotParameter() badgeName: string; // Iiwari physical badge identifier
	@field() @spotParameter() currentStation: string; // Currently (or last) visited station
	@field() whenJoined: number;	// UNIX timestamp when first connected
	@field() briefed: boolean;		// The visitor has been briefed at the info station
}

class VisitorPhone {
	private rfidProperty: PropertyAccessor<string>;
	private record: QRCodeAndPhoneData;

	constructor(private owner: VisitorTracking, private visitor: Visitor<QRCodeAndPhoneData>) {
		log("VisitorPhone id and record", visitor.identity, visitor.record ? visitor.record.$puid : 'no data');

		this.record = visitor.record;

		/*	Listen for 'rfid' parameter, passed in from QR code through URL, allowing me to bind the
			mobile to the matching data record.
		*/
		this.rfidProperty = owner.getProperty<string>(
			'Spot.' + kMobileSpot + '.' + visitor.identity + '.parameter.rfid',
			rfid => this.visitorRfidCode(rfid)
		);

		// Listen for this visitor's phone disconnecting
		visitor.subscribe('finish', () => this.visitorGone());
	}

	/**
	 * Received RFID code that should allow me to find the corresponding data record,
	 * and set my phone identity there, binding the two together.
	 */
	private visitorRfidCode(rfid: string) {
		log("VisitorPhone rfid", rfid);
		if (!this.record) {
			log('New VisitorPhone, associating to rfid')
			var associateRecord = this.owner.getRecordSec(QRCodeAndPhoneData, 'idCode', rfid);
			if (associateRecord) {
				associateRecord.phone = this.visitor.identity;
				this.record = associateRecord;
				log('VisitorPhone associated')
			} else {
				log("Got RFID", rfid, "with no corresponding data record");
			}
			// Spot['1_Regi'].gotoBlock('/QRcode');
		} else {
			log('Phone already associated, keeping old association')
		}
	}

	private visitorGone() {
		log("VisitorPhone disconnected");
		this.rfidProperty.close(); // Do not leak prop accessors for each reconnection
	}
}

export class VisitorTracking extends VisitorScriptBase<Station, QRCodeAndPhoneData> {
	constructor(env : ScriptEnv) {
		super(env);

		this.addStation(new Reception("1_Regi", this));
		this.addStation(new Trigger3Station("8_Paikannus",this));
		// this.addStation(new InfoStation("VisitorTracking.ScreenLeft",this));

		this.listenForVisitors();
	}

	/**
	 * Functions marked @callable can be invoked from Tasks
	 */
	@callable("Discard all visitors of the last day. Call nightly.")
	deleteAllVisitors(
		@parameter("Archive log files rather than deleting them") archive: boolean
	) {
		super.deleteRecords(QRCodeAndPhoneData, archive);
		log("Deleted All");
	}

	/**
	 * This callable may be useful if you receive QR codes by other means than through
	 * the Spot's scannerInput property, such as network-attached scanners. You can then use
	 * tasks to funnel that data into here
	 */
	@callable("Spoon-feed an RFID code as being scanned at a Spot")
	simulateRfid(
		@parameter("Spot path, e.g. 'TwoScreens.Left'") spotPath: string,
		@parameter("Code being scanned at Spot") rfidCode: string,
		@parameter("Parse as Iiwari badge QR?", true) processIiwari?: boolean
	) {
		const station = this.getStationForSpotPath(spotPath);
		if (station)
			station.simulateRfid(rfidCode, processIiwari);
		else
			throw "No such station/spot path"
	}

	private listenForVisitors() {
		const mobile = Spot[kMobileSpot] as MobileSpot;	// Get designated Spot

		// Ensure we indeed got a Spot of the expected type
		if (mobile && mobile.isOfTypeName('MobileSpot')) {

			// Listen for connecting visitors
			mobile.subscribe<QRCodeAndPhoneData>('visitor', (sender, message) => {
				if (message.type === 'Connected')
					this.gotVisitorConnection(message.visitor);
			});

			// Listen for my MobileSpot going away, then attempt to re-attach
			mobile.subscribe('finish', sender => this.listenForVisitors());
		} else
			console.log(kMobileSpot, "is not a MobileSpot");
	}

	private gotVisitorConnection(visitor: Visitor<QRCodeAndPhoneData>) {
		new VisitorPhone(this, visitor);
	}
}


/*	A Spot that can be visited and some common stuff shared by those here,
	such as getting the RFID code from the spot's scannerInput and letting
	subclass know about this, as well as resolving the RFID code to the
	corresponding Visitor's data. I inherit most functionality from my
	StationBase base class, which collaborates with the VisitorScriptBase
	base class of my main VisitorTracking script to keep track of who's where.
	This Station is then used as the base class of my actual stations.
*/
abstract class Station extends StationBase<QRCodeAndPhoneData, VisitorTracking, DisplaySpot> {

	/**
	 * One-time initialization of this station, done once soon after ctor,
	 * and before any other active use of this station.
	 */
	init() {
		super.init();
		this.getSpotParameterAccessor<string>("uwbArrival", code => {
			if (code)
				this.gotIdCode(code);
		});
		this.getSpotParameterAccessor<string>("uwbDeparture", code => {
			if (code)
				this.lostIdCode(code);
		});
	}

	/**
	 * Given an RFID code, return its corresponding visitor's data record, if any,
	 * else undefined. Provided as a service to subclasses, which often need this.
	 */
	protected recordFromRfidCode(rfidCode: string): QRCodeAndPhoneData {
		return this.owner.getRecordSec(QRCodeAndPhoneData, 'idCode', rfidCode);
	}

	// Spoon-fed tag code to this station
	simulateRfid(code: string, processIiwari?: boolean) {
		this.gotIdCode(code, processIiwari);
	}

	/*	All stations use ID tag for identification, so must implement this.
	 */
	protected abstract gotIdCode(idCode: string, processIiwari?: boolean): void;
	protected abstract lostIdCode(idCode: string): void;
}


/**
 * Reception where new visitor firs register, or can update existing visitor data.
 */
class Reception extends Station {
	private nameProp: PropertyAccessor<string>;
	private emailProp: PropertyAccessor<string>;
	private colorProp: PropertyAccessor<string>;
	private connectqrcodeProp: PropertyAccessor<string>;
	private messageProp: PropertyAccessor<string>;	// Message I can show to visitor

	constructor(spotPath: string, owner: VisitorTracking) {
		super(spotPath, owner);
	}

	// Called right after ctor, to get me up and running
	init() {
		/*	Listen to name and email Spot parameters from text intputs in UI,
			updating data of the current user accordingly.
		 */
		this.nameProp = this.getSpotParameterAccessor<string>(
			"name",
			updatedName => this.getCurrVisitor().name = updatedName
		);
		this.emailProp = this.getSpotParameterAccessor<string>(
			"email",
			updatedEmail => this.getCurrVisitor().email = updatedEmail
		);
		this.colorProp = this.getSpotParameterAccessor<string>(
			"color",
			updatedColor => this.getCurrVisitor().color = updatedColor
		);
		this.connectqrcodeProp = this.getSpotParameterAccessor<string>("connectqrcode");
		/*	Hook up the common 'message' Spot parameter, often used to show a
			personalized message to visitors.
		 */
		this.messageProp = this.getSpotParameterAccessor<string>("message");
		super.init();
	}

	/**
	 * This station got an id code (i.e., NFC/RFID tag serial number). Do what needs to be done.
	 */
	protected gotIdCode(idCode: string, processIiwari?: boolean) {
		log('Ignoring UWB token arrival, Reception only handles explcit registrations')
	}

	simulateRfid(idCode: string, processIiwari?: boolean) {
		let badgeName = undefined;

		if (processIiwari) {
			try {
				[badgeName, idCode] = idCode.split(':');
				badgeName = badgeName.toUpperCase();
				idCode = idCode.toLowerCase();
			} catch {
				log('Could not parse Iiwari QR code');
				return
			}
		}
		let record = this.recordFromRfidCode(idCode);
		if (record) { // Already known visitor
			log("Reception returning visitor", record.name, record.$puid);
			this.messageProp.value = "Hello again " + record.name;
		} else { 	// No known visitor data - make new record
			record = this.owner.newRecord(QRCodeAndPhoneData);
			log("Reception new visitor ID", idCode, record.$puid);
			record.whenJoined = Date.now();
			record.idCode = idCode;
			if (badgeName) {
				record.badgeName = badgeName;
			}
			this.messageProp.value = "Welcome!";
		}

		this.gotVisitor(record);
	}

	protected lostIdCode(idCode: string) {
		log("Reception station lost UWB token", idCode);
		const record = this.recordFromRfidCode(idCode);
		if (record)
			this.lostVisitor(record);
	}

	// Got a visitor. Present visitor's current data on UI
	receivedVisitor(visitorData: QRCodeAndPhoneData) {
		log("Reception received visitor name", visitorData.name, visitorData.$puid);
		super.receivedVisitor(visitorData);	// Establishes my current visitor
		this.nameProp.value = visitorData.name;
		this.emailProp.value = visitorData.email;
		this.colorProp.value = visitorData.color;
		this.connectqrcodeProp.value = `https://spaceodyssey.online/spot/index.ftl?mobile=${kMobileSpot}&param-rfid=${visitorData.idCode}`
		return true;
	}

	lostVisitor(visitor: QRCodeAndPhoneData) {
		super.lostVisitor(visitor);
	}
}

/*	Station showing some useful information when visited. Only shown to
	known visitors. Furthermore, the info is only shown ONCE per visitor,
	so I keep track of this state in the visitor's data record.
*/
class InfoStation extends Station {
	private nameProp: PropertyAccessor<string>;		// Name and email entered at this spot

	constructor(spotPath: string, owner: VisitorTracking) {
		super(spotPath, owner);
	}

	init() {
		// Hook up to Spot parameter used to show visitor's name
		this.nameProp = this.getSpotParameterAccessor<string>("name");
		super.init();
	}

	protected gotIdCode(idCode: string) {
		log("Info station receved RFID", idCode);
		const record = this.recordFromRfidCode(idCode);
		if (record)
			this.gotVisitor(record);
		else
			Spot[this.spotPath].gotoBlock("/Active/Visitor/Unknown");
	}

	protected lostIdCode(idCode: string) {
		log("Info station lost UWB token", idCode);
		const record = this.recordFromRfidCode(idCode);
		if (record)
			this.lostVisitor(record);
	}

	/**	Specified visitor is visiting this station.
		Do what's appropriate there.
	*/
	receivedVisitor(visitorData: QRCodeAndPhoneData) {
		super.receivedVisitor(visitorData);	// Establishes my current visitor
		this.nameProp.value = visitorData.name
		if (visitorData.briefed) // Info already shown - show alternative block
			this.gotoBlock("/Active/Visitor/AlreadyBriefed");
		else {
			this.gotoBlock("/Active/Visitor/Brief"); // Show info
			visitorData.briefed = true;
		}
		return true;
	}

	lostVisitor(visitor: QRCodeAndPhoneData) {
		this.gotoBlock("Passive");
		super.lostVisitor(visitor);
	}
}


/*	Visitor leaves. Detach ID tag and archive visitor's data.
*/
class Trigger3Station extends Station {
	private nameProp: PropertyAccessor<string>;	// Name I can show to visitor on station

	constructor(public readonly spotPath: string, owner: VisitorTracking) {
		super(spotPath, owner);
	}

	init() {
		super.init();
	}

	protected gotIdCode(idCode: string) {
		log("Trigger3 got UWB token", idCode);
		this.gotVisitor(this.recordFromRfidCode(idCode));
	}

	protected lostIdCode(idCode: string) {
		log("Trigger3 station lost UWB token", idCode);
		const record = this.recordFromRfidCode(idCode);
		if (record)
			this.lostVisitor(record);
	}

	receivedVisitor(visitorData: QRCodeAndPhoneData) {
		const FADETIME = 1;
		super.receivedVisitor(visitorData);	// Establishes my current visitor
		if (!visitorData.color)
			return false;
		(Artnet['Neukkari_Xbar'][visitorData.color] as Channel).fadeTo(100, FADETIME);
		return true
	}

	lostVisitor(visitor: QRCodeAndPhoneData): void {
		const FADETIME = 1;
		super.lostVisitor(visitor);
		if (!visitor.color)
			return;

		(Artnet['Neukkari_Xbar']['Red'] as Channel).fadeTo(0, FADETIME);
		(Artnet['Neukkari_Xbar']['Green'] as Channel).fadeTo(0, FADETIME);
		(Artnet['Neukkari_Xbar']['Blue'] as Channel).fadeTo(0, FADETIME);
	}
}

/**
 Log messages, allowing my logging to be easily disabled in one place.
 */
function log(...messages: any[]) {
	if (DEBUG)	// Set to false to disable my logging
		console.info(messages);
}
