"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const Loader = require("pinus-loader");
const pathUtil = require("../util/pathUtil");
const crypto = require("crypto");
const pinus_rpc_1 = require("pinus-rpc");
const pinus_loader_1 = require("pinus-loader");
function canResolve(path) {
    try {
        require.resolve(path);
    }
    catch (err) {
        return false;
    }
    return true;
}
class DictionaryComponent {
    constructor(app, opts) {
        this.dict = {};
        this.abbrs = {};
        this.version = '';
        this.name = '__dictionary__';
        this.app = app;
        // Set user dictionary
        let p = path.join(app.getBase(), '/config/dictionary');
        if (!!opts && !!opts.dict) {
            p = opts.dict;
        }
        if (canResolve(p)) {
            this.userDicPath = p;
        }
    }
    start(cb) {
        let servers = this.app.get('servers');
        let routes = [];
        // Load all the handler files
        for (let serverType in servers) {
            let p = pathUtil.getHandlerPath(this.app.getBase(), serverType);
            if (!p) {
                continue;
            }
            let handlers = Loader.load(p, this.app, false, false, pinus_loader_1.LoaderPathType.PINUS_HANDLER);
            for (let name in handlers) {
                let handler = handlers[name];
                for (let name in handlers) {
                    let handler = handlers[name];
                    let proto = pinus_rpc_1.listEs6ClassMethods(handler);
                    for (let key of proto) {
                        routes.push(serverType + '.' + name + '.' + key);
                    }
                }
            }
        }
        // Sort the route to make sure all the routers abbr are the same in all the servers
        routes.sort();
        console.warn('after start all server, use route dictionary :\n', routes.join('\n'));
        let abbr;
        let i;
        for (i = 0; i < routes.length; i++) {
            abbr = i + 1;
            this.abbrs[abbr] = routes[i];
            this.dict[routes[i]] = abbr;
        }
        // Load user dictionary
        if (!!this.userDicPath) {
            let userDic = require(this.userDicPath);
            abbr = routes.length + 1;
            for (i = 0; i < userDic.length; i++) {
                let route = userDic[i];
                this.abbrs[abbr] = route;
                this.dict[route] = abbr;
                abbr++;
            }
        }
        this.version = crypto.createHash('md5').update(JSON.stringify(this.dict)).digest('base64');
        process.nextTick(cb);
    }
    getDict() {
        return this.dict;
    }
    getAbbrs() {
        return this.abbrs;
    }
    getVersion() {
        return this.version;
    }
}
exports.DictionaryComponent = DictionaryComponent;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGljdGlvbmFyeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL2xpYi9jb21wb25lbnRzL2RpY3Rpb25hcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQSw2QkFBNkI7QUFFN0IsdUNBQXVDO0FBQ3ZDLDZDQUE2QztBQUM3QyxpQ0FBaUM7QUFHakMseUNBQWdEO0FBRWhELCtDQUE4QztBQU05QyxTQUFTLFVBQVUsQ0FBQyxJQUFZO0lBQzVCLElBQUk7UUFDQSxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3pCO0lBQUMsT0FBTyxHQUFHLEVBQUU7UUFDVixPQUFPLEtBQUssQ0FBQztLQUNoQjtJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2hCLENBQUM7QUFFRCxNQUFhLG1CQUFtQjtJQVE1QixZQUFZLEdBQWdCLEVBQUUsSUFBZ0M7UUFOOUQsU0FBSSxHQUE4QixFQUFFLENBQUM7UUFDckMsVUFBSyxHQUE4QixFQUFFLENBQUM7UUFFdEMsWUFBTyxHQUFHLEVBQUUsQ0FBQztRQUNiLFNBQUksR0FBRyxnQkFBZ0IsQ0FBQztRQUdwQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUVmLHNCQUFzQjtRQUN0QixJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRTtZQUN2QixDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztTQUNqQjtRQUNELElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ2YsSUFBSSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUM7U0FDeEI7SUFDTCxDQUFDO0lBR0QsS0FBSyxDQUFDLEVBQWM7UUFDaEIsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxH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