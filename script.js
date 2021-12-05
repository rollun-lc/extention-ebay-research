window.onload = main;

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

// start link - https://www.ebay.com/sh/research?marketplace=EBAY-US&keywords=stub&dayRange=30&categoryId=6000&offset=0&limit=50

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
    const [ data, setData ] = useState(['ACERBIS']);
    const [ loadDataModalOpen, toggleModal ] = useState(false);
    const [ progress, setProgress ] = useState(null);

    function handleLoadData(value) {
        const inputs = value.split('\n');
        setData(inputs);
        setProgress(null);
        toggleModal(false)
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

        await wait(2500);
    }

    async function handleStart() {
        let result = [];
        for (const input of data) {
            setProgress({ text: `handling ${0} input of total ${data.length}` });
            await runSearch(data[0]);
            result.push(...(await parseItemsList()));
        }
        setProgress(null);
        console.log(result);
        // downloadDataWithContentType(arrayToCSV(result), 'text/csv', `ebay_research_items_list_${new Date().toISOString()}.csv`);
    }

    function handleStop() {
        // TODO
    }

    function parseStats() {
        // TODO: add parsing for total stats of search
    }

    async function parseItemsList() {
        const rows = document.querySelectorAll('.research-table-row');

        function parseRow(row) {
            const linkEl = row.querySelector('.research-table-row__product-info a');
            const link = linkEl.href;

            const titleEl = linkEl.querySelector('span');
            const id = titleEl.dataset.itemId;
            const title = titleEl.innerText;

            const avgPriceEl = row.querySelector('.research-table-row__avgSoldPrice');
            const price = avgPriceEl.firstElementChild.firstElementChild.innerText.replace('$', '').replaceAll(',', '');

            const avgShippingCostEl = row.querySelector('.research-table-row__avgShippingCost');
            const shipPrice = avgShippingCostEl.firstElementChild.firstElementChild.innerText.replace('$', '').replaceAll(',', '');

            const totalSoldEl = row.querySelector('.research-table-row__totalSoldCount');

            const lastDateSoldEl = row.querySelector('.research-table-row__dateLastSold');
            const lastDateSold = new Date(lastDateSoldEl.innerText);

            return { 
                id, 
                title, 
                link, 
                avgSoldPrice: +price, 
                avgShipping: +shipPrice, 
                totalSold: +totalSoldEl.innerText,
                lastDateSold: lastDateSold.toISOString().slice(0, 10)
            };
        }

        return Array.from(rows).map(parseRow);
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
