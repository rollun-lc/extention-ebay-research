window.onload = main;
const rollunAPI = axios.create({
    baseURL: 'https://rollun.net',
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json'
    }
});

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
    const [ progress, setProgress ] = useState(null);

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

    async function getDataToResearch() {
        const { data } = await rollunAPI.get('/api/datastore/EbayResearchRequests?eqn(parsed_at)');
        return data
          .sort((data1, data2) => {
            const [, date1] = data1.id.split('#');
            const [, date2] = data2.id.split('#');

            return new Date(date1) - new Date(date2);
          })
          .map(({ id }) => id.split('#')[0])
    }

    async function handleStart() {
        const dataToResearch = await getDataToResearch();
        setData(dataToResearch);

        let result = [];

        for (let idx = 0; idx < dataToResearch.length; idx++) {
            const input = dataToResearch[idx];
            setProgress({ text: `handling ${idx} input of total ${dataToResearch.length}` });
            await runSearch(input);
            await selectCategory('ebay motors');
            const stats = parseStats(input);
            const items = (await parseItemsList(stats.id)).filter(({ total_sold }) => total_sold > 5);
            console.log('items', items);
            console.log('stats', stats);
            const listings = items.map(item => ({
                ...item,
                input,
                inputRowNumber: idx + 1,
            }))

            result.push(...listings);
            try {
                await writeResearchRequestToDatastore(stats)
                await writeResearchResultsToDatastore(items);
            } catch (e) {
                alert(`Could not update research info ${e.message}`);
            }
        }
        setProgress(null);
        downloadDataWithContentType(arrayToCSV(result), 'text/csv', `ebay_research_items_list_${new Date().toISOString()}.csv`);
    }

    async function writeResearchResultsToDatastore(items) {
        // did not find how to make multiCreate in datastore
        await Promise.all(
          items.map((item) =>
            rollunAPI.post('/api/datastore/EbayResearchResults', item)
          )
        )
    }
    async function writeResearchRequestToDatastore(stats) {
        await rollunAPI.put('/api/datastore/EbayResearchRequests', stats);
    }

    function handleStop() {
        // TODO
    }

    function getStatsFromMetricContainer(container) {
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

        return Array.from(container.querySelectorAll('.aggregate-metric')).reduce((acc, curr) => {
            const value = curr.querySelector('.metric-value').innerText.trim();
            const header = curr.querySelector('.metric-title').innerText.trim();
            const snakeCaseHeader = toSnakeCase(header);

            return {
                ...acc,
                ...(parseStrategy[snakeCaseHeader](value, snakeCaseHeader)),
            }
        }, {})
    }

    function parseStats(input) {
        const metricsContainer = document.querySelector('.aggregates');
        if (!metricsContainer) {
            return null;
        }

        const stats = getStatsFromMetricContainer(metricsContainer);
        const currentDate = formatDate(new Date());

        return {
            id: `${input}#${currentDate}`,
            input,
            ...stats,
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

        return Array.from(rows).map(parseRow);
    }

    return e('div', {}, 
        progress
            ? e('button', { onClick: handleStop }, 'stop')
            : e('button', { onClick: handleStart }, 'start'),
        progress && e('div', {}, progress.text),
        data && e('div', {}, `Loaded ${data.length} input(s)`),
    );
}

