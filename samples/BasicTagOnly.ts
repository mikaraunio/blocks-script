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
import {IndexedProperty, RecordBase} from "../system_lib/ScriptBase";
import {record, field, id, callable, parameter, property} from "system_lib/Metadata";
import {IndexedPropertyPersistor} from "../lib/IndexedPropertyPersistor";
import {StationBase, VisitorRecordBase, VisitorScriptBase} from "../lib/VisitorData";

// Constants you may want to change:
const kSpeakerTall = 186;	// cm, to calculate finale score
const kMaxHighScoreEntries = 30;	// How many high score entries we keep around
const kPersistenceDir = 'BasicTagOnly'; // Directory under script/files for my persistent data
const DEBUG = true;	// Set to false to disable verbose logging


@record("Data we track for each visitor")
class BasicTagOnlyData extends RecordBase implements VisitorRecordBase {
	@id() 	 idCode: string;		// RFID associated with this record
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
	VisitorScriptBase class, with parameters defining my type of data (BasicTagOnlyData)
	as well as the type of my Stations (defined elsewhere in this file). Since I don't
	use visitors' phones at all, I omit the last parameter to VisitorScriptBase.
 */
export class BasicTagOnly extends VisitorScriptBase<Station, BasicTagOnlyData> {
	private hiScorePersistor: IndexedPropertyPersistor<Score>;	// Manages persistence of hiScores
	public hiScores: IndexedProperty<Score>;	// Published dynamic list of high scores

	constructor(env : ScriptEnv) {
		super(env);

		// Establish the "stations" (here only display spots) being used
		this.addStation(new Reception("BasicTagOnly.TouchLeft", this));
		this.addStation(new QuizStation("BasicTagOnly.TouchRight", this));
		this.addStation(new GoodByeStation("BasicTagOnly.ScreenRight",this));
		this.addStation(new InfoStation("BasicTagOnly.ScreenLeft",this));

		// A dynamic list of game high-scores (can be shown using Child Block Replication)
		this.hiScorePersistor = new IndexedPropertyPersistor<Score>(this, kPersistenceDir);
		this.hiScores = this.hiScorePersistor.getOrMake(
			'hiScores',
			Score
		);
	}

	/**
	 * Functions marked @callable can be invoked from Tasks
	 */
	@callable("Discard all visitors of the last day. Call nightly.")
	deleteAllVisitors(
		@parameter("Archive log files rather than deleting them") archive: boolean
	) {
		super.deleteRecords(BasicTagOnlyData, archive);
		log("Deleted All");
	}

