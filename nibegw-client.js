const dgram = require('dgram');
var server = dgram.createSocket('udp4');

var HOST = "127.0.0.1";
var PORT = 9999;
const sendQueue = [[192,107,6,115,176,1,0,0,0,111],[192,107,6,212,190,0,0,0,0,199]];
const getQueue = [];
var red = false;
var regQueue = [];
var regCount = 0;
let checkACK = {};
// RMU40 through the gateway (rmu.gateway in the config). Each system's frames
// go to its own UDP port on the gateway, which answers the pump's next RMU40
// token for that system with them, once each. So the room temperature is sent
// again every 10 seconds, as esphome-nibe's own room unit does, while a
// command such as Temporary Lux goes only once.
let rmuGateway = {enable:false, ports:{}};
const rmuTemperature = {}; // RMU40 address -> latest temperature frame
const RMU_TEMPERATURE_INDEX = 6;
let started = false;
function sendRmu(address, frame) {
    const port = rmuGateway.ports[address];
    if(port===undefined) {
        if(process.connected===true) {
            process.send({type:"log",data:`RMU40 System ${address-0x18}: no UDP port on the gateway set for it`,level:"error",kind:"NibeGW"});
        }
        return false;
    }
    send(frame, port);
    return true;
}
setInterval(() => {
    if(started!==true || rmuGateway.enable!==true) return;
    for (const address of Object.keys(rmuTemperature)) {
        sendRmu(Number(address), rmuTemperature[address]);
    }
}, 10000);
process.on('message', (m) => {
    if(m.start===true) {
        if(m.port!==undefined) {
            HOST = m.port;
            start()
        } else {
            if(process.connected===true) {
                process.send({type:"log",data:'Error starting backend, no serial port specified',level:"error",kind:"Serialport"});
	        console.log('Error in the core');
}
        }
    } else if(m.type=="reqData") {
        if(m.data!==undefined) {
            let found = false;
            for (let i = 0; i < getQueue.length; i = i + 1) {
                let address = (getQueue[i][4]*256)+getQueue[i][3];
                if((m.data[4]*256)+m.data[3]==address) {
                    found = true;
                }
            }
            if(found===false) getQueue.unshift(m.data)
        }
        ;
    } else if(m.type=="setData") {
        sendQueue.push(m.data);
    } else if(m.type=="rmuGateway") {
        rmuGateway = m.data;
        if(rmuGateway.enable!==true) {
            for (const address of Object.keys(rmuTemperature)) delete rmuTemperature[address];
        }
    } else if(m.type=="rmuSet") {
        // index.js keeps RMU40 read-only unless the gateway is set up for it,
        // so this should not happen when it is off; if it does, say so
        // instead of dropping the value.
        if(rmuGateway.enable!==true) {
            if(process.connected===true) {
                process.send({type:"log",data:`RMU40 value for register ${m.data.address} not sent: RMU40 through NibeGW is off`,level:"error",kind:"NibeGW"});
            }
            return;
        }
        const address = Number(m.data.ackback[2]);
        if(!sendRmu(address, m.data.data)) return;
        const temperature = m.data.data[3]===RMU_TEMPERATURE_INDEX;
        if(temperature) rmuTemperature[address] = m.data.data;
        if(process.connected===true) {
            process.send({type:"ack",data:{register:m.data.address,ack:true}});
            process.send({type:"log",data:`Register: ${m.data.address}, Buffer: ${JSON.stringify(m.data.data)}`,level:"core",kind:"RMU SENT"});
            // Shows the value sent as the register's value, as over serial.
            if(temperature && m.data.noValue!==true) {
                process.send({type:"data",data:m.data.ackback});
            }
        }
    } else if(m.type=="regRegister") {
        regQueue = m.data;
    } else if(m.type=="red") {
        red = m.data;
    }
  });
  process.on('disconnect', (m) => {
      if(red===false) {
        console.log('Shutting down the core.')
        process.exit(99);
      }
    
  });
// Gateways track a reply target per source ip:port. Opening a fresh socket
// for every request gives each one a new ephemeral source port, so the
// gateway's target list grows without bound until it runs out of buffers and
// stops answering (esphome-nibe logs "New target added <ip>:<port>", then
// "UDP sendto failed ..., error: 12"). Send from the socket already bound to
// PORT instead, so the source port never changes.
function send(data, port) {
    data = Buffer.from(data)
    server.send(data, 0, data.length, port, HOST, function(err, bytes) {
        if(err!==null && err!==undefined && process.connected===true) {
            process.send({type:"log",data:'UDP send to '+HOST+':'+port+' failed: '+err.message,level:"error",kind:"NibeGW"});
        }
    });
}
function write(data) {
    send(data, 10001);
}
function read(data) {
    send(data, 10000);
}
function start() {
    started = true;
    server.bind(PORT, "0.0.0.0");
    server.on('listening', function() {
        var address = server.address();
       console.log('NibeGW client is listening on ' + HOST + ':' + address.port);
      });      
    server.on('message', function(message, remote) {
        makeResponse(Buffer.from(message)).then(result => {
                result = Array.from(result);
                let doubleFound = false;
                for (let i = 5; i < result.length - 1; i = i + 1) {
                    if(result[i]===92 && result[i+1]===92) {
                        result.splice(i, 1);
                        result[4] = result[4]-1;
                        doubleFound = true;
                    }
                }
                if(doubleFound===true) {
                    var calcChecksum = 0;
                    for(let i = 2; i < (result[4] + 5); i++) {
                        calcChecksum ^= result[i];
                    }
                    result[result.length-1] = calcChecksum;
                }
                if(process.connected===true) {
                    process.send({type:"data",data:result,rmu:checkACK[result[2]]});
                    process.send({type:"log",data:result,level:"debug",kind:"OK"});
                }
        }, err => {
    
        })    
    });
}


const makeResponse = (data) => {
    const promise = new Promise((resolve,reject) => {
    // Read from heatpump
    
    if(data[3]==105 && data[4]==0x00) {
        if(getQueue!==undefined && getQueue.length!==0) {
            let lastMsg = getQueue.pop();
            
            if(lastMsg!==undefined) {
                read(lastMsg)
                resolve(data);
            } else if(getQueue.length!==0) {
                lastMsg = getQueue.pop();
                if(lastMsg!==undefined) {
                    read(lastMsg)
                    resolve(data);
                } else {
                    resolve(data);
                }
            } else {
                    resolve(data);
            }
        } else {
            if(regQueue.length!==0) {
                if(regCount>=regQueue.length) regCount = 0;
                read(regQueue[regCount])
                regCount++;
                resolve(data);
            } else {
                resolve(data);
        }
        }
    // Write to heatpump
    } else if(data[3]==107 && data[4]==0x00) {
        if(sendQueue.length!==0) {
            let lastMsg = sendQueue.pop();
            if(lastMsg!==undefined) {
                let address = (lastMsg[4] * 256 + lastMsg[3]);
                if(process.connected===true) {
                    process.send({type:"ack",data:{register:address,ack:true}});
                    process.send({type:"log",data:`Register: ${address}, Buffer: ${JSON.stringify(lastMsg)}`,level:"debug",kind:"SENT"});
                }
                write(lastMsg);
                resolve(data);
            } else {
                    resolve(data);
            }
        } else {
                resolve(data);
        }
    } else {
            if(data[3]==109) {

            } else if(data[3]==238) {

            } else if(data[3]==106 || data[3]==104) {

            } else {

            }
            resolve(data);
    }
});
return promise;
}
