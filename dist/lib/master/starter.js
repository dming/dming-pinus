"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cp = require("child_process");
const pinus_logger_1 = require("pinus-logger");
const util = require("util");
const utils = require("../util/utils");
const Constants = require("../util/constants");
const os = require("os");
const pinus_1 = require("../pinus");
const path = require("path");
let logger = pinus_logger_1.getLogger('pinus', path.basename(__filename));
let cpus = {};
let env = Constants.RESERVED.ENV_DEV;
/**
 * Run all servers
 *
 * @param {Object} app current application  context
 * @return {Void}
 */
function runServers(app) {
    let server, servers;
    let condition = app.startId || app.type;
    switch (condition) {
        case Constants.RESERVED.MASTER:
            break;
        case Constants.RESERVED.ALL:
            servers = app.getServersFromConfig();
            for (let serverId in servers) {
                run(app, servers[serverId]);
            }
            break;
        default:
            server = app.getServerFromConfig(condition);
            if (!!server) {
                run(app, server);
            }
            else {
                servers = app.get(Constants.RESERVED.SERVERS)[condition];
                for (let i = 0; i < servers.length; i++) {
                    run(app, servers[i]);
                }
            }
    }
}
exports.runServers = runServers;
/**
 * Run server
 *
 * @param {Object} app current application context
 * @param {Object} server
 * @return {Void}
 */
function run(app, server, cb) {
    env = app.get(Constants.RESERVED.ENV);
    let cmd, key;
    if (utils.isLocal(server.host)) {
        let options = [];
        if (!!server.args) {
            if (typeof server.args === 'string') {
                options.push(server.args.trim());
            }
            else {
                options = options.concat(server.args);
            }
        }
        cmd = app.get(Constants.RESERVED.MAIN);
        options.push(cmd);
        options.push(util.format('env=%s', env));
        for (key in server) {
            if (key === Constants.RESERVED.CPU) {
                cpus[server.id] = server[key];
            }
            options.push(util.format('%s=%s', key, server[key]));
        }
        localrun(process.execPath, null, options, cb);
    }
    else {
        cmd = util.format('cd "%s" && "%s"', app.getBase(), process.execPath);
        let arg = server.args;
        if (arg !== undefined) {
            cmd += arg;
        }
        cmd += util.format(' "%s" env=%s ', app.get(Constants.RESERVED.MAIN), env);
        for (key in server) {
            if (key === Constants.RESERVED.CPU) {
                cpus[server.id] = server[key];
            }
            cmd += util.format(' %s=%s ', key, server[key]);
        }
        sshrun(cmd, server.host, cb);
    }
}
exports.run = run;
/**
 * Bind process with cpu
 *
 * @param {String} sid server id
 * @param {String} pid process id
 * @param {String} host server host
 * @return {Void}
 */
function bindCpu(sid, pid, host) {
    if (os.platform() === Constants.PLATFORM.LINUX && cpus[sid] !== undefined) {
        if (utils.isLocal(host)) {
            let options = [];
            options.push('-pc');
            options.push(String(cpus[sid]));
            options.push(pid);
            localrun(Constants.COMMAND.TASKSET, null, options);
        }
        else {
            let cmd = util.format('taskset -pc "%s" "%s"', cpus[sid], pid);
            sshrun(cmd, host, null);
        }
    }
}
exports.bindCpu = bindCpu;
/**
 * Kill application in all servers
 *
 * @param {String} pids  array of server's pid
 * @param {String} serverIds array of serverId
 */
function kill(pids, servers) {
    let cmd;
    for (let i = 0; i < servers.length; i++) {
        let server = servers[i];
        if (utils.isLocal(server.host)) {
            let options = [];
            if (os.platform() === Constants.PLATFORM.WIN) {
                cmd = Constants.COMMAND.TASKKILL;
                options.push('/pid');
                options.push('/f');
            }
            else {
                cmd = Constants.COMMAND.KILL;
                options.push(String(-9));
            }
            options.push(pids[i]);
            localrun(cmd, null, options);
        }
        else {
            if (os.platform() === Constants.PLATFORM.WIN) {
                cmd = util.format('taskkill /pid %s /f', pids[i]);
            }
            else {
                cmd = util.format('kill -9 %s', pids[i]);
            }
            sshrun(cmd, server.host);
        }
    }
}
exports.kill = kill;
/**
 * Use ssh to run command.
 *
 * @param {String} cmd command that would be executed in the remote server
 * @param {String} host remote server host
 * @param {Function} cb callback function
 *
 */
