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
    var RECONN_DELAY_MS = 2500;
    var HEARTBEAT_INTERVAL_MS = 5000;
    var URL = 'ws://192.168.2.245:8123/';
    var HEADERS = {
        'Authorization': 'Bearer c7IIiWxOXC6jWwSPDvSWDKf5lfEUcsR79djeK5T3ScRKOMWFy4hVhU5N3l5PaOsi7VsUeXF3i7o8yfcTaB',
    };
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
            SimpleWebsocket_1.SimpleWebsocket.connect(URL, 8192, HEADERS).then(function (connection) {
                _this.connection = connection;
                console.log('Iiwari WS connected');
                connection.subscribe('textReceived', _this.handleMessage);
                connection.subscribe('finish', _this.handleFinish);
                _this.sendHeartbeat();
            });
        };
        IiwariWSClient.prototype.sendHeartbeat = function () {
            var _this = this;
            if (!this.connection) {
                return;
            }
            this.connection.sendText('');
            if (this.heartbeatAwaiter) {
                this.heartbeatAwaiter.cancel();
            }
            this.heartbeatAwaiter = wait(HEARTBEAT_INTERVAL_MS);
            this.heartbeatAwaiter.then(function () { return _this.sendHeartbeat(); });
        };
        IiwariWSClient.prototype.handleFinish = function (sender) {
            var _this = this;
            console.log('Iiwari WS disconnected, reconnecting in ' + RECONN_DELAY_MS + ' ms');
            if (this.heartbeatAwaiter) {
                this.heartbeatAwaiter.cancel();
                this.heartbeatAwaiter = undefined;
            }
            if (this.reconnectAwaiter) {
                this.reconnectAwaiter.cancel();
            }
            this.reconnectAwaiter = wait(RECONN_DELAY_MS);
            this.reconnectAwaiter.then(function () { return _this.connect(); });
        };
        IiwariWSClient.prototype.handleMessage = function (sender, message) {
            console.log(message.text);
        };
        return IiwariWSClient;
    }(Script_1.Script));
    exports.IiwariWSClient = IiwariWSClient;
});
