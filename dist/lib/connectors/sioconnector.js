"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const http_1 = require("http");
let httpServer = http_1.createServer();
const siosocket_1 = require("./siosocket");
const socket_io = require("socket.io");
let PKG_ID_BYTES = 4;
let PKG_ROUTE_LENGTH_BYTES = 1;
let PKG_HEAD_BYTES = PKG_ID_BYTES + PKG_ROUTE_LENGTH_BYTES;
let curId = 1;
/**
 * Connector that manager low level connection and protocol bewteen server and client.
 * Develper can provide their own connector to switch the low level prototol, such as tcp or probuf.
 */
class SIOConnector extends events_1.EventEmitter {
    constructor(port, host, opts) {
        super();
        this.port = port;
        this.host = host;
        this.opts = opts;
        opts.pingTimeout = opts.pingTimeout || 60;
        opts.pingInterval = opts.pingInterval || 25;
    }
    /**
     * Start connector to listen the specified port
     */
    start(cb) {
        let self = this;
        // issue https://github.com/NetEase/pinus-cn/issues/174
        let opts;
        if (!!this.opts) {
            opts = this.opts;
        }
        else {
            opts = {
                transports: [
                    'websocket', 'polling-xhr', 'polling-jsonp', 'polling'
                ]
            };
        }
        opts.path = '/socket.io';
        let sio = socket_io(httpServer, opts);
        let port = this.port;
        httpServer.listen(port, function () {
            console.log('sio Server listening at port %d', port);
        });
        sio.on('connection', (socket) => {
            // this.wsocket.sockets.on('connection', function (socket) {
            let siosocket = new siosocket_1.SioSocket(curId++, socket);
            self.emit('connection', siosocket);
            siosocket.on('closing', function (reason) {
                siosocket.send({ route: 'onKick', reason: reason });
            });
        });
        process.nextTick(cb);
    }
    /**
     * Stop connector
     */
    stop(force, cb) {
        this.server.close();
        process.nextTick(cb);
    }
    encode(reqId, route, msg) {
        if (reqId) {
            return composeResponse(reqId, route, msg);
        }
        else {
            return composePush(route, msg);
        }
    }
    /**
     * Decode client message package.
     *
     * Package format:
     *   message id: 4bytes big-endian integer
     *   route length: 1byte
     *   route: route length bytes
     *   body: the rest bytes
     *
     * @param  {String} data socket.io package from client
     * @return {Object}      message object
     */
    decode(msg) {
        let index = 0;
        let id = parseIntField(msg, index, PKG_ID_BYTES);
        index += PKG_ID_BYTES;
        let routeLen = parseIntField(msg, index, PKG_ROUTE_LENGTH_BYTES);
        let route = msg.substr(PKG_HEAD_BYTES, routeLen);
        let body = msg.substr(PKG_HEAD_BYTES + routeLen);
        return {
            id: id,
            route: route,
            body: JSON.parse(body)
        };
    }
}
exports.SIOConnector = SIOConnector;
let composeResponse = function (msgId, route, msgBody) {
    return {
        id: msgId,
        body: msgBody
    };
};
let composePush = function (route, msgBody) {
    return JSON.stringify({ route: route, body: msgBody });
};
let parseIntField = function (str, offset, len) {
    let res = 0;
    for (let i = 0; i < len; i++) {
        if (i > 0) {
            res <<= 8;
        }
        res |= str.charCodeAt(offset + i) & 0xff;
    }
    return res;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lvY29ubmVjdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL2Nvbm5lY3RvcnMvc2lvY29ubmVjdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0EsbUNBQXNDO0FBQ3RDLCtCQUFvQztBQUNwQyxJQUFJLFVBQVUsR0FBRyxtQkFBWSxFQUFFLENBQUM7QUFDaEMsMkNBQXdDO0FBRXhDLHVDQUF1QztBQUV2QyxJQUFJLFlBQVksR0FBRyxDQUFDLENBQUM7QUFDckIsSUFBSSxzQkFBc0IsR0FBRyxDQUFDLENBQUM7QUFDL0IsSUFBSSxjQUFjLEdBQUcsWUFBWSxHQUFHLHNCQUFzQixDQUFDO0FBRTNELElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztBQXFGZDs7O0dBR0c7QUFDSCxNQUFhLFlBQWEsU0FBUSxxQkFBWTtJQU8xQyxZQUFZLElBQVksRUFBRSxJQUFZLEVBQUUsSUFBeUI7UUFDN0QsS0FBSyxFQUFFLENBQUM7UUFDUixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLElBQUksRUFBRSxDQUFDO1FBQzFDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksSUFBSSxFQUFFLENBQUM7SUFDaEQsQ0FBQztJQUlEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLEVBQWM7UUFDaEIsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2hCLHVEQUF1RDtRQUN2RCxJQUFJLElBQXlCLENBQUM7UUFDOUIsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRTtZQUNiLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1NBQ3BCO2FBQ0k7WUFDRCxJQUFJLEdBQUc7Z0JBQ0gsVUFBVSxFQUFF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