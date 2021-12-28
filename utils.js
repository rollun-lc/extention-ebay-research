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

function insertAfter(referenceNode, newNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

// Sold price range - sold_price_range
// Sell-through - sell_through
function toSnakeCase(inputString) {
  return inputString.replace(/(\s+|[^\w+])/gi, '_').toLowerCase();
}
