function castDollarStringToNumber(dollarString) {
  return castNumberStringToNumber(dollarString.replace('$', ''));
}

function castPercentStringToNumber(percentString) {
  return +percentString.replace('%', '') / 100;
}

function castNumberStringToNumber(numberString) {
  return +numberString.replaceAll(',', '')
}

function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

const dollarStringParser = (value, header) => ({ [header]: castDollarStringToNumber(value) });
const numberStringParser = (value, header) => ({ [header]: castNumberStringToNumber(value) });
const percentStringParser = (value, header) => ({ [header]: castPercentStringToNumber(value) });

async function wait(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(), ms));
}

function totalSoldMoreThan(number) {
  return item => item.total_sold > number;
}

function isNotEmpty(field) {
  return item => Boolean(item[field]);
}

function matches(item, field, regexp) {
  const fieldValue = (item[field] ?? '').toString();

  console.log('matches', regexp, fieldValue, regexp.test(fieldValue));

  return regexp.test(fieldValue);
}

function fieldNotMatches(field, regexp) {
  return item => !matches(item, field, regexp);
}

const filterRules = [
  totalSoldMoreThan(5),
  isNotEmpty('mpn'),
  fieldNotMatches('mpn', /does not apply/ig),
  fieldNotMatches('mpn', /null/ig),
  fieldNotMatches('mpn', /,/ig),
  fieldNotMatches('mpn', / and /ig),
  fieldNotMatches('mpn', /\//ig),
]

// Sold price range - sold_price_range
// Sell-through - sell_through
function toSnakeCase(inputString) {
  return inputString.replace(/(\s+|[^\w+])/gi, '_').toLowerCase();
}
