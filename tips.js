// Starter kitchen tips. Each one shows up when a dish on the day's menu matches.
// "match": phrases separated by commas. A phrase matches when every word in it appears in the dish name.
// Kitchens can edit or hide these and add their own on the Tips tab.

const TIP_LIBRARY = [
  {
    id: 'cheeseburger',
    title: 'Cheeseburger day: cook patties plain',
    match: 'cheese patty, cheese burger, cheeseburger',
    text: 'Many kids don\'t want cheese. Cook every patty plain and add a cheese slice at the line when a student asks. The cheese melts on a hot patty in about a minute. Scraping cheese off wastes time and the slice.',
  },
  {
    id: 'burger-buns',
    title: 'Keep buns from getting soggy',
    match: 'patty, burger, sandwich roll, chicken sandwich',
    text: 'Warm buns separately and put burgers together close to serving time. A patty sitting in a closed bun gets soggy fast.',
  },
  {
    id: 'pizza',
    title: 'Pan pizza by topping',
    match: 'pizza',
    text: 'Cut and pan cheese and pepperoni (or other toppings) separately and label the pans, so the line doesn\'t slow down while kids pick. Bake in waves so the last lunch period gets hot slices too.',
  },
  {
    id: 'grilled-cheese',
    title: 'Grilled cheese: batch close to service',
    match: 'grilled cheese, toasted cheese',
    text: 'Griddle in batches as close to each lunch period as you can. Hold them in a pan that isn\'t covered tightly. A lid traps steam and makes the bread soggy.',
  },
  {
    id: 'soup',
    title: 'Soup goes faster on cold days',
    match: 'soup, chili, stew',
    text: 'On cold or rainy days more kids take soup. Have an extra batch ready to heat, and check it stays hot on the line.',
  },
  {
    id: 'taco',
    title: 'Toppings on the side',
    match: 'taco, nacho, burrito, quesadilla',
    text: 'Serve lettuce, tomato, cheese and salsa on the side instead of building them in. Kids take what they like and less gets thrown away.',
  },
  {
    id: 'salad',
    title: 'Dress salads at the last minute',
    match: 'salad, caesar',
    text: 'Keep greens cold until service and serve dressing on the side or add it right before serving. Dressed greens wilt quickly.',
  },
  {
    id: 'pasta',
    title: 'Hold a few plain portions',
    match: 'lasagna, pasta, spaghetti, ziti, macaroni, mac cheese, ravioli',
    text: 'Some kids won\'t eat sauce. Keep a few portions plain with sauce on the side. Bake lasagna rolls covered so they don\'t dry out, and uncover for the last few minutes.',
  },
  {
    id: 'waffles',
    title: 'Syrup runs out first',
    match: 'waffle, pancake, french toast',
    text: 'Count syrup cups separately from the waffles or pancakes. They tend to run out before the main item. Hold in a pan that isn\'t covered tightly so they stay crisp.',
  },
  {
    id: 'crispy',
    title: 'Keep crispy items crispy',
    match: 'nugget, tender, popcorn chicken, fish stick, tater tot, fries, tots',
    text: 'Bake in batches close to service and hold in a pan that isn\'t covered tightly. A tight lid traps steam and makes them soggy.',
  },
  {
    id: 'chickpeas',
    title: 'Roast chick peas until dry',
    match: 'chick pea, chickpea',
    text: 'Dry the chick peas well before roasting and let them cool on the sheet pan. Piling them up warm makes them steam and go soft.',
  },
  {
    id: 'kale-veg',
    title: 'Offer a taste of new vegetables',
    match: 'kale, brussels, beet, squash, roasted veg',
    text: 'Kids are more willing to take an unfamiliar vegetable after a small taste. Put out a few sample cups at the start of the line.',
  },
  {
    id: 'whole-fruit',
    title: 'Slice fruit for younger kids',
    match: 'apple, pear',
    text: 'Younger kids eat more fruit when it\'s sliced than when it\'s whole. Slice apples and pears for the youngest grades, and toss apple slices in a little lemon juice or water so they don\'t brown.',
  },
  {
    id: 'rolls',
    title: 'Cover rolls so they stay soft',
    match: 'dinner roll, bread stick, breadstick',
    text: 'Keep rolls covered until they go on the line. Uncovered rolls dry out quickly.',
  },
];
