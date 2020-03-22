"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Implementation of server component.
 * Init and start server instance.
 */
const pinus_logger_1 = require("pinus-logger");
const path = require("path");
const pathUtil = require("../util/pathUtil");
const Loader = require("pinus-loader");
const pinus_loader_1 = require("pinus-loader");
const utils = require("../util/utils");
const schedule = require("pinus-scheduler");
const events_1 = require("../util/events");
const Constants = require("../util/constants");
const filterService_1 = require("../common/service/filterService");
const handlerService_1 = require("../common/service/handlerService");
const events_2 = require("events");
let logger = pinus_logger_1.getLogger('pinus', path.basename(__filename));
let ST_INITED = 0; // server inited
let ST_STARTED = 1; // server started
let ST_STOPED = 2; // server stoped
/**
 * Server factory function.
 *
 * @param {Object} app  current application context
 * @return {Object} erver instance
 */
function create(app, opts) {
    return new Server(app, opts);
}
exports.create = create;
class Server extends events_2.EventEmitter {
    constructor(app, opts) {
        super();
        this.globalFilterService = null;
        this.filterService = null;
        this.handlerService = null;
        this.cronHandlers = null;
        this.crons = [];
        this.jobs = {};
        this.state = ST_INITED;
        this.opts = opts || {};
        this.app = app;
        app.event.on(events_1.default.ADD_CRONS, this.addCrons.bind(this));
        app.event.on(events_1.default.REMOVE_CRONS, this.removeCrons.bind(this));
    }
    /**
     * Server lifecycle callback
     */
    start() {
        if (this.state > ST_INITED) {
            return;
        }
        this.globalFilterService = initFilter(true, this.app);
        this.filterService = initFilter(false, this.app);
        this.handlerService = initHandler(this.app, this.opts);
        this.loadCrons();
        this.state = ST_STARTED;
    }
    loadCrons(manualReload = false) {
        if (manualReload) {
            logger.info('loadCrons remove crons', this.crons);
            this.removeCrons(this.crons);
        }
        this.cronHandlers = loadCronHandlers(this.app, manualReload);
        loadCrons(this, this.app, manualReload);
        if (manualReload) {
            scheduleCrons(this, this.crons);
        }
    }
    afterStart() {
        scheduleCrons(this, this.crons);
    }
    /**
     * Stop server
     */
    stop() {
        this.state = ST_STOPED;
    }
    /**
     * Global handler.
     *
     * @param  {Object} msg request message
     * @param  {Object} session session object
     * @param  {Callback} callback function
     */
    globalHandle(msg, session, cb) {
        if (this.state !== ST_STARTED) {
            utils.invokeCallback(cb, new Error('server not started'));
            return;
        }
        let routeRecord = parseRoute(msg.route);
        if (!routeRecord) {
            utils.invokeCallback(cb, new Error(`meet unknown route message ${msg.route}`));
            return;
        }
        if (routeRecord.method === 'constructor') {
            logger.warn('attack session:', session, msg);
            this.app.sessionService.kickBySessionId(session.id, 'attack');
            return;
        }
        let self = this;
        let dispatch = function (err, resp) {
            if (err) {
                handleError(true, self, err, msg, session, resp, function (err, resp) {
                    response(true, self, err, routeRecord, msg, session, resp, cb);
                });
                return;
            }
            if (self.app.getServerType() !== routeRecord.serverType) {
                doForward(self.app, msg, session, routeRecord, function (err, resp) {
                    response(true, self, err, routeRecord, msg, session, resp, cb);
                });
            }
            else {
                doHandle(self, msg, session, routeRecord, function (err, resp) {
                    response(true, self, err, routeRecord, msg, session, resp, cb);
                });
            }
        };
        beforeFilter(true, self, routeRecord, msg, session, dispatch);
    }
    /**
     * Handle request
     */
    handle(msg, session, cb) {
        if (this.state !== ST_STARTED) {
            cb(new Error('server not started'));
            return;
        }
        let routeRecord = parseRoute(msg.route);
        doHandle(this, msg, session, routeRecord, cb);
    }
    /**
     * Add crons at runtime.
     *
     * @param {Array} crons would be added in application
     */
    addCrons(crons) {
        this.cronHandlers = loadCronHandlers(this.app);
        for (let i = 0, l = crons.length; i < l; i++) {
            let cron = crons[i];
            checkAndAdd(cron, this.crons, this);
        }
        scheduleCrons(this, crons);
    }
    /**
     * Remove crons at runtime.
     *
     * @param {Array} crons would be removed in application
     */
    removeCrons(crons) {
        for (let i = 0, l = crons.length; i < l; i++) {
            let cron = crons[i];
            let id = cron.id;
            if (!!this.jobs[id]) {
                schedule.cancelJob(this.jobs[id]);
                delete this.jobs[id];
            }
            else {
                logger.warn('cron is not in application: %j', cron);
            }
        }
    }
}
exports.Server = Server;
// 重置 crons 缓存，  手动添加的crons只会取消任务重新加载任务。
function manualReloadCrons(app) {
    if (!app.components.__server__) {
        return;
    }
    logger.info('manualReloadCrons start');
    app.components.__server__.server.loadCrons(true);
    logger.info('manualReloadCrons finish');
}
exports.manualReloadCrons = manualReloadCrons;
let initFilter = function (isGlobal, app) {
    let service = new filterService_1.FilterService();
    let befores, afters;
    if (isGlobal) {
        befores = app.get(Constants.KEYWORDS.GLOBAL_BEFORE_FILTER);
        afters = app.get(Constants.KEYWORDS.GLOBAL_AFTER_FILTER);
    }
    else {
        befores = app.get(Constants.KEYWORDS.BEFORE_FILTER);
        afters = app.get(Constants.KEYWORDS.AFTER_FILTER);
    }
    let i, l;
    if (befores) {
        for (i = 0, l = befores.length; i < l; i++) {
            service.before(befores[i]);
        }
    }
    if (afters) {
        for (i = 0, l = afters.length; i < l; i++) {
            service.after(afters[i]);
        }
    }
    return service;
};
let initHandler = function (app, opts) {
    return new handlerService_1.HandlerService(app, opts);
};
/**
 * Load cron handlers from current application
 */
