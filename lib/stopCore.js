const stopCore = (core) => {
    const promise = new Promise((resolve,reject) => {
        if(core!==undefined) {
            if(core.connected===true) {
                core.disconnect();
            }
            core.kill('SIGINT');
            resolve(core.connected);
        } else {
            resolve(false);
        }
    });
    return promise;    
}

module.exports = stopCore;