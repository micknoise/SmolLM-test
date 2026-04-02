// ASCII map renderer — renders the local map around the player

const BOX = {
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  h: '─', v: '│', cross: '┼',
  t: '┬', b: '┴', l: '├', r: '┤',
};

export function renderMap(state) {
  if (!state || !state.rooms) return [];

  const { rooms, currentRoom } = state;

  // Build grid bounds
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const [, room] of rooms) {
    if (!room.visited) continue;
    minX = Math.min(minX, room.coords.x);
    maxX = Math.max(maxX, room.coords.x);
    minY = Math.min(minY, room.coords.y);
    maxY = Math.max(maxY, room.coords.y);
  }

  // Cell size in chars: each room is 5 wide, 3 tall; corridor is 1 char
  const CELL_W = 7;
  const CELL_H = 4;
  const cols = (maxX - minX + 1);
  const rows = (maxY - minY + 1);
  const gridW = cols * CELL_W;
  const gridH = rows * CELL_H;

  // Fill with spaces
  const grid = Array.from({ length: gridH }, () => Array(gridW).fill(' '));

  function set(gx, gy, ch) {
    if (gy >= 0 && gy < gridH && gx >= 0 && gx < gridW) {
      grid[gy][gx] = ch;
    }
  }

  function setStr(gx, gy, str) {
    for (let i = 0; i < str.length; i++) set(gx + i, gy, str[i]);
  }

  function roomOrigin(room) {
    const cx = (room.coords.x - minX) * CELL_W;
    const cy = (room.coords.y - minY) * CELL_H;
    return { cx, cy };
  }

  // Draw rooms
  for (const [id, room] of rooms) {
    if (!room.visited) continue;
    const { cx, cy } = roomOrigin(room);
    const isCurrent = id === currentRoom;

    // Box
    set(cx, cy, BOX.tl);
    set(cx + 4, cy, BOX.tr);
    set(cx, cy + 2, BOX.bl);
    set(cx + 4, cy + 2, BOX.br);
    setStr(cx + 1, cy, BOX.h + BOX.h + BOX.h);
    setStr(cx + 1, cy + 2, BOX.h + BOX.h + BOX.h);
    set(cx, cy + 1, BOX.v);
    set(cx + 4, cy + 1, BOX.v);

    // Interior symbol
    const sym = isCurrent ? '@' : room.encounter && !room.encounter.resolved ? '!' : '.';
    set(cx + 1, cy + 1, ' ');
    set(cx + 2, cy + 1, sym);
    set(cx + 3, cy + 1, ' ');

    // Corridors to neighbours
    const { north, south, east, west } = room.doors;

    if (north && north !== 'pending') {
      set(cx + 2, cy - 1, '│');
    } else if (north === 'pending') {
      set(cx + 2, cy - 1, '?');
    }

    if (south && south !== 'pending') {
      set(cx + 2, cy + 3, '│');
    } else if (south === 'pending') {
      set(cx + 2, cy + 3, '?');
    }

    if (east && east !== 'pending') {
      set(cx + 5, cy + 1, '─');
      set(cx + 6, cy + 1, '─');
    } else if (east === 'pending') {
      set(cx + 5, cy + 1, '?');
    }

    if (west && west !== 'pending') {
      set(cx - 1, cy + 1, '─');
      set(cx - 2, cy + 1, '─');
    } else if (west === 'pending') {
      set(cx - 1, cy + 1, '?');
    }
  }

  // Draw pending rooms (unvisited but known)
  for (const [, room] of rooms) {
    if (!room.visited) continue;
    const { cx, cy } = roomOrigin(room);

    const checkPending = (dir, dx, dy) => {
      if (room.doors[dir] !== 'pending') return;
      const nx = cx + dx;
      const ny = cy + dy;
      // Draw a small ? box
      if (ny >= 0 && ny + 2 < gridH && nx >= 0 && nx + 4 < gridW) {
        set(nx, ny, BOX.tl);
        set(nx + 4, ny, BOX.tr);
        set(nx, ny + 2, BOX.bl);
        set(nx + 4, ny + 2, BOX.br);
        setStr(nx + 1, ny, BOX.h + BOX.h + BOX.h);
        setStr(nx + 1, ny + 2, BOX.h + BOX.h + BOX.h);
        set(nx, ny + 1, BOX.v);
        set(nx + 4, ny + 1, BOX.v);
        set(nx + 2, ny + 1, '?');
      }
    };

    checkPending('north', cx, cy - CELL_H);
    checkPending('south', cx, cy + CELL_H);
    checkPending('east', cx + CELL_W, cy);
    checkPending('west', cx - CELL_W, cy);
  }

  return grid.map(row => row.join(''));
}

export function renderMapString(state) {
  return renderMap(state).join('\n');
}
