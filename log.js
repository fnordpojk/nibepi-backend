var fs = require('fs');

const LOG_FILE = '/tmp/nibepi.log';
const PREV_FILE = LOG_FILE + '.1';
// One generation is kept, so the log costs at most twice this on disk. /tmp is
// tmpfs on a bare Pi, so this is RAM there - keep it modest.
const MAX_BYTES = 5 * 1024 * 1024;

let fd = null;
let size = 0;

// Opened for append, not truncate: the log used to be opened with the default
// 'w' and wiped on every process start, so a container restart - a Docker
// package update is enough - silently destroyed the history. Rotation is what
// bounds the file now, not restarts.
//
// Lines are written synchronously to the descriptor. A write stream buffers them
// and flushes later, so whatever was pending when the process exited - the
// lines explaining why it stopped, and the stop itself - was lost.
function open(flags) {
    try {
        fd = fs.openSync(LOG_FILE, flags);
        size = fs.fstatSync(fd).size;
    } catch (e) {
        fd = null;
        size = 0;
    }
}

function rotate() {
    try { if (fd !== null) fs.closeSync(fd); } catch (e) { /* ignore */ }
    fd = null;
    let renamed = false;
    try { fs.renameSync(LOG_FILE, PREV_FILE); renamed = true; } catch (e) { renamed = false; }
    // If the rename failed - read-only filesystem, no space - truncate instead.
    // Reopening in append mode would leave the file over the limit and make
    // every subsequent line attempt another rotation.
    open(renamed ? 'a' : 'w');
}

open('a');

const log = (enable,data,enabled,kind) => {
    if(enable!==undefined && enable===true && enabled!==undefined && enabled===true) {
        var tzoffset = (new Date()).getTimezoneOffset() * 60000;
        var time = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1).replace('T',' ');
        const line = `${time} ${kind}: [${data}]\n`;
        const bytes = Buffer.byteLength(line);
        if (size + bytes > MAX_BYTES) rotate();
        if (fd !== null) {
            // EACCES or ENOSPC must not take the controller down over a log line.
            try {
                fs.writeSync(fd, line);
                size += bytes;
            } catch (e) {
                try { fs.closeSync(fd); } catch (e2) { /* ignore */ }
                fd = null;
            }
        }
    }
}

module.exports = log;
