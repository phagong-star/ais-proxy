const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
const API_KEY = "d23b012bd4583641fe017e1434bac9871cc851b3"; 
const BOUNDING_BOX = [[[0.5, 97.0], [7.0, 105.5]]];

let ships = {};

function connectAIS() {
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

    ws.on('open', () => {
        console.log("Connected to AISstream.");
        ws.send(JSON.stringify({
            APIKey: API_KEY,
            BoundingBoxes: BOUNDING_BOX,
            FilterMessageTypes: ["PositionReport"]
        }));
    });

    ws.on('message', (data) => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.MessageType === "PositionReport") {
                const r = parsed.Message.PositionReport;
                const mmsi = r.UserID;
                if (!mmsi) return;

                ships[mmsi] = {
                    mmsi: mmsi,
                    name: (parsed.MetaData && parsed.MetaData.ShipName) ? parsed.MetaData.ShipName.trim() : "Unknown",
                    lat: r.Latitude,
                    lon: r.Longitude,
                    sog: r.Sog !== 1023 ? r.Sog : 0,
                    cog: r.Cog !== 511 ? r.Cog : 0,
                    lastSeen: Date.now()
                };
            }
        } catch (err) {}
    });

    ws.on('close', () => setTimeout(connectAIS, 5000));
    ws.on('error', () => ws.close());
}

setInterval(() => {
    const now = Date.now();
    for (const mmsi in ships) {
        if (now - ships[mmsi].lastSeen > 600000) delete ships[mmsi];
    }
}, 60000);

connectAIS();

app.get('/ais/latest', (req, res) => res.json(Object.values(ships)));

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
