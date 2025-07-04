//////////////////////////////////////////////////////
//    ______  ___  ______  ___ ______ _______   __  //
//    | ___ \/ _ \ | ___ \/ _ \|  _  \  _  \ \ / /  //
//    | |_/ / /_\ \| |_/ / /_\ \ | | | | | |\ V /   //
//    |  __/|  _  ||    /|  _  | | | | | | |/   \   //
//    | |   | | | || |\ \| | | | |/ /\ \_/ / /^\ \  //
//    \_|   \_| |_/\_| \_\_| |_/___/  \___/\/   \/  //
//--------------------------------------------------//
//                                                  //
// Copyright(c) 2019-2020 Paradox Productions, LLC. //
//                                                  //
//////////////////////////////////////////////////////
// ===================================================
// ImageSwitcher (Node.js)
// ---------------------------------------------------
// This app allows pictures and video to be played
// full screen on a remote Pi via MQTT commands.
// ---------------------------------------------------
// subproc.js: Sub-process wrapper.
const { spawn } = require('child_process');

/**
 * Executes the provided `command` file with arguments.
 *
 * @param command {string}
 * @param ...args {string[]}
 * @returns SubProcess
**/
function execSubProc(command, ...args) {
  return new SubProcess(command, args.flat());
}

/**
 * Executes the provided shell `command`.
 *
 * @param command {string}
 * @returns SubProcess
**/
function execSubShell(command) {
  return new SubProcess(command, true);
}

exports.execSubProc = execSubProc;
exports.execSubShell = execSubShell;

/**
 * SubProcess is a child process wrapper.
 *
 * @property promise {Promise}
 * @property subprocess {ChildProcess}
**/
class SubProcess {
  constructor(command, args) {
    this.promise = new Promise((resolve, reject) => {
      var shell = false;
      if (!Array.isArray(args)) {
        shell = args;
        args = [];
      }
      const subprocess = this.subprocess = spawn(command, args, {
        shell,
        stdio: ['ignore', process.stdout, process.stderr]
      })
      // only nodejs >= v15
      .on('spawn', () => {
        console.log("spawned: %s", command, args.join(" "));
      })
      .on('error', err => reject(err))
      .on('exit', (code, signal) => {
        if (signal) {
          resolve(signal)
        }
        else {
          resolve(code);
        }
      });
    });
  }

  then(cb1, cb2) {
    return this.promise.then(cb1, cb2)
  }

  catch(cb) {
    return this.promise.catch(cb)
  }

  finally(cb) {
    return this.promise.finally(cb);
  }

  onSpawn(cb) {
    this.subprocess.on('spawn', onSpawn);
  }

  kill() {
    this.subprocess.kill("SIGTERM");
  }

  get killed() {
    return this.subprocess.killed;
  }
}

function killAll(name) {
  const subproc = execSubProc("sudo", "killall", name);
  return subproc.catch(err => console.error("ERROR in killall: %s", err.message));
}

exports.killAll = killAll;