	/**
	 * This callable may be useful if you receive RFID codes by other means than through
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

	/**
	 * Got a new score. Update my dynamic high-score list, which I also
	 * persist to disk. This is published as the hiScores property of
	 * this script. That list can be displayed using Child Block
	 * Replication.
	 */
	newScore(visitorData: BasicTagOnlyData) {
		/*	Add this new score. Copy data rather then referring back to visitor
			so we can keep this data around even after visitor has left.
		 */
		this.hiScores.push(new Score(
			visitorData.name,
			visitorData.email,
			visitorData.totalScore
		));
		// Sort all entries by score
		this.hiScores.sort((lhs, rhs) => rhs.score - lhs.score);
		// Discard trailing entries to keep kMaxHighScoreEntries
		const toRemove = this.hiScores.length - kMaxHighScoreEntries;
		while (toRemove > 0)
			this.hiScores.remove(kMaxHighScoreEntries, toRemove);
		this.hiScorePersistor.persist();	// Save list to disk
	}
}


/*	A Spot that can be visited and some common stuff shared by those here,
	such as getting the RFID code from the spot's scannerInput and letting
	subclass know about this, as well as resolving the RFID code to the
	corresponding Visitor's data. I inherit most functionality from my
	StationBase base class, which collaborates with the VisitorScriptBase
	base class of my main BasicTagOnly script to keep track of who's where.
	This Station is then used as the base class of my actual stations.
*/
abstract class Station extends StationBase<BasicTagOnlyData, BasicTagOnly, DisplaySpot> {

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
	protected recordFromRfidCode(rfidCode: string): BasicTagOnlyData {
		return this.owner.getRecordSec(BasicTagOnlyData, 'idCode', rfidCode);
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

	constructor(spotPath: string, owner: BasicTagOnly) {
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
			record = this.owner.newRecord(BasicTagOnlyData);
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
	receivedVisitor(visitorData: BasicTagOnlyData) {
		log("Reception received visitor name", visitorData.name, visitorData.$puid);
		super.receivedVisitor(visitorData);	// Establishes my current visitor
		this.nameProp.value = visitorData.name;
		this.email.value = visitorData.email;
		return true;
	}

	lostVisitor(visitor: BasicTagOnlyData) {
		this.activateByGotoBlock(false);
		super.lostVisitor(visitor);
	}
}

/**
 * Station showing a quiz game when visited.
 */
class QuizStation extends Station {
	private nameProp: PropertyAccessor<string>;	// Name I can show to visitor on station
	private scoreProp: PropertyAccessor<number>;	// Score on quiz game except speakerTall
	private speakerTall: PropertyAccessor<number>;	// Score on quiz game except speakerTall

	constructor(spotPath: string, owner: BasicTagOnly) {
		super(spotPath, owner);
	}

	init() {
		this.nameProp = this.getSpotParameterAccessor<string>("name");

		// Update visitor's score whenever value changes from quiz station
		this.scoreProp = this.getSpotParameterAccessor<number>(
			"quizScore",
			quizScore => this.getCurrVisitor().quizScore = quizScore
		);

		// Ditto for separate "how tall is the speaker" tie-breaker answer
		this.speakerTall = this.getSpotParameterAccessor<number>(
			"speakerTall",
			tall => this.getCurrVisitor().speakerTall = tall
		);

		super.init();
	}

	protected gotIdCode(idCode: string) {
		log("Quiz station receved ID", idCode);
		const record = this.recordFromRfidCode(idCode);
		if (record) { // Already known visitor
			this.nameProp.value = record.name;
			log("QuizStation visitor", this.nameProp.value, "orig name", record.name, idCode);
			this.gotVisitor(record);
		} else 	// Not a known visitor - give message
			this.gotoBlock("Active/Unknown");
	}


	/**	Specified visitor is visiting this station.
		Do what's appropriate there.
	*/
	receivedVisitor(visitorData: BasicTagOnlyData) {
		super.receivedVisitor(visitorData);	// Establishes my current visitor
		this.speakerTall.value = 0;
		const briefed = visitorData.briefed; // Has he been briefed at the Info kiosk?
		this.gotoBlock(briefed ? "Active/Steps/q1" : "Active/NotYet");
		return true;
	}

	lostVisitor(visitor: BasicTagOnlyData) {
		this.gotoBlock("Passive");
		super.lostVisitor(visitor);
	}
}

/*	Station showing some useful information when visited. Only shown to
	known visitors. Furthermore, the info is only shown ONCE per visitor,
	so I keep track of this state in the visitor's data record.
*/
class InfoStation extends Station {
	private nameProp: PropertyAccessor<string>;		// Name and email entered at this spot

	constructor(spotPath: string, owner: BasicTagOnly) {
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
	receivedVisitor(visitorData: BasicTagOnlyData) {
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

	lostVisitor(visitor: BasicTagOnlyData) {
		this.gotoBlock("Passive");
		super.lostVisitor(visitor);
	}
}


/*	Visitor leaves. Detach ID tag and archive visitor's data.
*/
class GoodByeStation extends Station {
	private nameProp: PropertyAccessor<string>;	// Name I can show to visitor on station
	private scoreProp: PropertyAccessor<number>; // Name I can show to visitor on station

	constructor(public readonly spotPath: string, owner: BasicTagOnly) {
		super(spotPath, owner);
	}

	init() {
		// Hook up to Spot parameters used to show goodbye message
		this.nameProp = this.getSpotParameterAccessor<string>("name");
		this.scoreProp = this.getSpotParameterAccessor<number>("score");
		super.init();
	}

	protected gotIdCode(idCode: string) {
		log("GoodByeStation got ID", idCode);
		this.gotVisitor(this.recordFromRfidCode(idCode));
	}

	/**	Specified visitor is visiting this station.
		Do what's appropriate there.
	*/
	receivedVisitor(visitorData: BasicTagOnlyData) {
		super.receivedVisitor(visitorData);	// Establishes my current visitor
		const score = calcScore(visitorData);
		this.nameProp.value = visitorData.name || "nameless person";
		this.scoreProp.value = score;
		visitorData.totalScore = score;
		this.owner.newScore(visitorData);
		this.activateByGotoBlock(true); // Shows score using attractor

		// Tell my main script that this visitor is now gone
		this.owner.leftTheBuilding(visitorData);
		return true;
	}
}

/*	Calculate the total score from visitor, based on quiz score
	from right/wrong answers plus how close the speaker's length were
	to reality. Multiply by 10 to make it look more, and to not
	depend on fractions.
 */
function calcScore(visitor: BasicTagOnlyData): number {
	const kSpan = 20;	// cm, max span
	let delta = Math.abs(visitor.speakerTall - kSpeakerTall);
	delta = Math.min(delta, kSpan);	// Clip to span
	let tallContibution = (kSpan - delta) / 4;	// Yields score contribution
	return Math.round((visitor.quizScore + tallContibution) * 10);
}


// What we present and save as high scores
class Score {
	private readonly mName: string;
	private readonly mEmail: string;
	private readonly mScore: number;

	/**
	 * Make a new high-score item
	 */
	public constructor(name: string, email: string, score: number) {
		this.mName = name;
		this.mEmail = email;
		this.mScore = score;
	}

	/**
	 * Factory making a real GameScoreItem from a (possibly) degenerate
	 * source loaded from JSON file. Implements the Deserializor interface
	 * on the type (constructor function) itself.
	 */
	static fromDeserialized(source: Score): Score {
		return new Score(
			source.mName,
			source.mEmail,
			source.mScore
		);
	}

	// Getters for exposed properties (all read-only)
	@property("Visitor's name")
	get name(): string {
		return this.mName;
	}
	@property("Visitor's email address")
	get email(): string {
		return this.mEmail;
	}
	@property("Visitor's total score")
	get score(): number {
		return this.mScore;
	}
}


/** Calculate how long visitor has been on site, in seconds.
*/
function visitedSeconds(rec: BasicTagOnlyData): number {
	return Math.round((Date.now() - rec.whenJoined) / 1000);
}

/**
 Log messages, allowing my logging to be easily disabled in one place.
 */
function log(...messages: any[]) {
	if (DEBUG)	// Set to false to disable my logging
		console.info(messages);
}
