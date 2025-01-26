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
define(["require", "exports", "system/Spot", "system_lib/Script", "system_lib/ScriptBase", "system_lib/Metadata"], function (require, exports, Spot_1, Script_1, ScriptBase_1, Meta) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.HelloWorld = exports.HelloWorldData = void 0;
    var kMobileSpot = "Visitor";
    var HelloWorldData = (function (_super) {
        __extends(HelloWorldData, _super);
        function HelloWorldData() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        __decorate([
            Meta.field(),
            __metadata("design:type", Number)
        ], HelloWorldData.prototype, "whenJoined", void 0);
        __decorate([
            Meta.field(),
            __metadata("design:type", String)
        ], HelloWorldData.prototype, "location", void 0);
        __decorate([
            Meta.field(),
            Meta.spotParameter(),
            __metadata("design:type", String)
        ], HelloWorldData.prototype, "name", void 0);
        HelloWorldData = __decorate([
            Meta.record('Data we collect for each visitor')
        ], HelloWorldData);
        return HelloWorldData;
    }(ScriptBase_1.RecordBase));
    exports.HelloWorldData = HelloWorldData;
    var HelloWorld = (function (_super) {
        __extends(HelloWorld, _super);
        function HelloWorld(env) {
            var _this = _super.call(this, env) || this;
            _this.listenForVisitors();
            return _this;
        }
        HelloWorld.prototype.discardAll = function () {
            this.deleteRecords(HelloWorldData);
        };
        HelloWorld.prototype.listenForVisitors = function () {
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
        HelloWorld.prototype.gotVisitorConnection = function (visitor) {
            if (visitor.record.whenJoined)
                console.log("Visitor phone re-connected, ID", visitor.identity);
            else {
                visitor.record.whenJoined = Date.now();
                console.log("New visitor phone connected, ID", visitor.identity);
            }
            visitor.subscribe('location', function (sender, message) {
                visitor.record.location = message.location;
                console.log("Visitor ID", visitor.identity, "now at location", message.location);
            });
        };
        __decorate([
            Meta.callable('Discard ALL visitor data'),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", []),
            __metadata("design:returntype", void 0)
        ], HelloWorld.prototype, "discardAll", null);
        return HelloWorld;
    }(Script_1.Script));
    exports.HelloWorld = HelloWorld;
});
