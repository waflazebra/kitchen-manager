// Example data so the prototype opens in a working state.
// Everything here is made up except the menu — replace it in Settings.

function makeSeed() {
  const school = {
    id: 'happy-hollow',
    name: 'Happy Hollow School',
    mvSlug: 'HappyHollowSchool',
    example: true,
    settings: {
      extraPct: 8,        // default extras when a dish has no history yet
      extraMin: 2,        // never plan fewer extras than this (when anyone ordered it)
      breakfastExtraPct: 10,
      chocShare: 60,      // % of milk that is chocolate
      orderDays: 10,      // school days the order request covers
      estimate: { main: 185, 'alt:Toasted Cheese': 24, 'alt:Sunbutter & Jelly': 18, 'alt:Chicken Salad': 9, 'alt:Veggie Salad': 7, breakfast: 60 },
    },
    alternates: ['Toasted Cheese', 'Sunbutter & Jelly', 'Chicken Salad', 'Veggie Salad'],
    classes: [],
    menus: {},
    menusFetched: {},
    counts: {},
    extrasOverride: {},
    served: {},
    history: [],
    recipes: {},
    inventory: [],
    log: [],
    orders: [],
  };

  // Classes per grade, with placeholder teacher names.
  const perGrade = { K: 2, 1: 2, 2: 3, 3: 3, 4: 2, 5: 3 };
  let n = 0;
  for (const g of ['K', '1', '2', '3', '4', '5']) for (const t of ['A', 'B', 'C'].slice(0, perGrade[g])) {
    school.classes.push({ id: 'c' + (++n), grade: g, teacher: 'Class ' + t });
  }

  // Inventory: base unit is what recipes use; pack is how it arrives.
  const inv = [
    ['bread', 'Whole wheat bread', 'Dry', 'slice', 'case', 120, 640, 240],
    ['cheese', 'American cheese', 'Cooler', 'slice', 'case', 480, 760, 480],
    ['butter', 'Butter blend', 'Cooler', 'oz', 'case', 576, 410, 200],
    ['soup', 'Tomato soup (condensed)', 'Dry', 'cup', 'case', 48, 70, 48],
    ['orange', 'Oranges', 'Cooler', 'each', 'case', 88, 96, 60],
    ['milk1', '1% milk', 'Cooler', 'carton', 'case', 50, 210, 150],
    ['milkc', 'Chocolate milk', 'Cooler', 'carton', 'case', 50, 140, 200],
    ['fruit', 'Assorted fresh fruit', 'Cooler', 'piece', 'case', 100, 180, 100],
    ['apple', 'Local apples', 'Cooler', 'each', 'case', 100, 150, 100],
    ['pear', 'Pears', 'Cooler', 'each', 'case', 100, 60, 100],
    ['cheerios', 'Whole grain Cheerios bowl', 'Dry', 'each', 'case', 96, 120, 60],
    ['cornflakes', 'Corn flakes bowl', 'Dry', 'each', 'case', 96, 70, 60],
    ['ctc', 'WW Cinnamon Toast Crunch bowl', 'Dry', 'each', 'case', 96, 90, 60],
    ['cocopuff', 'Whole grain Coco Puffs bowl', 'Dry', 'each', 'case', 96, 40, 60],
    ['yogurt', 'Yogurt cup', 'Cooler', 'each', 'case', 48, 75, 60],
    ['stringch', 'String cheese', 'Cooler', 'each', 'case', 168, 190, 120],
    ['bagel', 'Bagels', 'Freezer', 'each', 'case', 72, 80, 60],
    ['creamch', 'Cream cheese cup', 'Cooler', 'each', 'case', 100, 85, 60],
    ['patty', 'Beef patty with cheese', 'Freezer', 'each', 'case', 96, 230, 192],
    ['bun', 'Whole wheat roll', 'Dry', 'each', 'case', 96, 250, 192],
    ['celery', 'Celery sticks', 'Cooler', 'oz', 'case', 320, 700, 320],
    ['chickpea', 'Chick peas, canned', 'Dry', 'cup', 'case', 72, 150, 72],
    ['mixfruit', 'Mixed fruit, canned', 'Dry', 'cup', 'case', 72, 140, 72],
    ['waffle', 'Dutch waffles', 'Freezer', 'each', 'case', 144, 260, 144],
    ['sausage', 'Chicken sausage', 'Freezer', 'each', 'case', 160, 180, 160],
    ['tots', 'Tater tots', 'Freezer', 'cup', 'case', 90, 200, 90],
    ['lasagna', 'Lasagna rolls', 'Freezer', 'each', 'case', 96, 200, 192],
    ['dinnerroll', 'WW dinner roll', 'Dry', 'each', 'case', 120, 160, 120],
    ['calblend', 'California blend veggies', 'Freezer', 'cup', 'case', 96, 190, 96],
    ['peach', 'Peaches, canned', 'Dry', 'cup', 'case', 72, 110, 72],
    ['pizza', 'Pizza slices', 'Freezer', 'slice', 'case', 96, 150, 192],
    ['kale', 'Kale', 'Cooler', 'oz', 'case', 160, 90, 80],
    ['romaine', 'Romaine', 'Cooler', 'oz', 'case', 360, 520, 360],
    ['caesar', 'Caesar dressing', 'Cooler', 'oz', 'case', 512, 300, 256],
    ['sunbutter', 'Sunbutter', 'Dry', 'oz', 'case', 480, 140, 240],
    ['jelly', 'Grape jelly', 'Dry', 'oz', 'case', 384, 260, 192],
    ['chsalad', 'Chicken salad', 'Cooler', 'oz', 'case', 160, 70, 80],
    ['tomato', 'Cherry tomatoes', 'Cooler', 'oz', 'case', 160, 120, 80],
    ['cucumber', 'Cucumbers', 'Cooler', 'oz', 'case', 320, 200, 80],
  ];
  school.inventory = inv.map(([id, name, loc, unit, packName, packSize, onHand, par]) => ({ id, name, loc, unit, packName, packSize, onHand, par }));

  // Recipes: amount of each ingredient per serving. Some dishes are left without a recipe on purpose.
  const r = (name, ings, notes = '') => { school.recipes[name.toLowerCase()] = { name, ingredients: ings.map(([inv, qty]) => ({ inv, qty })), notes }; };
  r('Grilled Cheese Sandwich', [['bread', 2], ['cheese', 2], ['butter', 0.25]], 'Butter outside, griddle 350°F, 2 min per side.');
  r('Toasted Cheese', [['bread', 2], ['cheese', 2], ['butter', 0.25]]);
  r('Tomato Soup', [['soup', 0.25]], 'Condensed: 1 cup makes 4 servings with water.');
  r('Orange Smiles', [['orange', 0.5]]);
  r('1% Milk', [['milk1', 1]]);
  r('Chocolate Milk', [['milkc', 1]]);
  r('Whole Grain Cheerios', [['cheerios', 1]]);
  r('Yogurt & Corn Flakes', [['yogurt', 1], ['cornflakes', 1]]);
  r('WW Cinnamon Toast Crunch', [['ctc', 1]]);
  r('Whole Grain Coco Puff', [['cocopuff', 1]]);
  r('Bagel & Cream Cheese', [['bagel', 1], ['creamch', 1]]);
  r('String Cheese', [['stringch', 1]]);
  r('Assorted Fresh Fruit', [['fruit', 1]]);
  r('Beef Patty with Cheese on Whole Wheat Roll', [['patty', 1], ['bun', 1]]);
  r('Celery Sticks', [['celery', 3]]);
  r('Roasted Chick Peas', [['chickpea', 0.5]]);
  r('Mixed Fruit', [['mixfruit', 0.5]]);
  r('Sunbutter & Jelly', [['bread', 2], ['sunbutter', 1.5], ['jelly', 1]]);
  r('Chicken Salad', [['chsalad', 3], ['romaine', 2], ['tomato', 0.5]]);
  r('Veggie Salad', [['romaine', 3], ['tomato', 1], ['cucumber', 1]]);
  r("Big Daddy's Pizza", [['pizza', 1]]);
  r('Peaches', [['peach', 1]]);
  r('Fresh Pear', [['pear', 1]]);

  // Leftover history from past weeks, which the extras suggestion learns from.
  const hist = [
    ['2026-10-26', 'Grilled Cheese Sandwich', 192, 208, 7, 0],
    ['2026-10-30', "Big Daddy's Pizza", 201, 217, 0, 9],
    ['2026-11-06', "Big Daddy's Pizza", 196, 212, 0, 6],
    ['2026-11-11', 'Grilled Cheese Sandwich', 188, 204, 5, 0],
  ];
  const altHist = { 'Toasted Cheese': [25, 2, 0, 3], 'Sunbutter & Jelly': [18, 2, 3, 0], 'Chicken Salad': [9, 2, 1, 0], 'Veggie Salad': [7, 2, 0, 1] };
  const pastDays = ['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13'];
  for (const [date, dish, ordered, made, leftover, short] of hist) school.history.push({ date, dish, ordered, made, leftover, short });
  pastDays.forEach((date, i) => {
    for (const [dish, [ord, ex, left, short]] of Object.entries(altHist)) {
      const o = ord + ((i * 3) % 4) - 1;
      school.history.push({ date, dish, ordered: o, made: o + ex, leftover: Math.max(0, left - (i % 2)), short: short ? short + (i % 2) : 0 });
    }
  });

  // Inventory activity for the past two weeks.
  const L = (date, inv, type, qty, note = '') => school.log.push({ id: 'seed' + school.log.length, date, inv, type, qty, note });
  L('2026-11-09', 'milk1', 'restock', 300, 'Weekly dairy delivery');
  L('2026-11-09', 'milkc', 'restock', 400, 'Weekly dairy delivery');
  L('2026-11-09', 'bread', 'restock', 600);
  L('2026-11-10', 'cheese', 'restock', 960);
  L('2026-11-12', 'romaine', 'restock', 720, 'Produce');
  L('2026-11-12', 'fruit', 'restock', 400, 'Produce');
  for (const d of pastDays) {
    L(d, 'milk1', 'use', -88); L(d, 'milkc', 'use', -132); L(d, 'bread', 'use', -96);
    L(d, 'fruit', 'use', -70); L(d, 'romaine', 'use', -48); L(d, 'cheese', 'use', -60);
  }
  L('2026-11-13', 'milkc', 'count', -12, 'Friday count: 12 short (spoiled)');

  // Today's sheets: 12 of 15 classes are in. Grade 4 / Class A follows the sample paper sheet.
  const today = '2026-11-16';
  const c = { classes: {}, staff: { main: 3, 'alt:Veggie Salad': 2 }, breakfast: 62 };
  school.classes.slice(0, 12).forEach((cl, i) => {
    if (cl.grade === '4' && cl.teacher === 'Class A') { c.classes[cl.id] = { main: 4, 'alt:Chicken Salad': 2, 'alt:Veggie Salad': 1 }; return; }
    const row = { main: 9 + ((i * 5) % 7) };
    if (i % 2 === 0) row['alt:Toasted Cheese'] = 1 + (i % 3);
    if (i % 3 === 0) row['alt:Sunbutter & Jelly'] = 1 + (i % 2);
    if (i % 5 === 1) row['alt:Chicken Salad'] = 1;
    if (i % 4 === 2) row['alt:Veggie Salad'] = 1;
    c.classes[cl.id] = row;
  });
  school.counts[today] = c;

  return { version: 1, current: school.id, schools: { [school.id]: school } };
}
