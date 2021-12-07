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

function castValueToCSVValue(value) {
  if (typeof value === 'string') {
    return value.replace(/"/g, '""');
  } else if (typeof value === 'number') {
    return value.toString();
  } else {
    return JSON.stringify(value).replace(/"/g, '""');
  }
}

// Sold price range - sold_price_range
// Sell-through - sell_through
function toSnakeCase(inputString) {
  return inputString.replace(/(\s+|[^\w+])/gi, '_').toLowerCase();
}

/**
 * Data to CSV
 * Example:
 * const data = [{id: '1', field: '2'}, {id: '3', field: '4'}]
 * dataToCSV(data) -> 'id,field\n"1","2"\n"3","4"\n'
 */

function arrayToCSV(flatData) {
  if (flatData.length === 0) {
    return '';
  }
  const header = `"${Object.keys(flatData[0]).join('","')}"`;
  const data = flatData
    .map(row => Object.values(row).map(val => `"${castValueToCSVValue(val)}"`).join(','))
    .join('\n');
  return `${header}\n${data}`;
}

function downloadDataWithContentType(data, type, filename) {
  const binaryData = new Blob([data], {type: type});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(binaryData);
  link.download = filename;
  link.target = '_blank';
  link.click();
  URL.revokeObjectURL(link.href);
};
