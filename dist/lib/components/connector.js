"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pinus_logger_1 = require("pinus-logger");
const taskManager = require("../common/manager/taskManager");
const pinus_1 = require("../pinus");
let rsa = require('node-bignumber');
const events_1 = require("../util/events");
const utils = require("../util/utils");
const sioconnector_1 = require("../connectors/sioconnector");
const path = require("path");
let logger = pinus_logger_1.getLogger('pinus', path.basename(__filename));
/**
 * Connector component. Receive client requests and attach session with socket.
 *
 * @param {Object} app  current application context
 * @param {Object} opts attach parameters
 *                      opts.connector {Object} provides low level network and protocol details implementation between server and clients.
 */
class ConnectorComponent {
    constructor(app, opts) {
        this.keys = {};
        this.blacklist = [];
        this.name = '__connector__';
        opts = opts || {};
        this.app = app;
        this.connector = getConnector(app, opts);
        this.encode = opts.encode;
        this.decode = opts.decode;
        this.useCrypto = opts.useCrypto;
        this.useHostFilter = opts.useHostFilter;
        this.useAsyncCoder = opts.useAsyncCoder;
        this.blacklistFun = opts.blacklistFun;
        this.forwardMsg = opts.forwardMsg;
        if (opts.useDict) {
            app.load(pinus_1.pinus.components.dictionary, app.get('dictionaryConfig'));
        }
        if (opts.useProtobuf) {
            app.load(pinus_1.pinus.components.protobuf, app.get('protobufConfig'));
        }
        // component dependencies
        this.server = null;
        this.session = null;
    }
    start(cb) {
        this.server = this.app.components.__server__;
        this.session = this.app.components.__session__;
        this.connection = this.app.components.__connection__;
        // check component dependencies
        if (!this.server) {
            process.nextTick(function () {
                utils.invokeCallback(cb, new Error('fail to start connector component for no server component loaded'));
            });
            return;
        }
        if (!this.session) {
            process.nextTick(function () {
                utils.invokeCallback(cb, new Error('fail to start connector component for no session component loaded'));
            });
            return;
        }
        process.nextTick(cb);
    }
    afterStart(cb) {
        this.connector.start(cb);
        this.connector.on('connection', this.hostFilter.bind(this, this.bindEvents.bind(this)));
    }
    stop(force, cb) {
        if (this.connector) {
            this.connector.stop(force, cb);
            this.connector = null;
            return;
        }
        else {
            process.nextTick(cb);
        }
    }
    send(reqId, route, msg, recvs, opts, cb) {
        logger.debug('[%s] send message reqId: %s, route: %s, msg: %j, receivers: %j, opts: %j', this.app.serverId, reqId, route, msg, recvs, opts);
        // if (this.useAsyncCoder) {
        //     return this.sendAsync(reqId, route, msg, recvs, opts, cb);
        // }
        let emsg = msg;
        if (this.encode) {
            // use costumized encode
            emsg = this.encode.call(this, reqId, route, msg);
        }
        else if (this.connector.encode) {
            // use connector default encode
            emsg = this.connector.encode(reqId, route, msg);
        }
        this.doSend(reqId, route, emsg, recvs, opts, cb);
    }
    sendAsync(reqId, route, msg, recvs, opts, cb) {
        let emsg = msg;
        let self = this;
        /*
        if (this.encode)
        {
            // use costumized encode
            this.encode(reqId, route, msg, function (err, encodeMsg)
            {
                if (err)
                {
                    return cb(err);
                }

                emsg = encodeMsg;
                self.doSend(reqId, route, emsg, recvs, opts, cb);
            });
        } else if (this.connector.encode)
        {
            // use connector default encode
            this.connector.encode(reqId, route, msg, function (err, encodeMsg)
            {
                if (err)
                {
                    return cb(err);
                }

                emsg = encodeMsg;
                self.doSend(reqId, route, emsg, recvs, opts, cb);
            });
        }*/
        throw new Error('not implement sendAsync');
    }
    doSend(reqId, route, emsg, recvs, opts, cb) {
        if (!emsg) {
            process.nextTick(function () {
                return cb && cb(new Error('fail to send message for encode result is empty.'));
            });
        }
        this.app.components.__pushScheduler__.schedule(reqId, route, emsg, recvs, opts, cb);
    }
    setPubKey(id, key) {
        let pubKey = new rsa.Key();
        pubKey.n = new rsa.BigInteger(key.rsa_n, 16);
        pubKey.e = key.rsa_e;
        this.keys[id] = pubKey;
    }
    getPubKey(id) {
        return this.keys[id];
    }
    hostFilter(cb, socket) {
        if (!this.useHostFilter) {
            return cb(socket);
        }
        let ip = socket.remoteAddress.ip;
        let check = function (list) {
            for (let address in list) {
                let exp = new RegExp(list[address]);
                if (exp.test(ip)) {
                    socket.disconnect();
                    return true;
                }
            }
            return false;
        };
        // dynamical check
        if (this.blacklist.length !== 0 && !!check(this.blacklist)) {
            return;
        }
        // static check
        if (!!this.blacklistFun && typeof this.blacklistFun === 'function') {
            let self = this;
            self.blacklistFun((err, list) => {
                if (!!err) {
                    logger.error('connector blacklist error: %j', err.stack);
                    utils.invokeCallback(cb, socket);
                    return;
                }
                if (!Array.isArray(list)) {
                    logger.error('connector blacklist is not array: %j', list);
                    utils.invokeCallback(cb, socket);
                    return;
                }
                if (!!check(list)) {
                    return;
                }
                else {
                    utils.invokeCallback(cb, socket);
                    return;
                }
            });
        }
        else {
            utils.invokeCallback(cb, socket);
        }
    }
    bindEvents(socket) {
        let curServer = this.app.getCurServer();
        let maxConnections = curServer['max-connections'];
        if (this.connection && maxConnections) {
            this.connection.increaseConnectionCount();
            let statisticInfo = this.connection.getStatisticsInfo();
            if (statisticInfo.totalConnCount > maxConnections) {
                logger.warn('the server %s has reached the max connections %s', curServer.id, maxConnections);
                socket.disconnect();
                return;
            }
        }
        // create session for connection
        let session = this.getSession(socket);
        let closed = false;
        socket.on('disconnect', () => {
            if (closed) {
                return;
            }
            closed = true;
            if (this.connection) {
                this.connection.decreaseConnectionCount(session.uid);
            }
        });
        socket.on('error', () => {
            if (closed) {
                return;
            }
            closed = true;
            if (this.connection) {
                this.connection.decreaseConnectionCount(session.uid);
            }
        });
        // new message
        socket.on('message', (msg) => {
            let dmsg = msg;
            // if (this.useAsyncCoder) {
            //     return this.handleMessageAsync(msg, session, socket);
            // }
            if (this.decode) {
                dmsg = this.decode(msg);
            }
            else if (this.connector.decode) {
                dmsg = this.connector.decode(msg);
            }
            if (!dmsg) {
                // discard invalid message
                return;
            }
            // use rsa crypto
            if (this.useCrypto) {
                let verified = this.verifyMessage(session, dmsg);
                if (!verified) {
                    logger.error('fail to verify the data received from client.');
                    return;
                }
            }
            this.handleMessage(session, dmsg);
        }); // on message end
    }
    handleMessageAsync(msg, session, socket) {
        /*
        if (this.decode)
        {
            this.decode(msg, session, function (err, dmsg)
            {
                if (err)
                {
                    logger.error('fail to decode message from client %s .', err.stack);
                    return;
                }

                doHandleMessage(this, dmsg, session);
            });
        } else if (this.connector.decode)
        {
            this.connector.decode(msg, socket, function (err, dmsg)
            {
                if (err)
                {
                    logger.error('fail to decode message from client %s .', err.stack);
                    return;
                }

                doHandleMessage(this, dmsg, session);
            });
        }*/
        throw new Error('not implement handleMessageAsync');
    }
    doHandleMessage(dmsg, session) {
        if (!dmsg) {
            // discard invalid message
            return;
        }
        // use rsa crypto
        if (this.useCrypto) {
            let verified = this.verifyMessage(session, dmsg);
            if (!verified) {
                logger.error('fail to verify the data received from client.');
                return;
            }
        }
        this.handleMessage(session, dmsg);
    }
    /**
     * get session for current connection
     */
    getSession(socket) {
        let app = this.app, sid = socket.id;
        let session = this.session.get(sid);
        if (session) {
            return session;
        }
        session = this.session.create(sid, app.getServerId(), socket);
        logger.debug('[%s] getSession session is created with session id: %s', app.getServerId(), sid);
        // bind events for session
        socket.on('disconnect', session.closed.bind(session));
        socket.on('error', session.closed.bind(session));
        session.on('closed', this.onSessionClose.bind(this, app));
        session.on('bind', (uid) => {
            logger.debug('session on [%s] bind with uid: %s', this.app.serverId, uid);
            // update connection statistics if necessary
            if (this.connection) {
                this.connection.addLoginedUser(uid, {
                    loginTime: Date.now(),
                    uid: uid,
                    address: socket.remoteAddress.ip + ':' + socket.remoteAddress.port
                });
            }
            this.app.event.emit(events_1.default.BIND_SESSION, session);
        });
        session.on('unbind', (uid) => {
            if (this.connection) {
                this.connection.removeLoginedUser(uid);
            }
            this.app.event.emit(events_1.default.UNBIND_SESSION, session);
        });
        return session;
    }
    onSessionClose(app, session, reason) {
        taskManager.closeQueue(session.id, true);
        app.event.emit(events_1.default.CLOSE_SESSION, session);
    }
    handleMessage(session, msg) {
        // logger.debug('[%s] handleMessage session id: %s, msg: %j', this.app.serverId, session.id, msg);
        let type = this.checkServerType(msg.route);
        if (!type) {
            logger.error('invalid route string. route : %j', msg.route);
            return;
        }
        // only stop forwarding message when forwardMsg === false;
        if (this.forwardMsg === false && type !== this.app.getServerType()) {
            logger.warn('illegal route. forwardMsg=false route=', msg.route, 'sessionid=', session.id);
            // kick client requests for illegal route request.
            this.session.kickBySessionId(session.id);
            return;
        }
        this.server.globalHandle(msg, session.toFrontendSession(), (err, resp) => {
            if (resp && !msg.id) {
                logger.warn('try to response to a notify: %j', msg.route);
                return;
            }
            if (!msg.id && !resp)
                return;
            if (!resp)
                resp = {};
            if (!!err && !resp.code) {
                resp.code = 500;
            }
            let opts = {
                type: 'response'
            };
            this.send(msg.id, msg.route, resp, [session.id], opts, function () {
            });
        });
    }
    /**
     * Get server type form request message.
     */
    checkServerType(route) {
        if (!route) {
            return null;
        }
        let idx = route.indexOf('.');
        if (idx < 0) {
            return null;
        }
        return route.substring(0, idx);
    }
    verifyMessage(session, msg) {
        let sig = msg.body.__crypto__;
        if (!sig) {
            logger.error('receive data from client has no signature [%s]', this.app.serverId);
            return false;
        }
        let pubKey;
        if (!session) {
            logger.error('could not find session.');
            return false;
        }
        if (!session.get('pubKey')) {
            pubKey = this.getPubKey(session.id);
            if (!!pubKey) {
                delete this.keys[session.id];
                session.set('pubKey', pubKey);
            }
            else {
                logger.error('could not get public key, session id is %s', session.id);
                return false;
            }
        }
        else {
            pubKey = session.get('pubKey');
        }
        if (!pubKey.n || !pubKey.e) {
            logger.error('could not verify message without public key [%s]', this.app.serverId);
            return false;
        }
        delete msg.body.__crypto__;
        let message = JSON.stringify(msg.body);
        if (utils.hasChineseChar(message))
            message = utils.unicodeToUtf8(message);
        return pubKey.verifyString(message, sig);
    }
}
exports.ConnectorComponent = ConnectorComponent;
let getConnector = function (app, opts) {
    let connector = opts.connector;
    if (!connector) {
        return getDefaultConnector(app, opts);
    }
    if (typeof connector !== 'function') {
        return connector;
    }
    let curServer = app.getCurServer();
    return new connector(curServer.clientPort, curServer.host, opts);
};
let getDefaultConnector = function (app, opts) {
    let curServer = app.getCurServer();
    return new sioconnector_1.SIOConnector(curServer.clientPort, curServer.host, opts);
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29ubmVjdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL2NvbXBvbmVudHMvY29ubmVjdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsK0NBQXVDO0FBQ3ZDLDZEQUE2RDtBQUM3RCxvQ0FBK0I7QUFFL0IsSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUM7QUFDcEMsMkNBQWlEO0FBQ2pELHVDQUF1QztBQUt2Qyw2REFBNkU7QUFVN0UsNkJBQTZCO0FBRTdCLElBQUksTUFBTSxHQUFHLHdCQUFTLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztBQXNCM0Q7Ozs7OztHQU1HO0FBRUgsTUFBYSxrQkFBa0I7SUFpQjNCLFlBQVksR0FBZ0IsRUFBRSxJQUFnQztRQUw5RCxTQUFJLEdBQTZCLEVBQUUsQ0FBQztRQUNwQyxjQUFTLEdBQWEsRUFBRSxDQUFDO1FBNkJ6QixTQUFJLEdBQUcsZUFBZSxDQUFDO1FBeEJuQixJQUFJLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUNsQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxTQUFTLEdBQUcsWUFBWSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDMUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1FBQzFCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUNoQyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUM7UUFDeEMsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO1FBQ3hDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQztR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