let loadCronHandlers = function (app, manualReload = false) {
    let all = {};
    let p = pathUtil.getCronPath(app.getBase(), app.getServerType());
    if (p) {
        let crons = Loader.load(p, app, manualReload, true, pinus_loader_1.LoaderPathType.PINUS_CRONNER);
        for (let name in crons) {
            all[name] = crons[name];
        }
    }
    for (let plugin of app.usedPlugins) {
        if (plugin.cronPath) {
            if (!_checkCanRequire(plugin.cronPath)) {
                logger.error(`插件[${plugin.name}的cronPath[${plugin.cronPath}不存在。]]`);
                continue;
            }
            let crons = Loader.load(plugin.cronPath, app, manualReload, true, pinus_loader_1.LoaderPathType.PINUS_CRONNER);
            for (let name in crons) {
                all[name] = crons[name];
            }
        }
    }
    return all;
};
const clearRequireCache = function (path) {
    const moduleObj = require.cache[path];
    if (!moduleObj) {
        return;
    }
    if (moduleObj.parent) {
        moduleObj.parent.children.splice(moduleObj.parent.children.indexOf(moduleObj), 1);
    }
    delete require.cache[path];
};
function _checkCanRequire(path, manualReload = false) {
    try {
        path = require.resolve(path);
        if (manualReload) {
            clearRequireCache(path);
        }
    }
    catch (err) {
        return null;
    }
    return path;
}
/**
 * Load crons from configure file
 */
let loadCrons = function (server, app, manualReload = false) {
    let env = app.get(Constants.RESERVED.ENV);
    let p = path.join(app.getBase(), Constants.FILEPATH.CRON);
    if (!_checkCanRequire(p, manualReload)) {
        p = path.join(app.getBase(), Constants.FILEPATH.CONFIG_DIR, env, path.basename(Constants.FILEPATH.CRON));
        if (!_checkCanRequire(p, manualReload)) {
            return;
        }
    }
    app.loadConfigBaseApp(Constants.RESERVED.CRONS, Constants.FILEPATH.CRON);
    let crons = app.get(Constants.RESERVED.CRONS);
    for (let serverType in crons) {
        if (app.serverType === serverType) {
            let list = crons[serverType];
            for (let i = 0; i < list.length; i++) {
                if (!list[i].serverId) {
                    checkAndAdd(list[i], server.crons, server, manualReload);
                }
                else {
                    if (app.serverId === list[i].serverId) {
                        checkAndAdd(list[i], server.crons, server, manualReload);
                    }
                }
            }
        }
    }
};
/**
 * Fire before filter chain if any
 */
