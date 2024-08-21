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
define(["require", "exports", "system_lib/Driver", "system_lib/Metadata"], function (require, exports, Driver_1, Meta) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BiAmpTesira = void 0;
    var BiAmpTesira = (function (_super) {
        __extends(BiAmpTesira, _super);
        function BiAmpTesira(socket) {
            var _this = _super.call(this, socket) || this;
            _this.socket = socket;
            _this.mConnected = false;
            _this.mReady = false;
            _this.negotiationState = 0;
            _this.mLastSetVolume = 0;
            socket.autoConnect(true);
            _this.mConnected = socket.connected;
            socket.subscribe("connect", function (sender, message) {
                _this.connectStateChanged();
            });
            socket.subscribe("bytesReceived", function (sender, msg) {
                return _this.textReceived(msg.rawData);
            });
            if (socket.connected)
                _this.biAmpTesiraNegotiate();
            return _this;
        }
        Object.defineProperty(BiAmpTesira.prototype, "connected", {
            get: function () {
                return this.mConnected;
            },
            set: function (online) {
                this.mConnected = online;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(BiAmpTesira.prototype, "negotiated", {
            get: function () {
                return this.mReady;
            },
            set: function (online) {
                this.mReady = online;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(BiAmpTesira.prototype, "volume", {
            get: function () {
                return this.mLastSetVolume;
            },
            set: function (val) {
                this.tell('Level1 set level 1 ' + val);
                this.mLastSetVolume = val;
            },
            enumerable: false,
            configurable: true
        });
        BiAmpTesira.prototype.connectStateChanged = function () {
            console.info("connectStateChanged", this.socket.connected);
            this.connected = this.socket.connected;
            if (this.socket.connected)
                this.biAmpTesiraNegotiate();
        };
        BiAmpTesira.prototype.textReceived = function (rawData) {
            var hex = this.toHex(rawData);
            var ascii = this.toAscii(hex);
            this.biAmpTesiraNegotiate();
        };
        BiAmpTesira.prototype.biAmpTesiraNegotiate = function () {
            if (this.socket.connected) {
                var response = void 0, converted = void 0;
                if (this.negotiationState < 3) {
                    switch (this.negotiationState) {
                        case 0:
                            response = "\xff\xfc\x18\xff\xfc\x20\xff\xfc\x23\xff\xfc\x27\xff\xfc\x24\x0a";
                            converted = this.convert(response);
                            this.socket.sendBytes(converted);
                            this.negotiationState = 1;
                            break;
                        case 1:
                            response = "\xff\xfe\x03\xff\xfc\x01\xff\xfc\x22\xff\xfc\x1f\xff\xfe\x05\xff\xfc\x21\x0a";
                            converted = this.convert(response);
                            this.socket.sendBytes(converted);
                            this.negotiationState = 2;
                            break;
                        case 2:
                            response = "SESSION get aliases\x0a";
                            converted = this.convert(response);
                            this.socket.sendBytes(converted);
                            this.negotiationState = 3;
                            this.mReady = true;
                            break;
                        default:
                            break;
                    }
                }
            }
        };
        BiAmpTesira.prototype.toHex = function (bytes) {
            var result = '';
            for (var i = 0; i < bytes.length; ++i) {
                var byte = bytes[i];
                var text = byte.toString(16);
                result += (byte < 16 ? ' 0' : ' ') + text;
            }
            return (result);
        };
        BiAmpTesira.prototype.toAscii = function (data) {
            var hex = data.toString()
                .replace(/ /g, ''), str = '';
            for (var i = 0; i < hex.length; i += 2)
                str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
            return str;
        };
        BiAmpTesira.prototype.convert = function (str) {
            var bytes = [];
            var bytes2 = [];
            var bytes3 = [];
            for (var i = 0; i < str.length; ++i) {
                var code = str.charCodeAt(i);
                bytes = bytes.concat([code]);
                bytes3.push(code);
                bytes2 = bytes2.concat([code & 0xff, code / 256 >>> 0]);
            }
            return bytes3;
        };
        BiAmpTesira.prototype.tell = function (data) {
            var bytes = this.convert(data + '\x0a');
            this.socket.sendBytes(bytes);
        };
        __decorate([
            Meta.property("Connected to BiAmp", true),
            __metadata("design:type", Boolean),
            __metadata("design:paramtypes", [Boolean])
        ], BiAmpTesira.prototype, "connected", null);
        __decorate([
            Meta.property("Negotiation completed with BiAmp", true),
            __metadata("design:type", Boolean),
            __metadata("design:paramtypes", [Boolean])
        ], BiAmpTesira.prototype, "negotiated", null);
        __decorate([
            Meta.property("Volume", true),
            __metadata("design:type", Number),
            __metadata("design:paramtypes", [Number])
        ], BiAmpTesira.prototype, "volume", null);
        BiAmpTesira = __decorate([
            Meta.driver("NetworkTCP", { port: 23 }),
            __metadata("design:paramtypes", [Object])
        ], BiAmpTesira);
        return BiAmpTesira;
    }(Driver_1.Driver));
    exports.BiAmpTesira = BiAmpTesira;
});
