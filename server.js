const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
const API_KEY = "d23b012bd4583641fe017e1434bac9871cc851b3"; 

// OPTIMIZED SEA BOX: Covers Thailand down to Java, and Andaman to Philippines
// Slightly smaller than before to prevent "Data Overload" errors
const BOUNDING_BOX = [[[-5.0, 95.0], [20.0, 130.0]]];

let ships = {};

function connectAIS() {
    console.log("Attempting to connect to AIS Satellite Feed...");
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

    ws.on('open', () => {
        console.log("SUCCESS: Connected to AISstream.");
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

                // Only store essential data to save memory
                ships[mmsi] = {
                    mmsi: mmsi,
                    name: (parsed.MetaData && parsed.MetaData.ShipName) ? parsed.MetaData.ShipName.trim() : "Unknown",
                    lat: r.Latitude,
                    lon: r.Longitude,
                    sog: r.Sog || 0,
                    cog: r.Cog || 0,
                    lastSeen: Date.now()
                };
            }
        } catch (err) {}
    });

    ws.on('close', (code) => {
        console.log(`Connection Closed (Code: ${code}). Reconnecting in 10s...`);
        // If code is 1008, it means API Key is already in use elsewhere
        setTimeout(connectAIS, 10000); 
    });

    ws.on('error', (err) => {
        console.error("Satellite Feed Error:", err.message);
        ws.terminate();
    });
}

// Aggressive Memory Cleanup (Removes ships not seen in 3 minutes)
setInterval(() => {
    const now = Date.now();
    let count = 0;
    for (const mmsi in ships) {
        if (now - ships[mmsi].lastSeen > 180000) {
            delete ships[mmsi];
        } else {
            count++;
        }
    }
    console.log(`Live Inventory: ${count} ships tracked.`);
}, 30000);

connectAIS();

app.get('/ais/latest', (req, res) => res.json(Object.values(ships)));

app.listen(PORT, () => console.log(`Proxy active on port ${PORT}`));
