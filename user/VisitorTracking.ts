/*	Demo of the Visitor Tracking feature introduced in Blocks 6. This is a rather basic
	demo, as implied by its name. It uses only ID tags (RFID, NFC) for identification.

	It introduces some of the useful base classes, such as VisitorScriptBase and
	StationBase, that help implement common functionality often called for, such
	as keeping track of who's where, and notifying stations as visitors arrive and
	leave.

	I also use the IndexedPropertyPersistor library class to persist the list of
	high scores to disk, reloading that data on server restart.

	Copyright (c) PIXILAB Technologies AB, Sweden (http://pixilab.se).
	All Rights Reserved.
 */

import {DisplaySpot, Spot} from "system/Spot";
import {ScriptEnv, PropertyAccessor} from "system_lib/Script";
import {RecordBase} from "../system_lib/ScriptBase";
import {record, field, id, callable, parameter} from "system_lib/Metadata";
import {StationBase, VisitorRecordBase, VisitorScriptBase} from "../lib/VisitorData";

// Constants you may want to change:
const DEBUG = true;	// Set to false to disable verbose logging


@record("Data we track for each visitor")
class QRCodeAndPhoneData extends RecordBase implements VisitorRecordBase {
	@id() 	 idCode: string;		// QR Code associated with this record
	@id() 	 phone: string;		    // Phone associated with this record
	@field() name: string;			// Name provided by visitor
	@field() currentStation: string; // Curently (or last) visited station
	@field() whenJoined: number;	// UNIX timestamp when first connected
	@field() email: string;			// Email address
	@field() briefed: boolean;		// The visitor has been briefed at the info station
	@field() quizScore: number;		// Score frmo Quiz game (except how tall speaker is)
	@field() speakerTall: number;	// How tall the speaker is
	@field() totalScore: number;	// Final score total
}

/*	My main class, implementing this user script. I inherit most functionality from my
	VisitorScriptBase class, with parameters defining my type of data (QRCodeAndPhoneData)
	as well as the type of my Stations (defined elsewhere in this file). Since I don't
	use visitors' phones at all, I omit the last parameter to VisitorScriptBase.
 */
export class VisitorTracking extends VisitorScriptBase<Station, QRCodeAndPhoneData> {
	constructor(env : ScriptEnv) {
		super(env);

		// Establish the "stations" (here only display spots) being used
		this.addStation(new Reception("VisitorTracking.TouchLeft", this));
		this.addStation(new GoodByeStation("VisitorTracking.ScreenRight",this));
		this.addStation(new InfoStation("VisitorTracking.ScreenLeft",this));
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
		@parameter("Code being scanned at Spot") rfidCode: string
	) {
		const station = this.getStationForSpotPath(spotPath);
		if (station)
			station.simulateRfid(rfidCode);
		else
			throw "No such station/spot path"
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
		// Accept tag codes from spot's scannerInput property
		this.getSpotPropertyAccessor<string>("scannerInput", code => {
			if (code)
				this.gotIdCode(code);
		});
		super.init();
	}

	/**
	 * Given an RFID code, return its corresponding visitor's data record, if any,
	 * else undefined. Provided as a service to subclasses, which often need this.
	 */
	protected recordFromRfidCode(rfidCode: string): QRCodeAndPhoneData {
		return this.owner.getRecordSec(QRCodeAndPhoneData, 'idCode', rfidCode);
	}

	// Spoon-fed tag code to this station
	simulateRfid(code: string) {
		this.gotIdCode(code);
	}

	/*	All stations use ID tag for identification, so must implement this.
	 */
	protected abstract gotIdCode(idCode: string): void;
}


/**
 * Reception where new visitor firs register, or can update existing visitor data.
 */
class Reception extends Station {
	private nameProp: PropertyAccessor<string>;		// Name and email entered at this spot
	private email: PropertyAccessor<string>;
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
		this.email = this.getSpotParameterAccessor<string>(
			"email",
			updatedEmail => this.getCurrVisitor().email = updatedEmail
		);
		/*	Hook up the common 'message' Spot parameter, often used to show a
			personalized message to visitors.
		 */
		this.messageProp = this.getSpotParameterAccessor<string>("message");
		super.init();
	}

	/**
	 * This station got an id code (i.e., NFC/RFID tag serial number). Do what needs to be done.
	 */
	protected gotIdCode(idCode: string) {
		let record = this.recordFromRfidCode(idCode);
		if (record) { // Already known visitor
			log("Reception returning visitor", record.name, record.$puid);
			this.messageProp.value = "Hello again " + record.name;
		} else { 	// No known visitor data - make new record
			record = this.owner.newRecord(QRCodeAndPhoneData);
			log("Reception new visitor ID", idCode, record.$puid);
			record.whenJoined = Date.now();
			record.idCode = idCode;
			this.messageProp.value = "Welcome!";
		}

		const otherVisitor = this.hasVisitor() && !this.isCurrentVisitor(record);
		this.gotVisitor(record);

		if (otherVisitor) {
			// Wait a bit to make sure it deactivates before being re-activated
			wait(200).then(() => this.activateByGotoBlock(true));
		} else
			this.activateByGotoBlock(true);
	}

	// Got a visitor. Present visitor's current data on UI
	receivedVisitor(visitorData: QRCodeAndPhoneData) {
		log("Reception received visitor name", visitorData.name, visitorData.$puid);
		super.receivedVisitor(visitorData);	// Establishes my current visitor
		this.nameProp.value = visitorData.name;
		this.email.value = visitorData.email;
		return true;
	}

	lostVisitor(visitor: QRCodeAndPhoneData) {
		this.activateByGotoBlock(false);
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
class GoodByeStation extends Station {
	private nameProp: PropertyAccessor<string>;	// Name I can show to visitor on station

	constructor(public readonly spotPath: string, owner: VisitorTracking) {
		super(spotPath, owner);
	}

	init() {
		// Hook up to Spot parameters used to show goodbye message
		this.nameProp = this.getSpotParameterAccessor<string>("name");
		super.init();
	}

	protected gotIdCode(idCode: string) {
		log("GoodByeStation got ID", idCode);
		this.gotVisitor(this.recordFromRfidCode(idCode));
	}

	/**	Specified visitor is visiting this station.
		Do what's appropriate there.
	*/
	receivedVisitor(visitorData: QRCodeAndPhoneData) {
		super.receivedVisitor(visitorData);	// Establishes my current visitor
		// const score = calcScore(visitorData);
		this.nameProp.value = visitorData.name || "nameless person";
		this.activateByGotoBlock(true); // Shows score using attractor

		// Tell my main script that this visitor is now gone
		this.owner.leftTheBuilding(visitorData);
		return true;
	}
}

/**
 Log messages, allowing my logging to be easily disabled in one place.
 */
function log(...messages: any[]) {
	if (DEBUG)	// Set to false to disable my logging
		console.info(messages);
}