let beforeFilter = function (isGlobal, server, routeRecord, msg, session, cb) {
    let fm;
    if (isGlobal) {
        fm = server.globalFilterService;
    }
    else {
        fm = server.filterService;
    }
    if (fm) {
        fm.beforeFilter(routeRecord, msg, session, cb);
    }
    else {
        utils.invokeCallback(cb);
    }
};
/**
 * Fire after filter chain if have
 */
let afterFilter = function (isGlobal, server, err, routeRecord, msg, session, resp, cb) {
    let fm;
    if (isGlobal) {
        fm = server.globalFilterService;
    }
    else {
        fm = server.filterService;
    }
    if (fm) {
        if (isGlobal) {
            fm.afterFilter(err, routeRecord, msg, session, resp, function () {
                // do nothing
            });
        }
        else {
            fm.afterFilter(err, routeRecord, msg, session, resp, function (err) {
                cb(err, resp);
            });
        }
    }
};
/**
 * pass err to the global error handler if specified
 */
let handleError = function (isGlobal, server, err, msg, session, resp, cb) {
    let handler;
    if (isGlobal) {
        handler = server.app.get(Constants.RESERVED.GLOBAL_ERROR_HANDLER);
    }
    else {
        handler = server.app.get(Constants.RESERVED.ERROR_HANDLER);
    }
    if (!handler) {
        logger.error(`${server.app.serverId} no default error handler msg[${JSON.stringify(msg)}] to resolve unknown exception: sessionId:${JSON.stringify(session.export())} , error stack: ${err.stack}`);
        utils.invokeCallback(cb, err, resp);
    }
    else {
        if (handler.length === 5) {
            handler(err, msg, resp, session, cb);
        }
        else {
            handler(err, msg, resp, session, cb);
        }
    }
};
/**
 * Send response to client and fire after filter chain if any.
 */
let response = function (isGlobal, server, err, routeRecord, msg, session, resp, cb) {
    if (isGlobal) {
        cb(err, resp);
        // after filter should not interfere response
        afterFilter(isGlobal, server, err, routeRecord, msg, session, resp, cb);
    }
    else {
        afterFilter(isGlobal, server, err, routeRecord, msg, session, resp, cb);
    }
};
/**
 * Parse route string.
 *
 * @param  {String} route route string, such as: serverName.handlerName.methodName
 * @return {Object}       parse result object or null for illeagle route string
 */
let parseRoute = function (route) {
    if (!route) {
        return null;
    }
    let ts = route.split('.');
    if (ts.length !== 3) {
        return null;
    }
    return {
        route: route,
        serverType: ts[0],
        handler: ts[1],
        method: ts[2]
    };
};
let doForward = function (app, msg, session, routeRecord, cb) {
    let finished = false;
    // should route to other servers
    try {
        app.sysrpc[routeRecord.serverType].msgRemote.forwardMessage(
        // app.sysrpc[routeRecord.serverType].msgRemote.forwardMessage2(
        session, msg, 
        // msg.oldRoute || msg.route,
        // msg.body,
        // msg.aesPassword,
        // msg.compressGzip,
        session.export()).then(function (resp) {
            finished = true;
            utils.invokeCallback(cb, null, resp);
        }).catch(function (err) {
            logger.error(app.serverId + ' fail to process remote message:' + err.stack);
            utils.invokeCallback(cb, err);
        });
    }
    catch (err) {
        if (!finished) {
            logger.error(app.serverId + ' fail to forward message:' + err.stack);
            utils.invokeCallback(cb, err);
        }
    }
};
let doHandle = function (server, msg, session, routeRecord, cb) {
    msg = msg.body || {};
    let self = server;
    let handle = function (err, resp) {
        if (err) {
            // error from before filter
            handleError(false, self, err, msg, session, resp, function (err, resp) {
                response(false, self, err, routeRecord, msg, session, resp, cb);
            });
            return;
        }
        self.handlerService.handle(routeRecord, msg, session, function (err, resp) {
            if (err) {
                // error from handler
                handleError(false, self, err, msg, session, resp, function (err, resp) {
                    response(false, self, err, routeRecord, msg, session, resp, cb);
                });
                return;
            }
            response(false, self, err, routeRecord, msg, session, resp, cb);
        });
    }; // end of handle
    beforeFilter(false, server, routeRecord, msg, session, handle);
};
/**
 * Schedule crons
 */
