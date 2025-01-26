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
define(["require", "exports", "system/Spot", "../system_lib/ScriptBase", "system_lib/Metadata", "../lib/IndexedPropertyPersistor", "../lib/VisitorData"], function (require, exports, Spot_1, ScriptBase_1, Metadata_1, IndexedPropertyPersistor_1, VisitorData_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BasicTagOnly = void 0;
    var kSpeakerTall = 186;
    var kMaxHighScoreEntries = 30;
    var kPersistenceDir = 'BasicTagOnly';
    var DEBUG = true;
    var BasicTagOnlyData = (function (_super) {
        __extends(BasicTagOnlyData, _super);
        function BasicTagOnlyData() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        __decorate([
            (0, Metadata_1.id)(),
            __metadata("design:type", String)
        ], BasicTagOnlyData.prototype, "idCode", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            __metadata("design:type", String)
        ], BasicTagOnlyData.prototype, "name", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            __metadata("design:type", String)
        ], BasicTagOnlyData.prototype, "currentStation", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            __metadata("design:type", Number)
        ], BasicTagOnlyData.prototype, "whenJoined", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            __metadata("design:type", String)
        ], BasicTagOnlyData.prototype, "email", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            __metadata("design:type", Boolean)
        ], BasicTagOnlyData.prototype, "briefed", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            __metadata("design:type", Number)
        ], BasicTagOnlyData.prototype, "quizScore", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            __metadata("design:type", Number)
        ], BasicTagOnlyData.prototype, "speakerTall", void 0);
        __decorate([
            (0, Metadata_1.field)(),
            __metadata("design:type", Number)
        ], BasicTagOnlyData.prototype, "totalScore", void 0);
        BasicTagOnlyData = __decorate([
            (0, Metadata_1.record)("Data we track for each visitor")
        ], BasicTagOnlyData);
        return BasicTagOnlyData;
    }(ScriptBase_1.RecordBase));
    var BasicTagOnly = (function (_super) {
        __extends(BasicTagOnly, _super);
        function BasicTagOnly(env) {
            var _this = _super.call(this, env) || this;
            _this.addStation(new Reception("BasicTagOnly.TouchLeft", _this));
            _this.addStation(new QuizStation("BasicTagOnly.TouchRight", _this));
            _this.addStation(new GoodByeStation("BasicTagOnly.ScreenRight", _this));
            _this.addStation(new InfoStation("BasicTagOnly.ScreenLeft", _this));
            _this.hiScorePersistor = new IndexedPropertyPersistor_1.IndexedPropertyPersistor(_this, kPersistenceDir);
            _this.hiScores = _this.hiScorePersistor.getOrMake('hiScores', Score);
            return _this;
        }
        BasicTagOnly.prototype.deleteAllVisitors = function (archive) {
            _super.prototype.deleteRecords.call(this, BasicTagOnlyData, archive);
            log("Deleted All");
        };
        BasicTagOnly.prototype.simulateRfid = function (spotPath, rfidCode) {
            var station = this.getStationForSpotPath(spotPath);
            if (station)
                station.simulateRfid(rfidCode);
            else
                throw "No such station/spot path";
        };
        BasicTagOnly.prototype.newScore = function (visitorData) {
            this.hiScores.push(new Score(visitorData.name, visitorData.email, visitorData.totalScore));
            this.hiScores.sort(function (lhs, rhs) { return rhs.score - lhs.score; });
            var toRemove = this.hiScores.length - kMaxHighScoreEntries;
            while (toRemove > 0)
                this.hiScores.remove(kMaxHighScoreEntries, toRemove);
            this.hiScorePersistor.persist();
        };
        __decorate([
            (0, Metadata_1.callable)("Discard all visitors of the last day. Call nightly."),
            __param(0, (0, Metadata_1.parameter)("Archive log files rather than deleting them")),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", [Boolean]),
            __metadata("design:returntype", void 0)
        ], BasicTagOnly.prototype, "deleteAllVisitors", null);
        __decorate([
            (0, Metadata_1.callable)("Spoon-feed an RFID code as being scanned at a Spot"),
            __param(0, (0, Metadata_1.parameter)("Spot path, e.g. 'TwoScreens.Left'")),
            __param(1, (0, Metadata_1.parameter)("Code being scanned at Spot")),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", [String, String]),
            __metadata("design:returntype", void 0)
        ], BasicTagOnly.prototype, "simulateRfid", null);
        return BasicTagOnly;
    }(VisitorData_1.VisitorScriptBase));
    exports.BasicTagOnly = BasicTagOnly;
    var Station = (function (_super) {
        __extends(Station, _super);
        function Station() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Station.prototype.init = function () {
            var _this = this;
            this.getSpotPropertyAccessor("scannerInput", function (code) {
                if (code)
                    _this.gotIdCode(code);
            });
            _super.prototype.init.call(this);
        };
        Station.prototype.recordFromRfidCode = function (rfidCode) {
            return this.owner.getRecordSec(BasicTagOnlyData, 'idCode', rfidCode);
        };
        Station.prototype.simulateRfid = function (code) {
            this.gotIdCode(code);
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
            this.email = this.getSpotParameterAccessor("email", function (updatedEmail) { return _this.getCurrVisitor().email = updatedEmail; });
            this.messageProp = this.getSpotParameterAccessor("message");
            _super.prototype.init.call(this);
        };
        Reception.prototype.gotIdCode = function (idCode) {
            var _this = this;
            var record = this.recordFromRfidCode(idCode);
            if (record) {
                log("Reception returning visitor", record.name, record.$puid);
                this.messageProp.value = "Hello again " + record.name;
            }
            else {
                record = this.owner.newRecord(BasicTagOnlyData);
                log("Reception new visitor ID", idCode, record.$puid);
                record.whenJoined = Date.now();
                record.idCode = idCode;
                this.messageProp.value = "Welcome!";
            }
            var otherVisitor = this.hasVisitor() && !this.isCurrentVisitor(record);
            this.gotVisitor(record);
            if (otherVisitor) {
                wait(200).then(function () { return _this.activateByGotoBlock(true); });
            }
            else
                this.activateByGotoBlock(true);
        };
        Reception.prototype.receivedVisitor = function (visitorData) {
            log("Reception received visitor name", visitorData.name, visitorData.$puid);
            _super.prototype.receivedVisitor.call(this, visitorData);
            this.nameProp.value = visitorData.name;
            this.email.value = visitorData.email;
            return true;
        };
        Reception.prototype.lostVisitor = function (visitor) {
            this.activateByGotoBlock(false);
            _super.prototype.lostVisitor.call(this, visitor);
        };
        return Reception;
    }(Station));
    var QuizStation = (function (_super) {
        __extends(QuizStation, _super);
        function QuizStation(spotPath, owner) {
            return _super.call(this, spotPath, owner) || this;
        }
        QuizStation.prototype.init = function () {
            var _this = this;
            this.nameProp = this.getSpotParameterAccessor("name");
            this.scoreProp = this.getSpotParameterAccessor("quizScore", function (quizScore) { return _this.getCurrVisitor().quizScore = quizScore; });
            this.speakerTall = this.getSpotParameterAccessor("speakerTall", function (tall) { return _this.getCurrVisitor().speakerTall = tall; });
            _super.prototype.init.call(this);
        };
        QuizStation.prototype.gotIdCode = function (idCode) {
            log("Quiz station receved ID", idCode);
            var record = this.recordFromRfidCode(idCode);
            if (record) {
                this.nameProp.value = record.name;
                log("QuizStation visitor", this.nameProp.value, "orig name", record.name, idCode);
                this.gotVisitor(record);
            }
            else
                this.gotoBlock("Active/Unknown");
        };
        QuizStation.prototype.receivedVisitor = function (visitorData) {
            _super.prototype.receivedVisitor.call(this, visitorData);
            this.speakerTall.value = 0;
            var briefed = visitorData.briefed;
            this.gotoBlock(briefed ? "Active/Steps/q1" : "Active/NotYet");
            return true;
        };
        QuizStation.prototype.lostVisitor = function (visitor) {
            this.gotoBlock("Passive");
            _super.prototype.lostVisitor.call(this, visitor);
        };
        return QuizStation;
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
    var GoodByeStation = (function (_super) {
        __extends(GoodByeStation, _super);
        function GoodByeStation(spotPath, owner) {
            var _this = _super.call(this, spotPath, owner) || this;
            _this.spotPath = spotPath;
            return _this;
        }
        GoodByeStation.prototype.init = function () {
            this.nameProp = this.getSpotParameterAccessor("name");
            this.scoreProp = this.getSpotParameterAccessor("score");
            _super.prototype.init.call(this);
        };
        GoodByeStation.prototype.gotIdCode = function (idCode) {
            log("GoodByeStation got ID", idCode);
            this.gotVisitor(this.recordFromRfidCode(idCode));
        };
        GoodByeStation.prototype.receivedVisitor = function (visitorData) {
            _super.prototype.receivedVisitor.call(this, visitorData);
            var score = calcScore(visitorData);
            this.nameProp.value = visitorData.name || "nameless person";
            this.scoreProp.value = score;
            visitorData.totalScore = score;
            this.owner.newScore(visitorData);
            this.activateByGotoBlock(true);
            this.owner.leftTheBuilding(visitorData);
            return true;
        };
        return GoodByeStation;
    }(Station));
    function calcScore(visitor) {
        var kSpan = 20;
        var delta = Math.abs(visitor.speakerTall - kSpeakerTall);
        delta = Math.min(delta, kSpan);
        var tallContibution = (kSpan - delta) / 4;
        return Math.round((visitor.quizScore + tallContibution) * 10);
    }
    var Score = (function () {
        function Score(name, email, score) {
            this.mName = name;
            this.mEmail = email;
            this.mScore = score;
        }
        Score.fromDeserialized = function (source) {
            return new Score(source.mName, source.mEmail, source.mScore);
        };
        Object.defineProperty(Score.prototype, "name", {
            get: function () {
                return this.mName;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Score.prototype, "email", {
            get: function () {
                return this.mEmail;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Score.prototype, "score", {
            get: function () {
                return this.mScore;
            },
            enumerable: false,
            configurable: true
        });
        __decorate([
            (0, Metadata_1.property)("Visitor's name"),
            __metadata("design:type", String),
            __metadata("design:paramtypes", [])
        ], Score.prototype, "name", null);
        __decorate([
            (0, Metadata_1.property)("Visitor's email address"),
            __metadata("design:type", String),
            __metadata("design:paramtypes", [])
        ], Score.prototype, "email", null);
        __decorate([
            (0, Metadata_1.property)("Visitor's total score"),
            __metadata("design:type", Number),
            __metadata("design:paramtypes", [])
        ], Score.prototype, "score", null);
        return Score;
    }());
    function visitedSeconds(rec) {
        return Math.round((Date.now() - rec.whenJoined) / 1000);
    }
    function log() {
        var messages = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            messages[_i] = arguments[_i];
        }
        if (DEBUG)
            console.info(messages);
    }
});
