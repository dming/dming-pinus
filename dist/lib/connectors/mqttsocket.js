"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
let ST_INITED = 1;
let ST_CLOSED = 2;
/**
 * Socket class that wraps socket and websocket to provide unified interface for up level.
 */
class MQTTSocket extends events_1.EventEmitter {
    constructor(id, socket, adaptor) {
        super();
        this.sendRaw = this.send;
        this.id = id;
        this.socket = socket;
        this.remoteAddress = {
            ip: socket.stream.remoteAddress,
            port: socket.stream.remotePort
        };
        this.adaptor = adaptor;
        let self = this;
        socket.on('close', this.emit.bind(this, 'disconnect'));
        socket.on('error', this.emit.bind(this, 'disconnect'));
        socket.on('disconnect', this.emit.bind(this, 'disconnect'));
        socket.on('pingreq', function (packet) {
            socket.pingresp();
        });
        socket.on('subscribe', this.adaptor.onSubscribe.bind(this.adaptor, this));
        socket.on('publish', this.adaptor.onPublish.bind(this.adaptor, this));
        this.state = ST_INITED;
        // TODO: any other events?
    }
    send(msg) {
        if (this.state !== ST_INITED) {
            return;
        }
        if (msg instanceof Buffer) {
            // if encoded, send directly
            this.socket.stream.write(msg);
        }
        else {
            this.adaptor.publish(this, msg);
        }
    }
    sendBatch(msgs) {
        for (let i = 0, l = msgs.length; i < l; i++) {
            this.send(msgs[i]);
        }
    }
    disconnect() {
        if (this.state === ST_CLOSED) {
            return;
        }
        this.state = ST_CLOSED;
        this.socket.stream.destroy();
    }
}
exports.MQTTSocket = MQTTSocket;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXF0dHNvY2tldC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL2xpYi9jb25uZWN0b3JzL21xdHRzb2NrZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQSxtQ0FBc0M7QUFLdEMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQ2xCLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUVsQjs7R0FFRztBQUNILE1BQWEsVUFBVyxTQUFRLHFCQUFZO0lBUXhDLFlBQVksRUFBVSxFQUFFLE1BQXVCLEVBQUUsT0FBb0I7UUFDakUsS0FBSyxFQUFFLENBQUM7UUF5Q1osWUFBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7UUF4Q2hCLElBQUksQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDO1FBQ2IsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLGFBQWEsR0FBRztZQUNqQixFQUFFLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxhQUFhO1lBQy9CLElBQUksRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVU7U0FDakMsQ0FBQztRQUNGLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBRXZCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztRQUVoQixNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUN2RCxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUN2RCxNQUFNLENBQUMsRUFBRSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUU1RCxNQUFNLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxVQUFVLE1BQVc7WUFDdEMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUUxRSxNQUFNLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBRXRFLElBQUksQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDO1FBRXZCLDBCQUEwQjtJQUM5QixDQUFDO0lBR0QsSUFBSSxDQUFDLEdBQVE7UUFDVCxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssU0FBUyxFQUFFO1lBQzFCLE9BQU87U0FDVjtRQUNELElBQUksR0FBRyxZQUFZLE1BQU0sRUFBRTtZQUN2Qiw0QkFBNEI7WUFDNUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ2pDO2FBQU07WUFDSCxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7U0FDbkM7SUFDTCxDQUFDO0lBSUQsU0FBUyxDQUFDLElBQVc7UUFDakIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUN6QyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ3RCO0lBQ0wsQ0FBQztJQUVELFVBQVU7UUFDTixJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssU0FBUyxFQUFFO1lBQzFCLE9BQU87U0FDVjtRQUVELElBQUksQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pDLENBQUM7Q0FDSjtBQWxFRCxnQ0FrRUMifQ==