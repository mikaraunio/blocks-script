/*	A mimimalistic demo of Visitor Data Collection functionality based on using visitor's
	Mobile Phone for identification. To keep things as simple as possible, this demo does
	not use any of the base classes from script/lib, otherwise often used to implement
	common functionality of such scripts, their "stations", etc. Check out one of the
	other demos such as BasicTagOnly or VisitorKitchenSink for more complete examples.

	Copyright (c) PIXILAB Technologies AB, Sweden (http://pixilab.se). All Rights Reserved.
 */


import { MobileSpot, Spot, Visitor } from 'system/Spot';
import {Script, ScriptEnv} from 'system_lib/Script';
import {RecordBase} from 'system_lib/ScriptBase';
import * as Meta from 'system_lib/Metadata';

/*	Name of MobileSpot to which visitor's connect using their phones.
	Connect using your phone's web browser by going to:

		http://server-name-or-IP-number/spot?mobile=Visitor

	Where "server-name-or-IP-number" is the domain namr or IP address
	to your blocks server, reachanble by your mobile phone, and the
	value of the "mobile" query parameter is the name of the Spot
	representing connecting phones (here "Visitor").

	This URL can be provided using a QR code scanned by the visitor.
	This can be printed on a sign, or shown on a display (e.g., using
	a QR Code block, if managed by Blocks).
 */
const kMobileSpot = "Visitor";


@Meta.record('Data we collect for each visitor')
export class HelloWorldData extends RecordBase {
	@Meta.field() whenJoined: number; // Time when this visitor first joined
	@Meta.field() location: string;	  // Most recenly reported location (from Locator block)

	/*	Name provided by visitor, if any. The "@Meta.spotParameter()" decorator connects
		this data field to a Spot Parameter with the same name and type. Note that you
		MUST establish that same parameter also in the block assigned to the spot where
		this is being shown. In our example, this is then presented to the visitor on the
		check-in page of the phone UI, allowing the visitor to enter a name, if desired.
		You don't need to have any such data, but having at least some name can make the
		visit feel more personal, since you can then greet the visitor by that name at
		stations visited.
	 */
	@Meta.field() @Meta.spotParameter() name: string;
}

/**
 * Main class implementing this user script. This file must have same name (plus .ts).
 */
export class HelloWorld extends Script {

	// Called once as the script is started
	constructor(env: ScriptEnv) {
		super(env);
		this.listenForVisitors();
	}

	/**
	 * Throw away ALL visitor data. Call once every night, e.g., from a scheduled Task
	 * to make sure live data doesn't accumulate indefinitely, since all live data is
	 * held in memory.
	 *
	 * Instead of simply deleting the data, you may instead want to archive the data,
	 * allowing it to be analyzed later.
	 *
	 * In cases where you use other ID tokens (such as RFID tags), you may also
	 * discard visitor data as each visitor checks out, allowing that ID token
	 * to be reused by another visitor. However, even in that case, it's a good idea
	 * to have a "discardAll" function called every night, to discard data for any
	 * visitors that for whatever reason never checked out.
	 */
	@Meta.callable('Discard ALL visitor data')
	discardAll() {
		this.deleteRecords(HelloWorldData);
		// Do this instead if you want to archive the data instead when discarded
		// this.deleteRecords(HelloWorldData, true);
	}

	/**
	 * Listen for new visitors connecting to our single MobileSpot
	 * (aka "Visitor Spot") entry URL.
	 *
	 * Also handle the case where the MobileSpot fires a 'finish' event,
	 * indicating it's deleted or re-initialized due to its
	 * settings being changed in the Blocks editor.
	 */
	private listenForVisitors() {
		const mobile = Spot[kMobileSpot] as MobileSpot;	// Get designated Spot

		// Ensure we indeed got a Spot of the expected type
		if (mobile && mobile.isOfTypeName('MobileSpot')) {

			// Listen for connecting visitors
			mobile.subscribe<HelloWorldData>('visitor', (sender, message) => {
				if (message.type === 'Connected')
					this.gotVisitorConnection(message.visitor);
			});

			// Listen for my MobileSpot going away, then attempt to re-attach
			mobile.subscribe('finish', sender => this.listenForVisitors());
		} else
			console.log(kMobileSpot, "is not a MobileSpot");
	}

	/**
	 * A visitor connected to me. Listen for interesting messages from that visitor. Here
	 * were only listening for the visitor's location to change, updating the current
	 * location in our data accordingly. We're not actually using this for anything here,
	 * but this can still be useful to analyze where visitors go, how long they stay before going
	 * somewhere else, etc, since all such data is also logged into the data log (CSV file)
	 * associated with each visitor.
	 */
	private gotVisitorConnection(visitor: Visitor<HelloWorldData>) {
		if (visitor.record.whenJoined)	// Not a new visitor if whenJoined already set
			console.log("Visitor phone re-connected, ID", visitor.identity);
		else {
			visitor.record.whenJoined = Date.now();
			console.log("New visitor phone connected, ID", visitor.identity);
		}

		visitor.subscribe('location', (sender, message) => {
			visitor.record.location = message.location;
			console.log("Visitor ID", visitor.identity, "now at location", message.location);
		});
	}
}
