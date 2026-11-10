# nibepi-backend

The core of NibePi: everything between a Nibe heat pump and Node-RED. It speaks
the wire protocol, decodes and encodes registers, keeps a register database per
pump model, persists configuration, and optionally publishes to MQTT.

This is a library, not an application. It is installed as a dependency of
[node-red-contrib-nibepi](https://github.com/fnordpojk/node-red-contrib-nibepi),
which wraps it as Node-RED nodes.

Originally written by Fredrik Anerdin as
[anerdins/nibepi](https://github.com/anerdins/nibepi). Upstream development
stopped after 1.2.1; this fork continues from there. The npm package is still
named `nibepi`.

## The four repositories

| repo | what it is |
|---|---|
| **nibepi-backend** | this one: transport, protocol, register database, MQTT |
| [node-red-contrib-nibepi](https://github.com/fnordpojk/node-red-contrib-nibepi) | the Node-RED nodes |
| [nibepi-flow](https://github.com/fnordpojk/nibepi-flow) | the flows and dashboard built on those nodes |
| [nibepi-docker](https://github.com/fnordpojk/nibepi-docker) | container packaging for all of it |

## How it reaches the pump

Three transports, chosen with `connection.enable` in the config:

| mode | how | ports |
|---|---|---|
| `serial` | RS485 adapter on a serial port | — |
| `nibegw` | UDP frames from a NibeGW gateway | listens on 9999/udp; sends reads to 10000, writes to 10001 |
| `tcp` | Modbus TCP, for S-series (`connection.series: "sSeries"`) | as configured |

The `nibegw` mode works with the original
[NibeGW](https://github.com/openhab/openhab-addons/tree/main/bundles/org.openhab.binding.nibeheatpump)
hardware gateway and with
[elupus/esphome-nibe](https://github.com/elupus/esphome-nibe) on an ESP32. With
esphome-nibe, `read_port` and `write_port` must be `10000` and `10001`, and the
host running NibePi must appear in its `source:` list, or its requests are
dropped without a reply.

### RMU40 through NibeGW

NibePi can act as an RMU40 room unit, sending the pump a room temperature from
any sensor it knows. The pump wants a room unit's answer within milliseconds
of asking, which NibePi can give over a serial connection but not over UDP. So
through NibeGW the gateway answers instead, with frames NibePi sends it ahead
of time: one UDP port on the gateway per heating system. NibePi sends the room
temperature every 10 seconds, since the gateway uses each frame once, and a
command such as Temporary Lux only once. A sensor without a reading is sent as
"no value", so the pump stops using the last one.

It is off by default. To use it:

1. Activate the RMU40 for the system in the pump (the RMU-40 S1–S3 switches
   on the dashboard's Inställningar tab do that).
2. Turn on "RMU-40 through NibeGW" in the same place, and check the UDP port
   per system: by default 10002–10005 for S1–S4. They are `rmu.gateway` and
   `rmu.gateway_port_s1`–`rmu.gateway_port_s4` in `config.json`; 10000 and
   10001 are not allowed, as they are the gateway's read and write ports.
3. Set the gateway up to answer for that system on the same port. With
   esphome-nibe, for system 1:

```yaml
nibegw:
  udp:
    read_port: 10000
    write_port: 10001
    source:
      - 192.168.1.10        # the host running NibePi
    ports:
      - address: RMU40_S1
        token: RMU_WRITE
        port: 10002         # the port set in NibePi for S1
  acknowledge:
    - MODBUS40
    - RMU40_S1
  constants:
    - address: RMU40_S1     # the room unit's version
      token: ACCESSORY
      data: [0xEE, 0x03, 0x01]
    - address: RMU40_S1
      token: RMU_DATA
      command: RMU_WRITE
      data: [0x63, 0x00]
```

Do not also use esphome-nibe's own `climate` room unit for the same system,
and do not turn this on if a real RMU40 is connected to that system. The
pump's view of the room temperature shows in NibePi as BT50 (40033 for S1),
from its own messages to the room unit.

## Supported pumps

Register maps ship for:

- **F-series** — F370, F470, F730, F750, F1145, F1155, F1245, F1255, F1345, F1355
- **VVM** — VVM225, VVM310, VVM320, VVM325, VVM500, VVM S320
- **SMO** — SMO40
- **S-series** — S1255
- **Rebadged and OEM units** — HMA60, SHK200S, STAR12, Tehowatti Air, VPK8R
- **RMU40** room units as an accessory (S1–S4)

These are exports of Nibe's own register lists: they describe what a model
*can* expose, not what your unit answers. That depends on firmware and on which
accessories are fitted, and a register the pump does not have simply never
replies.

## Requirements

- Node.js 20 or newer
- An RS485 adapter, a NibeGW gateway, or Modbus TCP, depending on the transport
- On a Raspberry Pi: a 64-bit-capable board, so Zero 2 W or newer. Node.js no
  longer publishes 32-bit ARM builds.

## Configuration

State lives in `/etc/nibepi`:

| file | holds |
|---|---|
| `config.json` | connection, MQTT, logging, the polled register list, per-feature settings |
| `graph.json` | saved graph history |
| `vv_ai_profile.json` | the VV-AI hot water profile |

`default.json` in this repo is the template used when no config exists yet.

The directory must exist and be writable by the user NibePi runs as. NibePi no
longer remounts the root filesystem: earlier versions assumed a read-only SD
card and bracketed every write in `sudo mount -o remount`, so `NIBEPI_DOCKER`
and the `system.readonly` and `system.docker` settings are gone.

## Enabling Modbus in the pump

Nothing works until the pump is told to talk. On the pump's own display:

1. Hold the **Back** button for about 7 seconds to reveal the service menu.
2. Go to **5.2 System settings** (on some models there is one more menu level).
3. Near the bottom of the list, tick **Modbus**.
4. The pump may show a red alarm until NibePi answers it, which can take a
   couple of minutes on first start.

For where to land the wires (12 V, A, B, GND) — it differs between models —
see Nibe's own documentation:
<https://www.nibe.fi/nibedocuments/15050/031725-6.pdf>

Photographs of the physical install are in the
[original repository](https://github.com/anerdins/nibepi).

## License

MIT, as upstream. See [LICENSE](LICENSE).
