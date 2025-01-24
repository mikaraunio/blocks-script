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
define(["require", "exports", "system_lib/Driver", "system_lib/Metadata"], function (require, exports, Driver_1, Metadata_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ArduinoRapids = void 0;
    var OkResponseParser = /^OK(\d\d\d)$/;
    var ArduinoRapids = (function (_super) {
        __extends(ArduinoRapids, _super);
        function ArduinoRapids(connection) {
            var _this = _super.call(this, connection) || this;
            _this.connection = connection;
            _this.mConnected = false;
            _this.mIntensity = 0;
            connection.autoConnect();
            _this.connected = connection.connected;
            if (_this.connected) {
                _this.setupConnection();
            }
            connection.subscribe('textReceived', function (sender, message) {
                if (message.text) {
                    log("Data from device", message.text);
                    var parseResult = OkResponseParser.exec(message.text);
                    if (parseResult) {
                        var newIntensity = parseInt(parseResult[1]);
                        if (!isNaN(newIntensity)) {
                            var oldIntensity = _this.mIntensity;
                            _this.mIntensity = newIntensity;
                            if (oldIntensity != newIntensity) {
                                _this.changed('intensity');
                            }
                        }
                    }
                }
                else {
                    console.error("ERROR: unknown data from device", message.text);
                }
            });
            connection.subscribe('connect', function (sender, message) {
                log("Connect state changed to", _this.connection.connected);
                _this.connected = _this.connection.connected;
                if (message.type === 'Connection' && connection.connected) {
                    _this.setupConnection();
                }
                else {
                }
            });
            return _this;
        }
        Object.defineProperty(ArduinoRapids.prototype, "connected", {
            get: function () { return this.mConnected; },
            set: function (val) { this.mConnected = val; },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(ArduinoRapids.prototype, "intensity", {
            get: function () { return this.mIntensity; },
            set: function (val) {
                var setIntensity = Math.floor(val);
                this.send('SET' + ('000' + setIntensity).slice(-3));
            },
            enumerable: false,
            configurable: true
        });
        ArduinoRapids.prototype.send = function (rawData) {
            this.connection.sendText(rawData, "\n");
            log("Sent: " + rawData);
        };
        ArduinoRapids.prototype.setupConnection = function () {
            this.send('SET');
        };
        __decorate([
            (0, Metadata_1.property)("Connected to server", true),
            __metadata("design:type", Boolean),
            __metadata("design:paramtypes", [Boolean])
        ], ArduinoRapids.prototype, "connected", null);
        __decorate([
            (0, Metadata_1.property)("Intensity", false),
            (0, Metadata_1.min)(0),
            (0, Metadata_1.max)(300),
            __metadata("design:type", Number),
            __metadata("design:paramtypes", [Number])
        ], ArduinoRapids.prototype, "intensity", null);
        ArduinoRapids = __decorate([
            (0, Metadata_1.driver)('NetworkTCP', { port: 4001 }),
            (0, Metadata_1.driver)('SerialPort', { baudRate: 19200 }),
            __metadata("design:paramtypes", [Object])
        ], ArduinoRapids);
        return ArduinoRapids;
    }(Driver_1.Driver));
    exports.ArduinoRapids = ArduinoRapids;
    var DEBUG = true;
    function log() {
        var messages = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            messages[_i] = arguments[_i];
        }
        if (DEBUG)
            console.info(messages);
    }
});
