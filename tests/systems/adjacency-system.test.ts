import {
  ADJACENCY_RULES,
  calculateAdjacencyBonuses,
  findOptimalSlot,
  getTotalAdjacencyYields,
} from '@/systems/adjacency-system';

describe('adjacency system', () => {
  describe('ADJACENCY_RULES', () => {
    it('has rules defined', () => {
      expect(ADJACENCY_RULES.length).toBeGreaterThan(0);
    });

    it('library gets bonus from city-center', () => {
      const rule = ADJACENCY_RULES.find(
        r => r.building === 'library' && r.adjacentTo === 'city-center',
      );
      expect(rule).toBeDefined();
      expect(rule!.bonus.science).toBeGreaterThan(0);
    });
  });

  describe('calculateAdjacencyBonuses', () => {
    it('returns bonuses for adjacent buildings', () => {
      // 5x5 grid with library adjacent to city-center
      const grid: (string | null)[][] = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => null),
      );
      grid[2][2] = 'city-center';
      grid[2][1] = 'library';

      const bonuses = calculateAdjacencyBonuses(grid, 3);
      const libraryBonus = bonuses['2,1'];
      expect(libraryBonus).toBeDefined();
      expect(libraryBonus.science).toBeGreaterThan(0);
    });

    it('returns empty bonus for buildings with no adjacency match', () => {
      const grid: (string | null)[][] = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => null),
      );
      grid[2][2] = 'city-center';
      grid[1][1] = 'barracks'; // barracks has bonus with walls, not city-center

      const bonuses = calculateAdjacencyBonuses(grid, 3);
      const barracksBonus = bonuses['1,1'];
      // barracks doesn't have a rule for city-center adjacency
      if (barracksBonus) {
        expect(barracksBonus.food + barracksBonus.production + barracksBonus.gold + barracksBonus.science).toBe(0);
      }
    });

    it('uses the centered unlocked area on 7x7 city grids', () => {
      const grid: (string | null)[][] = Array.from({ length: 7 }, () =>
        Array.from({ length: 7 }, () => null),
      );
      grid[3][3] = 'city-center';
      grid[4][3] = 'library';

      const bonuses = calculateAdjacencyBonuses(grid, 3);

      expect(bonuses['4,3'].science).toBeGreaterThan(0);
    });
  });

  describe('findOptimalSlot', () => {
    it('finds an empty slot', () => {
      const grid: (string | null)[][] = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => null),
      );
      grid[2][2] = 'city-center';

      const slot = findOptimalSlot(grid, 3, 'library');
      expect(slot).not.toBeNull();
      expect(grid[slot!.row][slot!.col]).toBeNull();
    });

    it('returns null when grid is full', () => {
      const grid: (string | null)[][] = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => 'city-center'),
      );

      const slot = findOptimalSlot(grid, 5, 'library');
      expect(slot).toBeNull();
    });
  });

  describe('getTotalAdjacencyYields', () => {
    it('sums all adjacency bonuses', () => {
      const grid: (string | null)[][] = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => null),
      );
      grid[2][2] = 'city-center';
      grid[2][1] = 'library';

      const yields = getTotalAdjacencyYields(grid, 3);
      expect(yields.science).toBeGreaterThan(0);
    });
  });
});
