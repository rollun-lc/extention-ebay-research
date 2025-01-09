window.onload = main;
const rollunAPI = axios.create({
  baseURL: 'https://rollun.net',
  headers: {
    Authorization: 'Basic MTE2OTg0MDk5MDM3MTI0MzU2NTY2Ojlxak5JdGZo',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

function setupShortcuts() {
  window.e = React.createElement;
  window.useState = React.useState;
}

function main() {
  setupShortcuts();

  const mountContainer = document.querySelector('.sh-core-layout__left');
  const mountElement = document.createElement('div');
  mountElement.id = 'ebay-chrome-extension';

  mountContainer.appendChild(mountElement);

  ReactDOM.render(e(Control), mountElement);
}

function Control() {
  const [data, setData] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [progress, setProgress] = useState(null);
  const [filterResults, setFilterResults] = useState(true);

  function toggleFilterResults() {
    setFilterResults((prev) => !prev);
  }

  async function selectCategory(category) {
    document.querySelector('.category-selector-panel__edit-button')?.click();

    Array.from(
      document.querySelectorAll(
        '[role="tree"] [role="treeitem"] .category-selection-row__category-name-value'
      )
    )
      .find(({ innerText }) => new RegExp(category, 'ig').test(innerText))
      ?.click();

    document
      .querySelector('.category-selection-lightbox-dialog__footer-apply')
      ?.click();

    await wait(4000);
  }

  async function runSearch(searchString) {
    // insert input value
    const inputQ = '.textbox__control';
    const input = document.querySelector(inputQ);
    input.value = searchString;

    input.dispatchEvent(
      new Event('input', { bubbles: true, cancelable: true })
    );

    await wait(150);
    // trigger search
    const searchBtnQ = '.search-input-panel__research-button';
    const searchBtn = document.querySelector(searchBtnQ);
    searchBtn.click();

    await wait(4000);
  }

  async function getDataToResearch(limit) {
    const { data } = await rollunAPI.get(
      '/api/datastore/EbayResearchRequests?eqn(parsed_at)&sort(-created_at)'
    );
    return data.slice(0, limit ?? data.length);
  }

  function isListingFoundInSearch() {
    const errorContainer = document.querySelector(
      '.sold-tab-content .research__generic-error'
    );
    return !errorContainer;
  }

  async function selectTab(tabName) {
    const [tabToSelect] = [...document.querySelector('.tabs__items')?.children]
      .filter(Boolean)
      .filter(({ innerText }) => innerText.trim() === tabName);

    if (!tabToSelect) {
      // if no tab is found, just ignore
      return;
    }

    tabToSelect.click();
    await wait(3000);
  }

  function selectFilter(filterName) {
    const [filterElement] = [
      ...document.querySelectorAll(
        '.research-table-header__inner-item > .text'
      ),
    ].filter((item) => item.innerText === filterName);
    const filterDownElement =
      filterElement?.parentElement.querySelector('.down');

    if (!filterDownElement) {
      filterElement?.click();
    }
  }

  function filterItems(items, rules) {
    return items.filter((item) => rules.every((rule) => rule(item)));
  }

  async function handleStart() {
    for (let idx = 0; idx < data.length; idx++) {
      const input = data[idx];
      const progressPrefix = `handling ${idx + 1}/${data.length} row`;
      try {
        setProgress({ text: `${progressPrefix}: click search` });

        await runSearch(input);

        if (!isListingFoundInSearch()) {
          await writeResearchRequestToDatastore({
            parsed_at: formatDate(new Date()),
          });
          continue;
        }

        setProgress({ text: `${progressPrefix}: select category` });
        await selectCategory('ebay motors');

        setProgress({ text: `${progressPrefix}: select filter` });
        selectFilter('Total sold');

        setProgress({ text: `${progressPrefix}: select tab` });
        await selectTab('Sold');

        setProgress({ text: `${progressPrefix}: parsing stats` });
        const stats = parseStats(input);

        setProgress({ text: `${progressPrefix}: parsing items` });
        const parsedItems = await parseAllItems(stats.id, (progressText) =>
          setProgress({ text: `${progressPrefix}: ${progressText}` })
        );
        const items = filterResults
          ? filterItems(parsedItems, filterRules)
          : parsedItems;

        stats.total_sold = items.reduce(
          (acc, curr) => acc + curr.total_sold,
          0
        );
        stats.total_sales = items.reduce(
          (acc, curr) => acc + curr.total_sales,
          0
        );

        console.log('items', items);
        console.log('stats', stats);

        setProgress({
          text: `${progressPrefix}: writing ${items.length} items to datastore`,
        });
        await writeResearchResultsToDatastore(items);

        setProgress({
          text: `${progressPrefix}: writing request to datastore`,
        });
        await writeResearchRequestToDatastore(stats);

        let delayBeforeNext = 4000;
        const sec = 1000;
        while (delayBeforeNext > 0) {
          setProgress({
            text: `${progressPrefix}: waiting ${
              delayBeforeNext / sec
            }s before next`,
          });
          await new Promise((resolve) => setTimeout(resolve, sec));
          delayBeforeNext -= sec;
        }

        setProgress({ text: `${progressPrefix}: done` });
      } catch (e) {
        console.log(e.stack);
        alert(`Could not parse item - ${input}. ${e.message}`);
      }
    }
    setProgress({ text: `Finished parsing ${data.length} rows` });
  }

  async function writeResearchResultsToDatastore(items) {
    // spit items into chunks
    const chunks = [];
    for (let i = 0; i < items.length; i += 100) {
      chunks.push(items.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      await rollunAPI.post('/api/datastore/EbayResearchResults', chunk);
    }
  }
  async function writeResearchRequestToDatastore(stats) {
    await rollunAPI.post(`/api/datastore/EbayResearchRequests`, stats, {
      // headers: {
      //     'If-Match': '*'
      // }
    });
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
        const [min, max] = value.split('-');
        return {
          sold_price_min: castDollarStringToNumber(min.trim()),
          sold_price_max: castDollarStringToNumber(max.trim()),
        };
      },
    };

    return Array.from(container.querySelectorAll('.aggregate-metric')).reduce(
      (acc, curr) => {
        const value = curr.querySelector('.metric-value').innerText.trim();
        const header = curr.querySelector('.metric-title').innerText.trim();
        const snakeCaseHeader = toSnakeCase(header);

        if (!(snakeCaseHeader in parseStrategy)) {
          return acc;
        }

        console.log('header', header, snakeCaseHeader, value);

        return {
          ...acc,
          ...parseStrategy[snakeCaseHeader](value, snakeCaseHeader),
        };
      },
      {}
    );
  }

  async function parseAllItems(statId, progressCallback) {
    const result = [];
    const isValidListingToParse = (item) => {
      if (!item) {
        return true;
      }

      return item.total_sold > 5;
    };

    let page = 1;
    while (isValidOffset() && isValidListingToParse(result.at(-1))) {
      const nextPageButton = document.querySelector('button.pagination__next');
      const isNextPageButtonDisabled =
        nextPageButton?.getAttribute('aria-disabled') === 'true';

      const progressPrefix = `page ${page++}`;

      progressCallback(progressPrefix);
      const itemsResult = await parseItemsList(statId, (text) =>
        progressCallback(`${progressPrefix}: ${text}`)
      );

      result.push(...itemsResult);
      if (!nextPageButton || isNextPageButtonDisabled) {
        break;
      }

      nextPageButton.click();
      await wait(1000);
    }

    console.log('result', result);

    return result.map((item) => ({
      ...item,
      mpn: item.mpn?.replaceAll('*', ''),
    }));
  }

  function isValidOffset() {
    const errorText = document.querySelector('.page-notice__title');
    return !errorText?.innerText?.includes(
      'The offset provided is incorrect. Please correct the offset.'
    );
  }

  function parseStats(input) {
    const metricsContainer = document.querySelector('.aggregates');
    const currentDate = formatDate(new Date());
    const result = {
      parsed_at: currentDate,
    };

    if (!metricsContainer) {
      return result;
    }

    const stats = getStatsFromMetricContainer(metricsContainer);

    return {
      ...result,
      input,
      ...stats,
    };
  }

  async function parseItemsList(statId, progressCallback) {
    const rows = document.querySelectorAll('.research-table-row');

    async function getItemInfoFromItemPage(id) {
      const htmlPage = await (
        await fetch(
          `https://www.ebay.com/itm/${id}?nordt=true&orig_cvip=true&rt=nc`
        )
      ).text();
      const doc = new DOMParser().parseFromString(htmlPage, 'text/html');

      const itemSpecifics = {
        mpn: '.ux-labels-values--manufacturerPartNumber .ux-textspans',
        brand: '.ux-labels-values--brand .ux-textspans',
      };
      return Object.entries(itemSpecifics).reduce((acc, [key, selector]) => {
        // 2 spans, first is label, second is value
        const spans = [...doc.querySelectorAll(selector)];
        try {
          const [, el] = spans;

          if (el) {
            const text = el.innerText;
            acc[key] = text;
          }
          return acc;
        } catch (err) {
          console.log('failed to parse item info', id, key, selector);
          spans.forEach((span, idx) => console.log(`span ${idx}`, span));
          throw err;
        }
      }, {});
    }

    async function parseRow(row) {
      const linkWrapper = row.querySelector(
        '.research-table-row__product-info-name'
      );
      const linkEl = linkWrapper.querySelector('a');
      const link = linkEl?.href || null;

      const titleEl = linkWrapper.querySelector('span');
      const id = titleEl.dataset.itemId;
      const title = titleEl.innerText;

      const avgPriceEl = row.querySelector('.research-table-row__avgSoldPrice');
      const price = castDollarStringToNumber(
        avgPriceEl.firstElementChild.firstElementChild.innerText
      );

      const avgShippingCostEl = row.querySelector(
        '.research-table-row__avgShippingCost'
      );
      const shipPrice = castDollarStringToNumber(
        avgShippingCostEl.firstElementChild.firstElementChild.innerText
      );

      const totalSoldEl = row.querySelector(
        '.research-table-row__totalSoldCount'
      );

      const lastDateSoldText = row.querySelector(
        '.research-table-row__dateLastSold'
      )?.innerText;
      const lastDateSold = lastDateSoldText
        ? formatDate(new Date(lastDateSoldText))
        : null;

      const totalSalesText = row.querySelector(
        '.research-table-row__totalSalesValue'
      )?.innerText;
      const totalSales = castDollarStringToNumber(totalSalesText);

      const currentDate = formatDate(new Date());

      return {
        listing_id: id,
        title,
        link,
        avg_sold_price: price,
        avg_shipping: shipPrice,
        total_sold: +totalSoldEl.innerText,
        total_sales: totalSales,
        last_date_sold: lastDateSold,
        parsed_at: currentDate,
        request_id: statId,
        ...(await getItemInfoFromItemPage(id)),
      };
    }

    const rowsChunks = [...rows].reduce((acc, curr) => {
      const lastChunk = acc.at(-1);
      if (!lastChunk || lastChunk.length === 5) {
        acc.push([curr]);
      } else {
        lastChunk.push(curr);
      }

      return acc;
    }, []);

    const result = [];

    let i = 1;
    const itemRows = rowsChunks.flat();
    for (const row of itemRows) {
      progressCallback(`parsing item ${i++} of ${itemRows.length}`);
      result.push(await parseRow(row));
    }

    return result;
  }

  function handleModalOpen() {
    setIsModalOpen(true);
  }

  return e(
    'div',
    {},
    e(
      'div',
      {},
      e('button', { disabled: !!progress, onClick: handleStart }, 'start'),
      e(
        'button',
        {
          onClick: () =>
            (window.location.href =
              'https://www.ebay.com/sh/research?marketplace=EBAY-US&keywords=stub&dayRange=30&categoryId=6000&offset=0&limit=50'),
        },
        'reset'
      )
    ),
    e(
      'div',
      {},
      isModalOpen
        ? [
            e('textarea', { id: 'research-data', rows: 10 }),
            e(
              'button',
              {
                onClick: () => {
                  const value = document.getElementById('research-data').value;
                  setData(value.split('\n'));
                  setIsModalOpen(false);
                },
              },
              'upload'
            ),
            e(
              'button',
              {
                onClick: () => {
                  setIsModalOpen(false);
                },
              },
              'cancel'
            ),
          ]
        : [
            e(
              'button',
              { disabled: !!progress, onClick: handleModalOpen },
              'upload data to research '
            ),
            e('div', {}, `Loaded ${data ? data.length : 'no'} rows`),
          ]
    ),
    e(
      'div',
      {},
      e(
        'button',
        { disabled: !!progress, onClick: toggleFilterResults },
        filterResults ? "disable 'filter results'" : "enable 'filter results'"
      )
    ),
    progress && e('div', {}, progress.text)
  );
}
