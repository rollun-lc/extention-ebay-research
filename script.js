window.onload = main;
const rollunAPI = axios.create({
    baseURL: 'https://rollun.net',
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json'
    }
});

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

function setupShortcuts() {
    window.e = React.createElement;
    window.useState = React.useState;
}


function main() {
    setupShortcuts();

    const mountContainer = document.querySelectorAll('header')[1];
    const mountElement = document.createElement('div');
    mountElement.id = 'ebay-chrome-extension';
    insertAfter(mountContainer.firstElementChild, mountElement);

    ReactDOM.render(e(Control), mountElement);
}

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

function Modal({ isOpen, onSubmit, onCancel, initData }) {
    const textAreaRef = React.createRef(null);
    if (!isOpen) return null
        
    function handleSubmit() {
        onSubmit(textAreaRef.current.value);
    }

    return ReactDOM.createPortal(    
        e('div', { 
            style: {
                display: 'flex',
                flexDirection: 'column',
                position: 'absolute',
                zIndex: 999,
                top: 0,
                left: 0,
                width: 300,
                height: 500,
                background: 'white',
                padding: '10px',
            }
        },
            e('h3', {}, 'Insert list of inputs'),
            e('textarea', { ref: textAreaRef, rows: 40, defaultValue: initData }),
            e('div', {},
                e('button', { style: { marginTop: '10px', }, onClick: handleSubmit }, 'Load'),
                e('button', { style: { marginTop: '10px', }, onClick: onCancel }, 'Cancel'),
            )
        ),
        document.body
    );
}

function Control() {
    const [ data, setData ] = useState(null);
    const [ loadDataModalOpen, toggleModal ] = useState(false);
    const [ progress, setProgress ] = useState(null);

    function handleLoadData(value) {
        const inputs = value.split('\n');
        setData(inputs);
        setProgress(null);
        toggleModal(false)
    }

    async function selectCategory(category) {
        document
          .querySelector('.category-selector-panel__edit-button')
          ?.click();

        Array
          .from(
            document.querySelectorAll('[role="tree"] [role="treeitem"] .category-selection-row__category-name-value')
          )
          .find(({ innerText }) => new RegExp(category, 'ig').test(innerText))
          ?.click();

        document
          .querySelector('.category-selection-lightbox-dialog__footer-apply')
          ?.click();

        await wait(3000)
    }

    async function runSearch(searchString) {
        // insert input value
        const inputQ = '.textbox__control';
        const input = document.querySelector(inputQ);
        input.value = searchString;
        
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

        await wait(150);
        // trigger search
        const searchBtnQ = '.search-input-panel__research-button';
        const searchBtn = document.querySelector(searchBtnQ);
        searchBtn.click();

        await wait(4000);
    }

    async function handleStart() {
        let result = [];

        for (let idx = 0; idx < data.length; idx++) {
            const input = data[idx];
            setProgress({ text: `handling ${idx} input of total ${data.length}` });
            await runSearch(input);
            await selectCategory('ebay motors');
            const stats = parseStats(input);
            const items = await parseItemsList(stats.id);
            console.log('items', items);
            console.log('stats', stats);
            const listings = items.map(item => ({
                ...item,
                input,
                inputRowNumber: idx + 1,
            }))

            result.push(...listings);
            await rollunAPI.post('/api/datastore/EbayResearchRequests', stats);
            // did not find how to make multiCreate in datastore
            await Promise.all(
              items.map((item) =>
                rollunAPI.post('/api/datastore/EbayResearchResults', item)
              )
            )
        }
        setProgress(null);
        downloadDataWithContentType(arrayToCSV(result), 'text/csv', `ebay_research_items_list_${new Date().toISOString()}.csv`);
    }

    function handleStop() {
        // TODO
    }

    function parseStats(input) {
        const metricsContainer = document.querySelector('.aggregates');
        const dollarStringParser = (value, header) => ({ [header]: castDollarStringToNumber(value) });
        const numberStringParser = (value, header) => ({ [header]: castNumberStringToNumber(value) });
        const percentStringParser = (value, header) => ({ [header]: castPercentStringToNumber(value) });

        const parseStrategy = {
            avg_sold_price: dollarStringParser,
            avg_shipping: dollarStringParser,
            total_sales: dollarStringParser,
            free_shipping: percentStringParser,
            sell_through: percentStringParser,
            total_sold: numberStringParser,
            total_sellers: numberStringParser,
            sold_price_range: (value) => {
                const [min, max] = value.split('–');

                return {
                    sold_price_min: castDollarStringToNumber(min.trim()),
                    sold_price_max: castDollarStringToNumber(max.trim()),
                }
            }
        }

        if (!metricsContainer) {
            return null;
        }

        const stats = Array.from(metricsContainer.querySelectorAll('.aggregate-metric')).reduce((acc, curr) => {
            const value = curr.querySelector('.metric-value').innerText.trim();
            const header = curr.querySelector('.metric-title').innerText.trim();
            const snakeCaseHeader = toSnakeCase(header);

            return {
                ...acc,
                ...(parseStrategy[snakeCaseHeader](value, snakeCaseHeader)),
            }
        }, {})

        const currentDate = formatDate(new Date());

        return {
            id: `${input}#${currentDate}`,
            input,
            ...stats,
            is_parsed: true,
            parsed_at: currentDate,
        };
    }

    async function parseItemsList(statId) {
        const rows = document.querySelectorAll('.research-table-row');

        function parseRow(row) {
            const linkEl = row.querySelector('.research-table-row__product-info a');
            const link = linkEl.href;

            const titleEl = linkEl.querySelector('span');
            const id = titleEl.dataset.itemId;
            const title = titleEl.innerText;

            const avgPriceEl = row.querySelector('.research-table-row__avgSoldPrice');
            const price = castDollarStringToNumber(avgPriceEl.firstElementChild.firstElementChild.innerText);

            const avgShippingCostEl = row.querySelector('.research-table-row__avgShippingCost');
            const shipPrice = castDollarStringToNumber(avgShippingCostEl.firstElementChild.firstElementChild.innerText);

            const totalSoldEl = row.querySelector('.research-table-row__totalSoldCount');

            const lastDateSoldEl = row.querySelector('.research-table-row__dateLastSold');
            const lastDateSold = new Date(lastDateSoldEl.innerText);

            return { 
                id, 
                title,
                link, 
                avg_sold_price: price,
                avg_shipping: shipPrice,
                total_sold: +totalSoldEl.innerText,
                last_date_sold: formatDate(lastDateSold),
                parsed_at: formatDate(new Date()),
                request_id: statId
            };
        }

        return Array.from(rows).map(parseRow).filter(({ total_sold }) => total_sold > 5);
    }

    return e('div', {}, 
        e('button', { 
                disabled: !!progress,
                onClick: () => toggleModal(true)
            }, 
            'load data'
        ),
        progress    
            ? e('button', { onClick: handleStop }, 'stop')
            : e('button', { onClick: handleStart }, 'start'),
        progress && e('div', {}, progress.text),
        e(Modal, {
            initData: data ? data.join('\n') : undefined,
            isOpen: loadDataModalOpen,
            onSubmit: handleLoadData,
            onCancel: () => toggleModal(false),
        }),
        data && e('div', {}, `Loaded ${data.length} input(s)`),
    );
}

