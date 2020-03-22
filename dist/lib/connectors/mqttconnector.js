"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const net = require("net");
const constants = require("../util/constants");
const mqttsocket_1 = require("./mqttsocket");
const mqttadaptor_1 = require("./mqtt/mqttadaptor");
const generate = require("./mqtt/generate");
const pinus_logger_1 = require("pinus-logger");
const mqtt_connection = require("mqtt-connection");
const path = require("path");
let logger = pinus_logger_1.getLogger('pinus', path.basename(__filename));
let curId = 1;
/**
 * Connector that manager low level connection and protocol bewteen server and client.
 * Develper can provide their own connector to switch the low level prototol, such as tcp or probuf.
 */
class MQTTConnector extends events_1.EventEmitter {
    constructor(port, host, opts) {
        super();
        this.port = port;
        this.host = host;
        this.opts = opts || {};
        this.adaptor = new mqttadaptor_1.MqttAdaptor(this.opts);
    }
    /**
     * Start connector to listen the specified port
     */
    start(cb) {
        let self = this;
        this.server = new net.Server();
        this.server.listen(this.port);
        logger.info('[MQTTConnector] listen on %d', this.port);
        this.server.on('error', function (err) {
            // logger.error('mqtt server is error: %j', err.stack);
            self.emit('error', err);
        });
        this.server.on('connection', (stream) => {
            let client = mqtt_connection(stream);
            client.on('error', function (err) {
                client.destroy();
            });
            client.on('close', function () {
                client.destroy();
            });
            client.on('disconnect', function (packet) {
                client.destroy();
            });
            // stream timeout
            stream.on('timeout', function () { client.destroy(); });
            // client published
            client.on('publish', function (packet) {
                // send a puback with messageId (for QoS > 0)
                client.puback({ messageId: packet.messageId });
            });
            // client pinged
            client.on('pingreq', function () {
                // send a pingresp
                client.pingresp();
            });
            if (self.opts.disconnectOnTimeout) {
                let timeout = self.opts.timeout * 1000 || constants.TIME.DEFAULT_MQTT_HEARTBEAT_TIMEOUT;
                stream.setTimeout(timeout, function () {
                    client.destroy();
                    client.emit('close');
                });
            }
            client.on('connect', function (packet) {
                client.connack({ returnCode: 0 });
                let mqttsocket = new mqttsocket_1.MQTTSocket(curId++, client, self.adaptor);
                self.emit('connection', mqttsocket);
            });
        });
        process.nextTick(cb);
    }
    stop() {
        this.server.close();
        process.exit(0);
    }
    encode(reqId, route, msgBody) {
        if (!!reqId) {
            return composeResponse(reqId, route, msgBody);
        }
        else {
            return composePush(route, msgBody);
        }
    }
    close() {
        this.server.close();
    }
}
exports.MQTTConnector = MQTTConnector;
let composeResponse = function (msgId, route, msgBody) {
    return {
        id: msgId,
        body: msgBody
    };
};
let composePush = function (route, msgBody) {
    let msg = generate.publish(msgBody);
    if (!msg) {
        logger.error('invalid mqtt publish message: %j', msgBody);
    }
    return msg;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXF0dGNvbm5lY3Rvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL2xpYi9jb25uZWN0b3JzL21xdHRjb25uZWN0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQSxtQ0FBc0M7QUFDdEMsMkJBQTJCO0FBQzNCLCtDQUErQztBQUMvQyw2Q0FBMEM7QUFDMUMsb0RBQWlEO0FBQ2pELDRDQUE0QztBQUM1QywrQ0FBeUM7QUFFekMsbURBQW1EO0FBQ25ELDZCQUE2QjtBQUM3QixJQUFJLE1BQU0sR0FBRyx3QkFBUyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFTM0QsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO0FBQ2Q7OztHQUdHO0FBQ0gsTUFBYSxhQUFjLFNBQVEscUJBQVk7SUFPM0MsWUFBWSxJQUFZLEVBQUUsSUFBWSxFQUFFLElBQTRCO1FBQ2hFLEtBQUssRUFBRSxDQUFDO1FBQ1IsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBRXZCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSx5QkFBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsRUFBYztRQUNoQixJQUFJLElBQUksR0FBRyxJQUFJLENBQUM7UUFDaEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUMvQixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDOUIsTUFBTSxDQUFDLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFF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