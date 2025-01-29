var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
define(["require", "exports", "system/Artnet", "system/Spot", "../system_lib/ScriptBase", "system_lib/Metadata", "../lib/VisitorData"], function (require, exports, Artnet_1, Spot_1, ScriptBase_1, Metadata_1, VisitorData_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.VisitorTracking = void 0;
    var DEBUG = true;
    var kMobileSpot = "Mob1";
    var QRCodeAndPhoneData = (function (_super) {
        __extends(QRCodeAndPhoneData, _super);
        function QRCodeAndPhoneData() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        __decorate([
            (0, Metadata_1.id)(),
            __metadata("design:type", String)
        ], QRCodeAndPhoneData.prototype, "idCode", void 0);
        __decorate([
            (0, Metadata_1.id)(),
            __metadata("design:type", String)
        ], QRCodeAndPhoneData.prototype, "phone", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            (0, Metadata_1.spotParameter)(),
            __metadata("design:type", String)
        ], QRCodeAndPhoneData.prototype, "name", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            (0, Metadata_1.spotParameter)(),
            __metadata("design:type", String)
        ], QRCodeAndPhoneData.prototype, "color", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            (0, Metadata_1.spotParameter)(),
            __metadata("design:type", String)
        ], QRCodeAndPhoneData.prototype, "email", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            (0, Metadata_1.spotParameter)(),
            __metadata("design:type", String)
        ], QRCodeAndPhoneData.prototype, "badgeName", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            (0, Metadata_1.spotParameter)(),
            __metadata("design:type", String)
        ], QRCodeAndPhoneData.prototype, "currentStation", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            __metadata("design:type", Number)
        ], QRCodeAndPhoneData.prototype, "whenJoined", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            __metadata("design:type", Boolean)
        ], QRCodeAndPhoneData.prototype, "briefed", void 0);
        QRCodeAndPhoneData = __decorate([
            (0, Metadata_1.record)("Data we track for each visitor")
        ], QRCodeAndPhoneData);
        return QRCodeAndPhoneData;
    }(ScriptBase_1.RecordBase));
    var VisitorPhone = (function () {
        function VisitorPhone(owner, visitor) {
            var _this = this;
            this.owner = owner;
            this.visitor = visitor;
            log("VisitorPhone id and record", visitor.identity, visitor.record ? visitor.record.$puid : 'no data');
            this.record = visitor.record;
            this.rfidProperty = owner.getProperty('Spot.' + kMobileSpot + '.' + visitor.identity + '.parameter.rfid', function (rfid) { return _this.visitorRfidCode(rfid); });
            visitor.subscribe('finish', function () { return _this.visitorGone(); });
        }
        VisitorPhone.prototype.visitorRfidCode = function (rfid) {
            log("VisitorPhone rfid", rfid);
            if (!this.record) {
                log('New VisitorPhone, associating to rfid');
                var associateRecord = this.owner.getRecordSec(QRCodeAndPhoneData, 'idCode', rfid);
                if (associateRecord) {
                    associateRecord.phone = this.visitor.identity;
                    this.record = associateRecord;
                    log('VisitorPhone associated');
                }
                else {
                    log("Got RFID", rfid, "with no corresponding data record");
                }
                Spot_1.Spot['1_Regi'].gotoBlock('/QRcode');
            }
            else {
                log('Phone already associated, keeping old association');
            }
        };
        VisitorPhone.prototype.visitorGone = function () {
            log("VisitorPhone disconnected");
            this.rfidProperty.close();
        };
        return VisitorPhone;
    }());
    var VisitorTracking = (function (_super) {
        __extends(VisitorTracking, _super);
        function VisitorTracking(env) {
            var _this = _super.call(this, env) || this;
            _this.addStation(new Reception("1_Regi", _this));
            _this.addStation(new Trigger3Station("8_Paikannus", _this));
            _this.listenForVisitors();
            return _this;
        }
        VisitorTracking.prototype.deleteAllVisitors = function (archive) {
            _super.prototype.deleteRecords.call(this, QRCodeAndPhoneData, archive);
            log("Deleted All");
        };
        VisitorTracking.prototype.simulateRfid = function (spotPath, rfidCode, processIiwari) {
            var station = this.getStationForSpotPath(spotPath);
            if (station)
                station.simulateRfid(rfidCode, processIiwari);
            else
                throw "No such station/spot path";
        };
        VisitorTracking.prototype.listenForVisitors = function () {
            var _this = this;
            var mobile = Spot_1.Spot[kMobileSpot];
            if (mobile && mobile.isOfTypeName('MobileSpot')) {
                mobile.subscribe('visitor', function (sender, message) {
                    if (message.type === 'Connected')
                        _this.gotVisitorConnection(message.visitor);
                });
                mobile.subscribe('finish', function (sender) { return _this.listenForVisitors(); });
            }
            else
                console.log(kMobileSpot, "is not a MobileSpot");
        };
        VisitorTracking.prototype.gotVisitorConnection = function (visitor) {
            new VisitorPhone(this, visitor);
        };
        __decorate([
            (0, Metadata_1.callable)("Discard all visitors of the last day. Call nightly."),
            __param(0, (0, Metadata_1.parameter)("Archive log files rather than deleting them")),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", [Boolean]),
            __metadata("design:returntype", void 0)
        ], VisitorTracking.prototype, "deleteAllVisitors", null);
        __decorate([
            (0, Metadata_1.callable)("Spoon-feed an RFID code as being scanned at a Spot"),
            __param(0, (0, Metadata_1.parameter)("Spot path, e.g. 'TwoScreens.Left'")),
            __param(1, (0, Metadata_1.parameter)("Code being scanned at Spot")),
            __param(2, (0, Metadata_1.parameter)("Parse as Iiwari badge QR?", true)),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", [String, String, Boolean]),
            __metadata("design:returntype", void 0)
        ], VisitorTracking.prototype, "simulateRfid", null);
        return VisitorTracking;
    }(VisitorData_1.VisitorScriptBase));
    exports.VisitorTracking = VisitorTracking;
    var Station = (function (_super) {
        __extends(Station, _super);
        function Station() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Station.prototype.init = function () {
            var _this = this;
            _super.prototype.init.call(this);
            this.getSpotParameterAccessor("uwbArrival", function (code) {
                if (code)
                    _this.gotIdCode(code);
            });
            this.getSpotParameterAccessor("uwbDeparture", function (code) {
                if (code)
                    _this.lostIdCode(code);
            });
        };
        Station.prototype.recordFromRfidCode = function (rfidCode) {
            return this.owner.getRecordSec(QRCodeAndPhoneData, 'idCode', rfidCode);
        };
        Station.prototype.simulateRfid = function (code, processIiwari) {
            this.gotIdCode(code, processIiwari);
        };
        return Station;
    }(VisitorData_1.StationBase));
    var Reception = (function (_super) {
        __extends(Reception, _super);
        function Reception(spotPath, owner) {
            return _super.call(this, spotPath, owner) || this;
        }
        Reception.prototype.init = function () {
            var _this = this;
            this.nameProp = this.getSpotParameterAccessor("name", function (updatedName) { return _this.getCurrVisitor().name = updatedName; });
            this.emailProp = this.getSpotParameterAccessor("email", function (updatedEmail) { return _this.getCurrVisitor().email = updatedEmail; });
            this.colorProp = this.getSpotParameterAccessor("color", function (updatedColor) { return _this.getCurrVisitor().color = updatedColor; });
            this.connectqrcodeProp = this.getSpotParameterAccessor("connectqrcode");
            this.messageProp = this.getSpotParameterAccessor("message");
            _super.prototype.init.call(this);
        };
        Reception.prototype.gotIdCode = function (idCode, processIiwari) {
            log('Ignoring UWB token arrival, Reception only handles explcit registrations');
        };
        Reception.prototype.simulateRfid = function (idCode, processIiwari) {
            var _a;
            var badgeName = undefined;
            if (processIiwari) {
                try {
                    _a = idCode.split(':'), badgeName = _a[0], idCode = _a[1];
                    badgeName = badgeName.toUpperCase();
                    idCode = idCode.toLowerCase();
                }
                catch (_b) {
                    log('Could not parse Iiwari QR code');
                    return;
                }
            }
            var record = this.recordFromRfidCode(idCode);
            if (record) {
                log("Reception returning visitor", record.name, record.$puid);
                this.messageProp.value = "Hello again " + record.name;
            }
            else {
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
        };
        Reception.prototype.lostIdCode = function (idCode) {
            log("Reception station lost UWB token", idCode);
            var record = this.recordFromRfidCode(idCode);
            if (record)
                this.lostVisitor(record);
        };
        Reception.prototype.receivedVisitor = function (visitorData) {
            log("Reception received visitor name", visitorData.name, visitorData.$puid);
            _super.prototype.receivedVisitor.call(this, visitorData);
            this.nameProp.value = visitorData.name;
            this.emailProp.value = visitorData.email;
            this.colorProp.value = visitorData.color;
            this.connectqrcodeProp.value = "https://spaceodyssey.online/spot/index.ftl?mobile=".concat(kMobileSpot, "&param-rfid=").concat(visitorData.idCode);
            return true;
        };
        Reception.prototype.lostVisitor = function (visitor) {
            _super.prototype.lostVisitor.call(this, visitor);
        };
        return Reception;
    }(Station));
    var InfoStation = (function (_super) {
        __extends(InfoStation, _super);
        function InfoStation(spotPath, owner) {
            return _super.call(this, spotPath, owner) || this;
        }
        InfoStation.prototype.init = function () {
            this.nameProp = this.getSpotParameterAccessor("name");
            _super.prototype.init.call(this);
        };
        InfoStation.prototype.gotIdCode = function (idCode) {
            log("Info station receved RFID", idCode);
            var record = this.recordFromRfidCode(idCode);
            if (record)
                this.gotVisitor(record);
            else
                Spot_1.Spot[this.spotPath].gotoBlock("/Active/Visitor/Unknown");
        };
        InfoStation.prototype.lostIdCode = function (idCode) {
            log("Info station lost UWB token", idCode);
            var record = this.recordFromRfidCode(idCode);
            if (record)
                this.lostVisitor(record);
        };
        InfoStation.prototype.receivedVisitor = function (visitorData) {
            _super.prototype.receivedVisitor.call(this, visitorData);
            this.nameProp.value = visitorData.name;
            if (visitorData.briefed)
                this.gotoBlock("/Active/Visitor/AlreadyBriefed");
            else {
                this.gotoBlock("/Active/Visitor/Brief");
                visitorData.briefed = true;
            }
            return true;
        };
        InfoStation.prototype.lostVisitor = function (visitor) {
            this.gotoBlock("Passive");
            _super.prototype.lostVisitor.call(this, visitor);
        };
        return InfoStation;
    }(Station));
    var Trigger3Station = (function (_super) {
        __extends(Trigger3Station, _super);
        function Trigger3Station(spotPath, owner) {
            var _this = _super.call(this, spotPath, owner) || this;
            _this.spotPath = spotPath;
            return _this;
        }
        Trigger3Station.prototype.init = function () {
            _super.prototype.init.call(this);
        };
        Trigger3Station.prototype.gotIdCode = function (idCode) {
            log("Trigger3 got UWB token", idCode);
            this.gotVisitor(this.recordFromRfidCode(idCode));
        };
        Trigger3Station.prototype.lostIdCode = function (idCode) {
            log("Trigger3 station lost UWB token", idCode);
            var record = this.recordFromRfidCode(idCode);
            if (record)
                this.lostVisitor(record);
        };
        Trigger3Station.prototype.receivedVisitor = function (visitorData) {
            var FADETIME = 1;
            _super.prototype.receivedVisitor.call(this, visitorData);
            if (!visitorData.color)
                return false;
            for (var i = 10; i <= 15; i++) {
                Artnet_1.Artnet['test_' + i][visitorData.color].fadeTo(100, FADETIME);
            }
            return true;
        };
        Trigger3Station.prototype.lostVisitor = function (visitor) {
            var FADETIME = 1;
            _super.prototype.lostVisitor.call(this, visitor);
            if (!visitor.color)
                return;
            for (var i = 10; i <= 15; i++) {
                Artnet_1.Artnet['test_' + i]['Red'].fadeTo(0, FADETIME);
                Artnet_1.Artnet['test_' + i]['Green'].fadeTo(0, FADETIME);
                Artnet_1.Artnet['test_' + i]['Blue'].fadeTo(0, FADETIME);
            }
        };
        return Trigger3Station;
    }(Station));
    function log() {
        var messages = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            messages[_i] = arguments[_i];
        }
        if (DEBUG)
            console.info(messages);
    }
});