function sshrun(cmd, host, cb) {
    let args = [];
    args.push(host);
    let ssh_params = pinus_1.pinus.app.get(Constants.RESERVED.SSH_CONFIG_PARAMS);
    if (!!ssh_params && Array.isArray(ssh_params)) {
        args = args.concat(ssh_params);
    }
    args.push(cmd);
    logger.info('Executing ' + cmd + ' on ' + host + ':22');
    spawnProcess(Constants.COMMAND.SSH, host, args, cb);
    return;
}
exports.sshrun = sshrun;
/**
 * Run local command.
 *
 * @param {String} cmd
 * @param {Callback} callback
 *
 */
function localrun(cmd, host, options, callback) {
    logger.info('Executing ' + cmd + ' ' + options + ' locally');
    spawnProcess(cmd, host, options, callback);
}
exports.localrun = localrun;
/**
 * Fork child process to run command.
 *
 * @param {String} command
 * @param {Object} options
 * @param {Callback} callback
 *
 */
let spawnProcess = function (command, host, options, cb) {
    let child = null;
    if (env === Constants.RESERVED.ENV_DEV) {
        child = cp.spawn(command, options);
        let prefix = command === Constants.COMMAND.SSH ? '[' + host + '] ' : '';
        child.stderr.on('data', function (chunk) {
            let msg = chunk.toString();
            process.stderr.write(msg);
            if (!!cb) {
                cb(msg);
            }
        });
        child.stdout.on('data', function (chunk) {
            let msg = prefix + chunk.toString();
            process.stdout.write(msg);
        });
    }
    else {
        child = cp.spawn(command, options, { detached: true, stdio: 'inherit' });
        child.unref();
    }
    child.on('exit', function (code) {
        if (code !== 0) {
            logger.warn('child process exit with error, error code: %s, executed command: %s', code, command);
        }
        if (typeof cb === 'function') {
            cb(code === 0 ? null : code);
        }
    });
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhcnRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL2xpYi9tYXN0ZXIvc3RhcnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLG9DQUFvQztBQUNwQywrQ0FBeUM7QUFDekMsNkJBQTZCO0FBQzdCLHVDQUF1QztBQUN2QywrQ0FBK0M7QUFDL0MseUJBQXlCO0FBQ3pCLG9DQUErQjtBQUcvQiw2QkFBNkI7QUFDN0IsSUFBSSxNQUFNLEdBQUcsd0JBQVMsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0FBSzNELElBQUksSUFBSSxHQUFpQyxFQUFFLENBQUM7QUFDNUMsSUFBSSxHQUFHLEdBQVcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7QUFDN0M7Ozs7O0dBS0c7QUFDSCxTQUFnQixVQUFVLENBQUMsR0FBZ0I7SUFDdkMsSUFBSSxNQUFNLEVBQUUsT0FBTyxDQUFDO0lBQ3BCLElBQUksU0FBUyxHQUFHLEdBQUcsQ0FBQyxPQUFPLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQztJQUN4QyxRQUFRLFNBQVMsRUFBRTtRQUNmLEtBQUssU0FBUyxDQUFDLFFBQVEsQ0FBQyxNQUFNO1lBQzFCLE1BQU07UUFDVixLQUFLLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRztZQUN2QixPQUFPLEdBQUcsR0FBRyxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDckMsS0FBSyxJQUFJLFFBQVEsSUFBSSxPQUFPLEVBQUU7Z0JBQzFCLEdBQUcsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7YUFDL0I7WUFDRCxNQUFNO1FBQ1Y7WUFDSSxNQUFNLEdBQUcsR0FBRyxDQUFDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzVDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRTtnQkFDVixHQUFHLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxD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