let scheduleCrons = function (server, crons) {
    let handlers = server.cronHandlers;
    for (let i = 0; i < crons.length; i++) {
        let cronInfo = crons[i];
        let time = cronInfo.time;
        let action = cronInfo.action;
        let jobId = cronInfo.id;
        if (!time || !action || !jobId) {
            logger.error(server.app.serverId + ' cron miss necessary parameters: %j', cronInfo);
            continue;
        }
        if (action.indexOf('.') < 0) {
            logger.error(server.app.serverId + ' cron action is error format: %j', cronInfo);
            continue;
        }
        let cron = action.split('.')[0];
        let job = action.split('.')[1];
        let handler = handlers[cron];
        if (!handler) {
            logger.error('could not find cron: %j', cronInfo);
            continue;
        }
        if (typeof handler[job] !== 'function') {
            logger.error('could not find cron job: %j, %s', cronInfo, job);
            continue;
        }
        let id = schedule.scheduleJob(time, handler[job].bind(handler));
        server.jobs[jobId] = id;
    }
};
/**
 * If cron is not in crons then put it in the array.
 */
let checkAndAdd = function (cron, crons, server, replace = false) {
    const orgCron = containCron(cron.id, crons);
    if (!orgCron) {
        server.crons.push(cron);
    }
    else {
        logger.warn('cron is duplicated: %j', cron);
        if (replace) {
            logger.warn('replace time and action org:%j, new:%j', orgCron, cron);
            orgCron.time = cron.time;
            orgCron.action = cron.action;
        }
    }
};
/**
 * Check if cron is in crons.
 */
let containCron = function (id, crons) {
    for (let i = 0, l = crons.length; i < l; i++) {
        if (id === crons[i].id) {
            return crons[i];
        }
    }
    return null;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL3NlcnZlci9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7O0dBR0c7QUFDSCwrQ0FBeUM7QUFDekMsNkJBQTZCO0FBQzdCLDZDQUE2QztBQUM3Qyx1Q0FBdUM7QUFDdkMsK0NBQThDO0FBQzlDLHVDQUF1QztBQUN2Qyw0Q0FBNEM7QUFDNUMsMkNBQW1EO0FBQ25ELCtDQUErQztBQUUvQyxtRUFBZ0U7QUFDaEUscUVBQTBHO0FBRTFHLG1DQUFzQztBQUd0QyxJQUFJLE1BQU0sR0FBRyx3QkFBUyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFHM0QsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUksZ0JBQWdCO0FBQ3RDLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFHLGlCQUFpQjtBQUN2QyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBSSxnQkFBZ0I7QUFjdEM7Ozs7O0dBS0c7QUFDSCxTQUFnQixNQUFNLENBQUMsR0FBZ0IsRUFBRSxJQUFtQjtJQUN4RCxPQUFPLElBQUksTUFBTSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBRkQsd0JBRUM7QUFFRCxNQUFhLE1BQU8sU0FBUSxxQkFBWTtJQVlwQyxZQUFZLEdBQWdCLEVBQUUsSUFBb0I7UUFDOUMsS0FBSyxFQUFFLENBQUM7UUFUWix3QkFBbUIsR0FBa0IsSUFBSSxDQUFDO1FBQzFDLGtCQUFhLEdBQWtCLElBQUksQ0FBQztRQUNwQyxtQkFBYyxHQUFtQixJQUFJLENBQUM7UUFDdEMsaUJBQVksR0FBNEQsSUFBSSxDQUFDO1FBQzdFLFVBQUssR0FBVyxFQUFFLENBQUM7UUFDbkIsU0FBSSxHQUFpQyxFQUFFLENBQUM7UUFDeEMsVUFBSyxHQUFHLFNBQVMsQ0FBQztRQUlkLElBQUksQ0FB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