function castDollarStringToNumber(dollarString) {
  return castNumberStringToNumber(dollarString.replace('$', ''));
}

function castPercentStringToNumber(percentString) {
  return +percentString.replace('%', '') / 100;
}

function castNumberStringToNumber(numberString) {
  return +numberString.replaceAll(',', '');
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

const dollarStringParser = (value, header) => ({
  [header]: castDollarStringToNumber(value),
});
const numberStringParser = (value, header) => ({
  [header]: castNumberStringToNumber(value),
});
const percentStringParser = (value, header) => ({
  [header]: castPercentStringToNumber(value),
});

async function wait(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(), ms));
}

async function waitWithProgress(timeMs, progressCallback) {
  let delayBeforeNext = timeMs;
  const sec = 1000;
  while (delayBeforeNext > 0) {
    progressCallback(Math.ceil(delayBeforeNext / sec));
    await wait(sec);
    delayBeforeNext -= sec;
  }
}

function totalSoldMoreThan(number) {
  return (item) => item.total_sold > number;
}

function isNotEmpty(field) {
  return (item) => Boolean(item[field]);
}

function matches(item, field, regexp) {
  const fieldValue = (item[field] ?? '').toString();

  console.log('matches', regexp, fieldValue, regexp.test(fieldValue));

  return regexp.test(fieldValue);
}

function fieldNotMatches(field, regexp) {
  return (item) => !matches(item, field, regexp);
}

const filterRules = [
  totalSoldMoreThan(5),
  isNotEmpty('mpn'),
  fieldNotMatches('mpn', /does not apply/gi),
  fieldNotMatches('mpn', /null/gi),
  fieldNotMatches('mpn', /,/gi),
  fieldNotMatches('mpn', / and /gi),
  fieldNotMatches('mpn', /\//gi),
];

// Sold price range - sold_price_range
// Sell-through - sell_through
function toSnakeCase(inputString) {
  return inputString.replace(/(\s+|[^\w+])/gi, '_').toLowerCase();
}
