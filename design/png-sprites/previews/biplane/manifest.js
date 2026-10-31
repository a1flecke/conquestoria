window.STRIP_MANIFEST = {
  "id": "biplane",
  "family": "aircraft",
  "cellWidth": 240,
  "cellHeight": 192,
  "cols": 8,
  "rows": 10,
  "baseline": 176,
  "restHeight": 70.0,
  "states": {
    "idle": {
      "row": 0,
      "frames": 1,
      "fps": 4,
      "loop": true,
      "note": ""
    },
    "damage": {
      "row": 1,
      "frames": 4,
      "fps": 1,
      "loop": false,
      "note": "idle pose at damage tiers 0-3"
    },
    "move": {
      "row": 2,
      "frames": 8,
      "fps": 12,
      "loop": true,
      "note": "heave, nose pitch and a spinning propeller built in code from the master and from each damage drawing"
    },
    "move@1": {
      "row": 3,
      "frames": 8,
      "fps": 12,
      "loop": true,
      "note": "heave, nose pitch and a spinning propeller built in code from the master and from each damage drawing"
    },
    "move@2": {
      "row": 4,
      "frames": 8,
      "fps": 12,
      "loop": true,
      "note": "heave, nose pitch and a spinning propeller built in code from the master and from each damage drawing"
    },
    "move@3": {
      "row": 5,
      "frames": 8,
      "fps": 12,
      "loop": true,
      "note": "heave, nose pitch and a spinning propeller built in code from the master and from each damage drawing"
    },
    "move@4": {
      "row": 6,
      "frames": 8,
      "fps": 12,
      "loop": true,
      "note": "heave, nose pitch and a spinning propeller built in code from the master and from each damage drawing"
    },
    "fire": {
      "row": 7,
      "frames": 8,
      "fps": 8,
      "loop": false,
      "note": "nose-gun flash and a small kick built in code"
    },
    "hit": {
      "row": 8,
      "frames": 4,
      "fps": 8,
      "loop": false,
      "note": "the aircraft jolted and the nose dipped, built in code"
    },
    "down": {
      "row": 9,
      "frames": 3,
      "fps": 4,
      "loop": false,
      "note": ""
    }
  },
  "sheet": "sheet.png",
  "mask": "mask.png",
  "facing": "right",
  "tiers": {
    "move": [
      "move",
      "move@1",
      "move@2",
      "move@3",
      "move@4"
    ]
  }
};
