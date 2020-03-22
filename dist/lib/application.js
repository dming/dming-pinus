"use strict";
/*!
 * Pinus -- proto
 * Copyright(c) 2012 xiechengchao <xiecc@163.com>
 * MIT Licensed
 */
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Module dependencies.
 */
const utils = require("./util/utils");
const pinus_logger_1 = require("pinus-logger");
const events_1 = require("events");
const events_2 = require("./util/events");
const appUtil = require("./util/appUtil");
const Constants = require("./util/constants");
const appManager = require("./common/manager/appManager");
const fs = require("fs");
const path = require("path");
const util_1 = require("util");
let logger = pinus_logger_1.getLogger('pinus', path.basename(__filename));
/**
 * Application states
 */
let STATE_INITED = 1; // app has inited
let STATE_BEFORE_START = 2; // app before start
let STATE_START = 3; // app start
let STATE_STARTED = 4; // app has started
let STATE_STOPED = 5; // app has stoped
class Application {
    constructor() {
        this.loaded = []; // loaded component list
        this.components = {}; // name -> component map
        this.settings = {}; // collection keep set/get
        this.event = new events_1.EventEmitter(); // event object to sub/pub events
        // global server infos
        this.master = null; // master server info
        this.servers = {}; // current global server info maps, id -> info
        this.serverTypeMaps = {}; // current global type maps, type -> [info]
        this.serverTypes = []; // current global server type list
        this.usedPlugins = []; // current server custom lifecycle callbacks
        this.clusterSeq = {}; // cluster id seqence
        this.astart = utils.promisify(this.start);
        this.aconfigure = utils.promisify(this.configure);
    }
    /**
     * Initialize the server.
     *
     *   - setup default configuration
     */
    init(opts) {
        opts = opts || {};
        let base = opts.base || path.dirname(require.main.filename);
        this.set(Constants.RESERVED.BASE, base);
        this.base = base;
        appUtil.defaultConfiguration(this);
        this.state = STATE_INITED;
        logger.info('application inited: %j', this.getServerId());
    }
    /**
     * Get application base path
     *
     *  // cwd: /home/game/
     *  pinus start
     *  // app.getBase() -> /home/game
     *
     * @return {String} application base path
     *
     * @memberOf Application
     */
    getBase() {
        return this.get(Constants.RESERVED.BASE);
    }
    /**
     * Override require method in application
     *
     * @param {String} relative path of file
     *
     * @memberOf Application
     */
    require(ph) {
        return require(path.join(this.getBase(), ph));
    }
    /**
     * Configure logger with {$base}/config/log4js.json
     *
     * @param {Object} logger pinus-logger instance without configuration
     *
     * @memberOf Application
     */
    configureLogger(logger) {
        if (process.env.POMELO_LOGGER !== 'off') {
            let serverId = this.getServerId();
            let base = this.getBase();
            let env = this.get(Constants.RESERVED.ENV);
            let originPath = path.join(base, Constants.FILEPATH.LOG);
            let presentPath = path.join(base, Constants.FILEPATH.CONFIG_DIR, env, path.basename(Constants.FILEPATH.LOG));
            if (this._checkCanRequire(originPath)) {
                logger.configure(originPath, { serverId: serverId, base: base });
            }
            else if (this._checkCanRequire(presentPath)) {
                logger.configure(presentPath, { serverId: serverId, base: base });
            }
            else {
                console.error('logger file path configuration is error.');
            }
        }
    }
    /**
     * add a filter to before and after filter
     *
     * @param {Object} filter provide before and after filter method.
     *                        A filter should have two methods: before and after.
     * @memberOf Application
     */
    filter(filter) {
        this.before(filter);
        this.after(filter);
    }
    /**
     * Add before filter.
     *
     * @param {Object|Function} bf before fileter, bf(msg, session, next)
     * @memberOf Application
     */
    before(bf) {
        addFilter(this, Constants.KEYWORDS.BEFORE_FILTER, bf);
    }
    /**
     * Add after filter.
     *
     * @param {Object|Function} af after filter, `af(err, msg, session, resp, next)`
     * @memberOf Application
     */
    after(af) {
        addFilter(this, Constants.KEYWORDS.AFTER_FILTER, af);
    }
    /**
     * add a global filter to before and after global filter
     *
     * @param {Object} filter provide before and after filter method.
     *                        A filter should have two methods: before and after.
     * @memberOf Application
     */
    globalFilter(filter) {
        this.globalBefore(filter);
        this.globalAfter(filter);
    }
    /**
     * Add global before filter.
     *
     * @param {Object|Function} bf before fileter, bf(msg, session, next)
     * @memberOf Application
     */
    globalBefore(bf) {
        addFilter(this, Constants.KEYWORDS.GLOBAL_BEFORE_FILTER, bf);
    }
    /**
     * Add global after filter.
     *
     * @param {Object|Function} af after filter, `af(err, msg, session, resp, next)`
     * @memberOf Application
     */
    globalAfter(af) {
        addFilter(this, Constants.KEYWORDS.GLOBAL_AFTER_FILTER, af);
    }
    /**
     * Add rpc before filter.
     *
     * @param {Object|Function} bf before fileter, bf(serverId, msg, opts, next)
     * @memberOf Application
     */
    rpcBefore(bf) {
        addFilter(this, Constants.KEYWORDS.RPC_BEFORE_FILTER, bf);
    }
    /**
     * Add rpc after filter.
     *
     * @param {Object|Function} af after filter, `af(serverId, msg, opts, next)`
     * @memberOf Application
     */
    rpcAfter(af) {
        addFilter(this, Constants.KEYWORDS.RPC_AFTER_FILTER, af);
    }
    /**
     * add a rpc filter to before and after rpc filter
     *
     * @param {Object} filter provide before and after filter method.
     *                        A filter should have two methods: before and after.
     * @memberOf Application
     */
    rpcFilter(filter) {
        this.rpcBefore(filter);
        this.rpcAfter(filter);
    }
    load(name, component, opts) {
        if (typeof name !== 'string') {
            opts = component;
            component = name;
            name = null;
        }
        if (util_1.isFunction(component)) {
            component = new component(this, opts);
        }
        if (!name && typeof component.name === 'string') {
            name = component.name;
        }
        if (name && this.components[name]) {
            // ignore duplicat component
            logger.warn('ignore duplicate component: %j', name);
            return;
        }
        this.loaded.push(component);
        if (name) {
            // components with a name would get by name throught app.components later.
            this.components[name] = component;
        }
        return component;
    }
    _checkCanRequire(path) {
        try {
            path = require.resolve(path);
        }
        catch (err) {
            return null;
        }
        return path;
    }
    /**
     * Load Configure json file to settings.(support different enviroment directory & compatible for old path)
     *
     * @param {String} key environment key
     * @param {String} val environment value
     * @param {Boolean} reload whether reload after change default false
     * @return {Server|Mixed} for chaining, or the setting value
     * @memberOf Application
     */
    loadConfigBaseApp(key, val, reload = false) {
        let self = this;
        let env = this.get(Constants.RESERVED.ENV);
        let originPath = path.join(this.getBase(), val);
        let presentPath = path.join(this.getBase(), Constants.FILEPATH.CONFIG_DIR, env, path.basename(val));
        let realPath;
        let tmp;
        if (self._checkCanRequire(originPath)) {
            realPath = require.resolve(originPath);
            let file = require(originPath);
            if (file[env]) {
                file = file[env];
            }
            this.set(key, file);
        }
        else if (self._checkCanRequire(presentPath)) {
            realPath = require.resolve(presentPath);
            let pfile = require(presentPath);
            this.set(key, pfile);
        }
        else {
            logger.error('invalid configuration with file path: %s', key);
        }
        if (!!realPath && !!reload) {
            const watcher = fs.watch(realPath, function (event, filename) {
                if (event === 'change') {
                    self.clearRequireCache(require.resolve(realPath));
                    watcher.close();
                    self.loadConfigBaseApp(key, val, reload);
                }
            });
        }
    }
    clearRequireCache(path) {
        const moduleObj = require.cache[path];
        if (!moduleObj) {
            logger.warn('can not find module of truepath', path);
            return;
        }
        if (moduleObj.parent) {
            //    console.log('has parent ',moduleObj.parent);
            moduleObj.parent.children.splice(moduleObj.parent.children.indexOf(moduleObj), 1);
        }
        delete require.cache[path];
    }
    /**
     * Load Configure json file to settings.
     *
     * @param {String} key environment key
     * @param {String} val environment value
     * @return {Server|Mixed} for chaining, or the setting value
     * @memberOf Application
     */
    loadConfig(key, val) {
        let env = this.get(Constants.RESERVED.ENV);
        let cfg = require(val);
        if (cfg[env]) {
            cfg = cfg[env];
        }
        this.set(key, cfg);
    }
    /**
     * Set the route function for the specified server type.
     *
     * Examples:
     *
     *  app.route('area', routeFunc);
     *
     *  let routeFunc = function(session, msg, app, cb) {
     *    // all request to area would be route to the first area server
     *    let areas = app.getServersByType('area');
     *    cb(null, areas[0].id);
     *  };
     *
     * @param  {String} serverType server type string
     * @param  {Function} routeFunc  route function. routeFunc(session, msg, app, cb)
     * @return {Object}     current application instance for chain invoking
     * @memberOf Application
     */
    route(serverType, routeFunc) {
        let routes = this.get(Constants.KEYWORDS.ROUTE);
        if (!routes) {
            routes = {};
            this.set(Constants.KEYWORDS.ROUTE, routes);
        }
        routes[serverType] = routeFunc;
        return this;
    }
    /**
     * Set before stop function. It would perform before servers stop.
     *
     * @param  {Function} fun before close function
     * @return {Void}
     * @memberOf Application
     */
    beforeStopHook(fun) {
        logger.warn('this method was deprecated in pinus 0.8');
        if (!!fun && typeof fun === 'function') {
            this.set(Constants.KEYWORDS.BEFORE_STOP_HOOK, fun);
        }
    }
    /**
     * Start application. It would load the default components and start all the loaded components.
     *
     * @param  {Function} cb callback function
     * @memberOf Application
     */
    start(cb) {
        this.startTime = Date.now();
        if (this.state > STATE_INITED) {
            utils.invokeCallback(cb, new Error('application has already start.'));
            return;
        }
        let self = this;
        appUtil.startByType(self, function () {
            appUtil.loadDefaultComponents(self);
            let startUp = function () {
                self.state = STATE_BEFORE_START;
                logger.info('%j enter before start...', self.getServerId());
                appUtil.optComponents(self.loaded, Constants.RESERVED.BEFORE_START, function (err) {
                    if (err) {
                        utils.invokeCallback(cb, err);
                    }
                    else {
                        logger.info('%j enter after start...', self.getServerId());
                        appUtil.optComponents(self.loaded, Constants.RESERVED.START, function (err) {
                            self.state = STATE_START;
                            if (err) {
                                utils.invokeCallback(cb, err);
                            }
                            else {
                                logger.info('%j enter after start...', self.getServerId());
                                self.afterStart(cb);
                            }
                        });
                    }
                });
            };
            appUtil.optLifecycles(self.usedPlugins, Constants.LIFECYCLE.BEFORE_STARTUP, self, function (err) {
                if (err) {
                    utils.invokeCallback(cb, err);
                }
                else {
                    startUp();
                }
            });
        });
    }
    /**
     * Lifecycle callback for after start.
     *
     * @param  {Function} cb callback function
     * @return {Void}
     */
    afterStart(cb) {
        if (this.state !== STATE_START) {
            utils.invokeCallback(cb, new Error('application is not running now.'));
            return;
        }
        let self = this;
        appUtil.optComponents(this.loaded, Constants.RESERVED.AFTER_START, function (err) {
            self.state = STATE_STARTED;
            let id = self.getServerId();
            if (!err) {
                logger.info('%j finish start', id);
            }
            appUtil.optLifecycles(self.usedPlugins, Constants.LIFECYCLE.AFTER_STARTUP, self, function (err) {
                let usedTime = Date.now() - self.startTime;
                logger.info('%j startup in %s ms', id, usedTime);
                self.event.emit(events_2.default.START_SERVER, id);
                cb && cb(err);
            });
        });
    }
    /**
     * Stop components.
     *
     * @param  {Boolean} force whether stop the app immediately
     */
    stop(force) {
        if (this.state > STATE_STARTED) {
            logger.warn('[pinus application] application is not running now.');
            return;
        }
        this.state = STATE_STOPED;
        let self = this;
        this.stopTimer = setTimeout(function () {
            process.exit(0);
        }, Constants.TIME.TIME_WAIT_STOP);
        let cancelShutDownTimer = function () {
            if (!!self.stopTimer) {
                clearTimeout(self.stopTimer);
            }
        };
        let shutDown = function () {
            appUtil.stopComps(self.loaded, 0, force, function () {
                cancelShutDownTimer();
                if (force) {
                    process.exit(0);
                }
            });
        };
        let fun = this.get(Constants.KEYWORDS.BEFORE_STOP_HOOK);
        appUtil.optLifecycles(self.usedPlugins, Constants.LIFECYCLE.BEFORE_SHUTDOWN, self, function (err) {
            if (err) {
                console.error(`throw err when beforeShutdown `, err.stack);
            }
            else {
                if (!!fun) {
                    utils.invokeCallback(fun, self, shutDown, cancelShutDownTimer);
                }
                else {
                    shutDown();
                }
            }
        }, cancelShutDownTimer);
    }
    set(setting, val, attach) {
        this.settings[setting] = val;
        if (attach) {
            this[setting] = val;
        }
        return this;
    }
    get(setting) {
        return this.settings[setting];
    }
    /**
     * Check if `setting` is enabled.
     *
     * @param {String} setting application setting
     * @return {Boolean}
     * @memberOf Application
     */
    enabled(setting) {
        return !!this.get(setting);
    }
    /**
     * Check if `setting` is disabled.
     *
     * @param {String} setting application setting
     * @return {Boolean}
     * @memberOf Application
     */
    disabled(setting) {
        return !this.get(setting);
    }
    /**
     * Enable `setting`.
     *
     * @param {String} setting application setting
     * @return {app} for chaining
     * @memberOf Application
     */
    enable(setting) {
        return this.set(setting, true);
    }
    /**
     * Disable `setting`.
     *
     * @param {String} setting application setting
     * @return {app} for chaining
     * @memberOf Application
     */
    disable(setting) {
        return this.set(setting, false);
    }
    configure(env, type, fn) {
        let args = [].slice.call(arguments);
        fn = args.pop();
        env = type = Constants.RESERVED.ALL;
        if (args.length > 0) {
            env = args[0];
        }
        if (args.length > 1) {
            type = args[1];
        }
        if (env === Constants.RESERVED.ALL || contains(this.settings.env, env)) {
            if (type === Constants.RESERVED.ALL || contains(this.settings.serverType, type)) {
                fn.call(this);
            }
        }
        return this;
    }
    registerAdmin(moduleId, module, opts) {
        let modules = this.get(Constants.KEYWORDS.MODULE);
        if (!modules) {
            modules = {};
            this.set(Constants.KEYWORDS.MODULE, modules);
        }
        if (typeof moduleId !== 'string') {
            opts = module;
            module = moduleId;
            if (module) {
                moduleId = (module.moduleId);
                if (!moduleId)
                    moduleId = module.constructor.name;
            }
        }
        if (!moduleId) {
            return;
        }
        modules[moduleId] = {
            moduleId: moduleId,
            module: module,
            opts: opts
        };
    }
    /**
     * Use plugin.
     *
     * @param  {Object} plugin plugin instance
     * @param  {[type]} opts    (optional) construct parameters for the factory function
     * @memberOf Application
     */
    use(plugin, opts) {
        opts = opts || {};
        if (!plugin) {
            throw new Error(`pluin is null!]`);
        }
        if (this.usedPlugins.indexOf(plugin) >= 0) {
            throw new Error(`pluin[${plugin.name} was used already!]`);
        }
        if (plugin.components) {
            for (let componentCtor of plugin.components) {
                this.load(componentCtor, opts);
            }
        }
        if (plugin.events) {
            for (let eventCtor of plugin.events) {
                this.loadEvent(eventCtor, opts);
            }
        }
        this.usedPlugins.push(plugin);
        console.warn(`used Plugin : ${plugin.name}`);
    }
    /**
     * Application transaction. Transcation includes conditions and handlers, if conditions are satisfied, handlers would be executed.
     * And you can set retry times to execute handlers. The transaction log is in file logs/transaction.log.
     *
     * @param {String} name transaction name
     * @param {Object} conditions functions which are called before transaction
     * @param {Object} handlers functions which are called during transaction
     * @param {Number} retry retry times to execute handlers if conditions are successfully executed
     * @memberOf Application
     */
    transaction(name, conditions, handlers, retry) {
        appManager.transaction(name, conditions, handlers, retry);
    }
    /**
     * Get master server info.
     *
     * @return {Object} master server info, {id, host, port}
     * @memberOf Application
     */
    getMaster() {
        return this.master;
    }
    /**
     * Get current server info.
     *
     * @return {Object} current server info, {id, serverType, host, port}
     * @memberOf Application
     */
    getCurServer() {
        return this.curServer;
    }
    /**
     * Get current server id.
     *
     * @return {String|Number} current server id from servers.json
     * @memberOf Application
     */
    getServerId() {
        return this.serverId;
    }
    /**
     * Get current server
     * @returns ServerInfo
     */
    getCurrentServer() {
        return this.curServer;
    }
    /**
     * Get current server type.
     *
     * @return {String|Number} current server type from servers.json
     * @memberOf Application
     */
    getServerType() {
        return this.serverType;
    }
    /**
     * Get all the current server infos.
     *
     * @return {Object} server info map, key: server id, value: server info
     * @memberOf Application
     */
    getServers() {
        return this.servers;
    }
    /**
     * Get all server infos from servers.json.
     *
     * @return {Object} server info map, key: server id, value: server info
     * @memberOf Application
     */
    getServersFromConfig() {
        return this.get(Constants.KEYWORDS.SERVER_MAP);
    }
    /**
     * Get all the server type.
     *
     * @return {Array} server type list
     * @memberOf Application
     */
    getServerTypes() {
        return this.serverTypes;
    }
    /**
     * Get server info by server id from current server cluster.
     *
     * @param  {String} serverId server id
     * @return {Object} server info or undefined
     * @memberOf Application
     */
    getServerById(serverId) {
        return this.servers[serverId];
    }
    /**
     * Get server info by server id from servers.json.
     *
     * @param  {String} serverId server id
     * @return {Object} server info or undefined
     * @memberOf Application
     */
    getServerFromConfig(serverId) {
        return this.get(Constants.KEYWORDS.SERVER_MAP)[serverId];
    }
    /**
     * Get server infos by server type.
     *
     * @param  {String} serverType server type
     * @return {Array}      server info list
     * @memberOf Application
     */
    getServersByType(serverType) {
        return this.serverTypeMaps[serverType];
    }
    /**
     * Check the server whether is a frontend server
     *
     * @param  {server}  server server info. it would check current server
     *            if server not specified
     * @return {Boolean}
     *
     * @memberOf Application
     */
    isFrontend(server) {
        server = server || this.getCurServer();
        return !!server && server.frontend === 'true';
    }
    /**
     * Check the server whether is a backend server
     *
     * @param  {server}  server server info. it would check current server
     *            if server not specified
     * @return {Boolean}
     * @memberOf Application
     */
    isBackend(server) {
        server = server || this.getCurServer();
        return !!server && !server.frontend;
    }
    /**
     * Check whether current server is a master server
     *
     * @return {Boolean}
     * @memberOf Application
     */
    isMaster() {
        return this.serverType === Constants.RESERVED.MASTER;
    }
    /**
     * Add new server info to current application in runtime.
     *
     * @param {Array} servers new server info list
     * @memberOf Application
     */
    addServers(servers) {
        if (!servers || !servers.length) {
            return;
        }
        let item, slist;
        for (let i = 0, l = servers.length; i < l; i++) {
            item = servers[i];
            // update global server map
            this.servers[item.id] = item;
            // update global server type map
            slist = this.serverTypeMaps[item.serverType];
            if (!slist) {
                this.serverTypeMaps[item.serverType] = slist = [];
            }
            replaceServer(slist, item);
            // update global server type list
            if (this.serverTypes.indexOf(item.serverType) < 0) {
                this.serverTypes.push(item.serverType);
            }
        }
        this.event.emit(events_2.default.ADD_SERVERS, servers);
    }
    /**
     * Remove server info from current application at runtime.
     *
     * @param  {Array} ids server id list
     * @memberOf Application
     */
    removeServers(ids) {
        if (!ids || !ids.length) {
            return;
        }
        let id, item, slist;
        for (let i = 0, l = ids.length; i < l; i++) {
            id = ids[i];
            item = this.servers[id];
            if (!item) {
                continue;
            }
            // clean global server map
            delete this.servers[id];
            // clean global server type map
            slist = this.serverTypeMaps[item.serverType];
            removeServer(slist, id);
            // TODO: should remove the server type if the slist is empty?
        }
        this.event.emit(events_2.default.REMOVE_SERVERS, ids);
    }
    /**
     * Replace server info from current application at runtime.
     *
     * @param  {Object} server id map
     * @memberOf Application
     */
    replaceServers(servers) {
        if (!servers) {
            return;
        }
        this.servers = servers;
        this.serverTypeMaps = {};
        this.serverTypes = [];
        let serverArray = [];
        for (let id in servers) {
            let server = servers[id];
            let serverType = server[Constants.RESERVED.SERVER_TYPE];
            let slist = this.serverTypeMaps[serverType];
            if (!slist) {
                this.serverTypeMaps[serverType] = slist = [];
            }
            this.serverTypeMaps[serverType].push(server);
            // update global server type list
            if (this.serverTypes.indexOf(serverType) < 0) {
                this.serverTypes.push(serverType);
            }
            serverArray.push(server);
        }
        this.event.emit(events_2.default.REPLACE_SERVERS, serverArray);
    }
    /**
     * Add crons from current application at runtime.
     *
     * @param  {Array} crons new crons would be added in application
     * @memberOf Application
     */
    addCrons(crons) {
        if (!crons || !crons.length) {
            logger.warn('crons is not defined.');
            return;
        }
        this.event.emit(events_2.default.ADD_CRONS, crons);
    }
    /**
     * Remove crons from current application at runtime.
     *
     * @param  {Array} crons old crons would be removed in application
     * @memberOf Application
     */
    removeCrons(crons) {
        if (!crons || !crons.length) {
            logger.warn('ids is not defined.');
            return;
        }
        this.event.emit(events_2.default.REMOVE_CRONS, crons);
    }
    /**
     * 加载一个事件侦听
     * @param Event
     * @param opts
     */
    loadEvent(Event, opts) {
        let eventInstance = new Event(opts);
        for (let evt in events_2.AppEvents) {
            let name = events_2.AppEvents[evt];
            let method = eventInstance[name];
            if (method) {
                this.event.on(name, method.bind(eventInstance));
            }
        }
    }
}
exports.Application = Application;
let replaceServer = function (slist, serverInfo) {
    for (let i = 0, l = slist.length; i < l; i++) {
        if (slist[i].id === serverInfo.id) {
            slist[i] = serverInfo;
            return;
        }
    }
    slist.push(serverInfo);
};
let removeServer = function (slist, id) {
    if (!slist || !slist.length) {
        return;
    }
    for (let i = 0, l = slist.length; i < l; i++) {
        if (slist[i].id === id) {
            slist.splice(i, 1);
            return;
        }
    }
};
let contains = function (str, settings) {
    if (!settings) {
        return false;
    }
    let ts = settings.split('|');
    for (let i = 0, l = ts.length; i < l; i++) {
        if (str === ts[i]) {
            return true;
        }
    }
    return false;
};
let addFilter = function (app, type, filter) {
    let filters = app.get(type);
    if (!filters) {
        filters = [];
        app.set(type, filters);
    }
    filters.push(filter);
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwbGljYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvYXBwbGljYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7O0dBSUc7O0FBRUg7O0dBRUc7QUFDSCxzQ0FBc0M7QUFDdEMsK0NBQWdEO0FBQ2hELG1DQUFvQztBQUNwQywwQ0FBMkQ7QUFDM0QsMENBQTBDO0FBQzFDLDhDQUE4QztBQUM5QywwREFBMEQ7QUFDMUQseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQWtCN0IsK0JBQWdDO0FBa0JoQyxJQUFJLE1BQU0sR0FBRyx3QkFBUyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFrRTNEOztHQUVHO0FBQ0gsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUUsaUJBQWlCO0FBQ3hDLElBQUksa0JBQWtCLEdBQUcsQ0FBQyxDQUFDLENBQUUsbUJBQW1CO0FBQ2hELElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQyxDQUFFLFlBQVk7QUFDbEMsSUFBSSxhQUFhLEdBQUcsQ0FBQyxDQUFDLENBQUUsa0JBQWtCO0FBQzFDLElBQUksWUFBWSxHQUFHLENBQUMsQ0FBQyxDQUFFLGlCQUFpQjtBQUV4QyxNQUFhLFdBQVc7SUFBeEI7UUFFSSxXQUFNLEdBQWlCLEVBQUUsQ0FBQyxDQUFPLHdCQUF3QjtRQUN6RCxlQUFVLEdBZU4sRUFBRSxDQUFDLENBQUcsd0JBQXdCO1FBTWxDLGFBQVEsR0FBMkIsRUFBRSxDQUFDLENBQUssMEJBQTBCO1FBQ3JFLFVBQUssR0FBRyxJQUFJLHFCQUFZLEVBQUUsQ0FBQyxDQUFFLGlDQUFpQztRQVE5RCxzQkFBc0I7UUFDdEIsV0FBTSxHQUFvQixJQUFJLENBQUMsQ0FBUyxxQkFBcUI7UUFDN0QsWUFBTyxHQUFpQyxFQUFFLENBQUMsQ0FBVSw4Q0FBOEM7UUFDbkcsbUJBQWMsR0FBcUMsRUFBRSxDQUFDLENBQUcsMkNBQTJDO1FB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