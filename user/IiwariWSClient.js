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
define(["require", "exports", "system_lib/Script", "system/SimpleWebsocket"], function (require, exports, Script_1, SimpleWebsocket_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.IiwariWSClient = void 0;
    var reconnDelayMs = 500;
    var address = 'ws://192.168.2.245:8123/';
    var IiwariWSClient = (function (_super) {
        __extends(IiwariWSClient, _super);
        function IiwariWSClient(env) {
            var _this = _super.call(this, env) || this;
            _this.mLastMessage = "";
            _this.connect();
            return _this;
        }
        IiwariWSClient.prototype.connect = function () {
            var _this = this;
            SimpleWebsocket_1.SimpleWebsocket.connect(address).then(function (connection) {
                console.log('Iiwari WS connected');
                connection.subscribe('textReceived', _this.handleMessage);
                connection.subscribe('finish', function (sender) {
                    console.log('Iiwari WS disconnected, reconnecting in ' + reconnDelayMs + ' ms');
                    var reconnectAwaiter = wait(reconnDelayMs);
                    reconnectAwaiter.then(function () { return _this.connect(); });
                });
            });
        };
        IiwariWSClient.prototype.handleMessage = function (sender, message) {
            console.log(message.text);
        };
        return IiwariWSClient;
    }(Script_1.Script));
    exports.IiwariWSClient = IiwariWSClient;
});
