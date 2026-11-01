window.STRIP_MANIFEST = {
  "id": "horseman",
  "family": "mounted",
  "cellWidth": 240,
  "cellHeight": 192,
  "cols": 8,
  "rows": 10,
  "baseline": 176,
  "restHeight": 150.0,
  "states": {
    "idle": {
      "row": 0,
      "frames": 1,
      "fps": 4,
      "loop": true,
      "note": "anchored on the torso like the walk, so the unit does not jump when it starts to move"
    },
    "damage": {
      "row": 1,
      "frames": 4,
      "fps": 1,
      "loop": false,
      "note": "idle pose at damage tiers 0-3, anchored on the torso like the walk"
    },
    "walkrig": {
      "row": 2,
      "frames": 8,
      "fps": 10,
      "loop": true,
      "note": "walk built in code from the master and from each damage drawing; the four legs alternate by construction"
    },
    "walkrig@1": {
      "row": 3,
      "frames": 8,
      "fps": 10,
      "loop": true,
      "note": "walk built in code from the master and from each damage drawing; the four legs alternate by construction"
    },
    "walkrig@2": {
      "row": 4,
      "frames": 8,
      "fps": 10,
      "loop": true,
      "note": "walk built in code from the master and from each damage drawing; the four legs alternate by construction"
    },
    "walkrig@3": {
      "row": 5,
      "frames": 8,
      "fps": 10,
      "loop": true,
      "note": "walk built in code from the master and from each damage drawing; the four legs alternate by construction"
    },
    "walkrig@4": {
      "row": 6,
      "frames": 8,
      "fps": 10,
      "loop": true,
      "note": "walk built in code from the master and from each damage drawing; the four legs alternate by construction"
    },
    "attack": {
      "row": 7,
      "frames": 6,
      "fps": 9,
      "loop": false,
      "note": ""
    },
    "hit": {
      "row": 8,
      "frames": 4,
      "fps": 8,
      "loop": false,
      "note": ""
    },
    "defeat": {
      "row": 9,
      "frames": 4,
      "fps": 5,
      "loop": false,
      "note": ""
    }
  },
  "sheet": "sheet.png",
  "mask": "mask.png",
  "facing": "right",
  "tiers": {
    "walkrig": [
      "walkrig",
      "walkrig@1",
      "walkrig@2",
      "walkrig@3",
      "walkrig@4"
    ]
  }
};
