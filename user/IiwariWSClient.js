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
    var RECONN_DELAY_MS = 2.5 * 1000;
    var HEARTBEAT_INTERVAL_MS = 0;
    var RECEIVE_TIMEOUT_MS = 30 * 1000;
    var URL = 'wss://dash.iiwari.cloud/api/v1/sites/016fd235-8e10-1486-23f6-5e6cc6f4827b/stream?events=20,21';
    var HEADERS = {
        'Authorization': 'Bearer c7IIiWxOXC6jWwSPDvSWDKf5lfEUcsR79djeK5T3ScRKOMWFy4hVhU5N3l5PaOsi7VsUeXF3i7o8yfcTaB',
    };
    var IiwariWSClient = (function (_super) {
        __extends(IiwariWSClient, _super);
        function IiwariWSClient(env) {
            var _this = _super.call(this, env) || this;
            _this.mLastMessage = "";
            _this.reconnectAwaiter = undefined;
            _this.heartbeatAwaiter = undefined;
            _this.receiveTimeoutAwaiter = undefined;
            _this.connection = undefined;
            _this.lastReceivedTimestamp = undefined;
            console.log('Iiwari WS: Started');
            _this.connect();
            return _this;
        }
        IiwariWSClient.prototype.connect = function () {
            var _this = this;
            SimpleWebsocket_1.SimpleWebsocket.connect(URL, 8192, HEADERS).then(function (connection) {
                _this.connection = connection;
                console.log('Iiwari WS: Connected');
                connection.subscribe('textReceived', function (sender, message) { return _this.handleMessage(sender, message); });
                connection.subscribe('finish', function (sender) { return _this.handleFinish(sender); });
                _this.lastReceivedTimestamp = Date.now();
                _this.sendHeartbeat();
                _this.waitForReceiveTimeout();
            }).catch(function (error) {
                console.log('Iiwari WS: Connection failed, error:', error);
                _this.reconnect();
            });
        };
        IiwariWSClient.prototype.waitForReceiveTimeout = function () {
            var _this = this;
            if (RECEIVE_TIMEOUT_MS == 0) {
                console.log('Iivari WS: Receive timeouts disabled');
                return;
            }
            this.receiveTimeoutAwaiter = wait(RECEIVE_TIMEOUT_MS);
            this.receiveTimeoutAwaiter.then(function () {
                if (!_this.connection) {
                    console.log('Iivari WS: Connection already closed when entering receive timeout handler');
                    return;
                }
                if (_this.lastReceivedTimestamp && (Date.now() - _this.lastReceivedTimestamp) > RECEIVE_TIMEOUT_MS) {
                    console.log('Iivari WS: Receive timeout, no messages received in ' + RECEIVE_TIMEOUT_MS + ' ms, disconnecting');
                    _this.connection.disconnect();
                    _this.connection = undefined;
                    _this.reconnect();
                }
                else {
                    _this.waitForReceiveTimeout();
                }
            });
        };
        IiwariWSClient.prototype.sendHeartbeat = function () {
            var _this = this;
            if (HEARTBEAT_INTERVAL_MS == 0) {
                console.log('Iivari WS: Heartbeat messages disabled');
                return;
            }
            if (!this.connection) {
                console.log('Iivari WS: Skipping heartbeat send, not connected');
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
            console.log('Iiwari WS: Disconnected');
            this.connection = undefined;
            this.reconnect();
        };
        IiwariWSClient.prototype.reconnect = function () {
            var _this = this;
            console.log('Iiwari WS: Reconnecting in ' + RECONN_DELAY_MS + ' ms');
            if (this.heartbeatAwaiter) {
                this.heartbeatAwaiter.cancel();
                this.heartbeatAwaiter = undefined;
            }
            if (this.receiveTimeoutAwaiter) {
                this.receiveTimeoutAwaiter.cancel();
                this.receiveTimeoutAwaiter = undefined;
            }
            if (this.reconnectAwaiter) {
                this.reconnectAwaiter.cancel();
            }
            this.reconnectAwaiter = wait(RECONN_DELAY_MS);
            this.reconnectAwaiter.then(function () { return _this.connect(); });
        };
        IiwariWSClient.prototype.handleMessage = function (sender, message) {
            this.lastReceivedTimestamp = Date.now();
            console.log(message.text);
        };
        return IiwariWSClient;
    }(Script_1.Script));
    exports.IiwariWSClient = IiwariWSClient;
});
