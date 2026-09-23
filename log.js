var fs = require('fs');

const LOG_FILE = '/tmp/nibepi.log';
const PREV_FILE = LOG_FILE + '.1';
// One generation is kept, so the log costs at most twice this on disk. /tmp is
// tmpfs on a bare Pi, so this is RAM there - keep it modest.
const MAX_BYTES = 5 * 1024 * 1024;

let writer = null;
let size = 0;

// Opened for append, not truncate. createWriteStream defaults to 'w', so the
// log used to be wiped on every process start: a container restart - a Docker
// package update is enough - silently destroyed the history. Rotation is what
// bounds the file now, not restarts.
function open(flags) {
    try {
        size = flags === 'a' && fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0;
        writer = fs.createWriteStream(LOG_FILE, { flags: flags });
        // Without this an EACCES or ENOSPC would surface as an unhandled
        // 'error' event and take the controller down with it.
        writer.on('error', () => { writer = null; });
    } catch (e) {
        writer = null;
        size = 0;
    }
}

function rotate() {
    try { if (writer) writer.end(); } catch (e) { /* ignore */ }
    writer = null;
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
        if (writer) {
            writer.write(line);
            size += bytes;
        }
}
}

module.exports = log;
