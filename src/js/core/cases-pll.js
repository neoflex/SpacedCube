// SpacedCube core. No DOM: runs in the browser and in Node (tests).
// The 21 PLL cases (standard set).

export const PLL_DEF = {
  name: 'PLL', kind: 'pll', stripCols: 21, first: 'T',
  label: (id) => id + ' perm',
  GROUPS: ['Edges only', 'Corners only', 'Adjacent corner swap', 'Diagonal corner swap', 'G perms'],
  RAW: [
    ['Ua', 'Edges only', "R U' R U R U R U' R' U' R2"],
    ['Ub', 'Edges only', "R2 U R U R' U' R' U' R' U R'"],
    ['H', 'Edges only', "M2 U M2 U2 M2 U M2"],
    ['Z', 'Edges only', "M' U M2 U M2 U M' U2 M2"],
    ['Aa', 'Corners only', "x L2 D2 L' U' L D2 L' U L' x'"],
    ['Ab', 'Corners only', "x' L2 D2 L U L' D2 L U' L x"],
    ['E', 'Corners only', "x' L' U L D' L' U' L D L' U' L D' L' U L D x"],
    ['T', 'Adjacent corner swap', "R U R' U' R' F R2 U' R' U' R U R' F'"],
    ['F', 'Adjacent corner swap', "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"],
    ['Ja', 'Adjacent corner swap', "L' U' L F L' U' L U L F' L2 U L"],
    ['Jb', 'Adjacent corner swap', "R U R' F' R U R' U' R' F R2 U' R'"],
    ['Ra', 'Adjacent corner swap', "R U' R' U' R U R D R' U' R D' R' U2 R'"],
    ['Rb', 'Adjacent corner swap', "R2 F R U R U' R' F' R U2 R' U2 R"],
    ['Y', 'Diagonal corner swap', "F R U' R' U' R U R' F' R U R' U' R' F R F'"],
    ['V', 'Diagonal corner swap', "R' U R' U' y R' F' R2 U' R' U R' F R F"],
    ['Na', 'Diagonal corner swap', "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"],
    ['Nb', 'Diagonal corner swap', "R' U R U' R' F' U' F R U R' F R' F' R U' R"],
    ['Ga', 'G perms', "R2 U R' U R' U' R U' R2 U' D R' U R D'"],
    ['Gb', 'G perms', "R' U' R U D' R2 U R' U R U' R U' R2 D"],
    ['Gc', 'G perms', "R2 U' R U' R U R' U R2 U D' R U' R' D"],
    ['Gd', 'G perms', "R U R' U' D R2 U' R U' R' U R' U R2 D'"],
  ],
  NICK: {},
  INTRO_ORDER: ['T', 'Ua', 'Ub', 'Aa', 'Ab', 'H', 'Z', 'Jb', 'Ja', 'Y', 'F', 'Ra', 'Rb', 'V', 'E', 'Na', 'Nb', 'Ga', 'Gb', 'Gc', 'Gd'],
  sortIds: (ids) => ids,
};
