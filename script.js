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

  async function selectCategory(category, progressCallback) {
    document.querySelector('.category-selector-panel__edit-button')?.click();

    // Random pause before clicking category
    await waitRandom(1000, 3000);

    Array.from(
      document.querySelectorAll(
        '[role="tree"] [role="treeitem"] .category-selection-row__category-name-value'
      )
    )
      .find(({ innerText }) => new RegExp(category, 'ig').test(innerText))
      ?.click();

    // Random pause before applying
    await waitRandom(1500, 2500);

    document
      .querySelector('.category-selection-lightbox-dialog__footer-apply')
      ?.click();

    await waitWithProgress(8000, (timeLeft) =>
      progressCallback(`waiting ${timeLeft}s for category to be selected`)
    );
  }

  async function runSearch(searchString, progressCallback) {
    // Random pause before starting search
    await waitRandom(2000, 4000);
    
    // insert input value
    const inputQ = '.textbox__control';
    const input = document.querySelector(inputQ);
    input.value = searchString;

    // Random pause before dispatching event
    await waitRandom(500, 1500);

    input.dispatchEvent(
      new Event('input', { bubbles: true, cancelable: true })
    );

    await waitWithProgress(3000, (timeLeft) =>
      progressCallback(`waiting ${timeLeft}s before search`)
    );

    // trigger search
    const searchBtnQ = '.search-input-panel__research-button';
    const searchBtn = document.querySelector(searchBtnQ);
    
    // Random pause before clicking search button
    await waitRandom(1000, 2000);
    
    searchBtn.click();

    await waitWithProgress(8000, (timeLeft) =>
      progressCallback(`waiting ${timeLeft}s for search results`)
    );
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

  async function selectTab(tabName, progressCallback) {
    const [tabToSelect] = [...document.querySelector('.tabs__items')?.children]
      .filter(Boolean)
      .filter(({ innerText }) => innerText.trim() === tabName);

    if (!tabToSelect) {
      // if no tab is found, just ignore
      return;
    }

    // Random pause before clicking tab
    await waitRandom(800, 2000);

    tabToSelect.click();
    await waitWithProgress(5000, (timeLeft) =>
      progressCallback(`waiting ${timeLeft}s for tab to be selected`)
    );
  }

  async function selectFilter(filterName, progressCallback) {
    const [filterElement] = [
      ...document.querySelectorAll(
        '.research-table-header__inner-item > .text'
      ),
    ].filter((item) => item.innerText === filterName);
    const filterDownElement =
      filterElement?.parentElement.querySelector('.down');

    if (!filterDownElement) {
      // Random pause before clicking filter
      await waitRandom(1000, 2500);
      filterElement?.click();
    }

    await waitWithProgress(3000, (timeLeft) =>
      progressCallback(`waiting ${timeLeft}s for filter to be selected`)
    );
  }

  function filterItems(items, rules) {
    return items.filter((item) => rules.every((rule) => rule(item)));
  }

  async function handleStart() {
    for (let idx = 0; idx < data.length; idx++) {
      const input = data[idx];
      const progressPrefix = `handling ${idx + 1}/${data.length} row`;
      
      // Random pause before starting item processing
      await waitRandom(3000, 6000);
      
      // Long pause every 10 items to simulate break
      if (idx > 0 && idx % 20 === 0) {
        setProgress({ text: `${progressPrefix}: taking a break...` });
        await waitWithProgress(getRandomBetween(240000, 600000), (timeLeft) =>
          setProgress({ text: `${progressPrefix}: break time ${Math.ceil(timeLeft/60)}m ${timeLeft%60}s` })
        );
      }
      
      try {
        setProgress({ text: `${progressPrefix}: click search` });

        await runSearch(input, (text) =>
          setProgress({ text: `${progressPrefix}: run search: ${text}` })
        );

        if (!isListingFoundInSearch()) {
          await writeResearchRequestToDatastore({
            parsed_at: formatDate(new Date()),
          });
          continue;
        }

        setProgress({ text: `${progressPrefix}: select category` });
        await selectCategory('ebay motors', (text) =>
          setProgress({ text: `${progressPrefix}: select category: ${text}` })
        );

        setProgress({ text: `${progressPrefix}: select filter` });
        await selectFilter('Total sold', (text) =>
          setProgress({ text: `${progressPrefix}: select filter: ${text}` })
        );

        setProgress({ text: `${progressPrefix}: select tab` });
        await selectTab('Sold', (text) =>
          setProgress({ text: `${progressPrefix}: select tab: ${text}` })
        );

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

        await waitWithProgress(8000, (timeLeft) =>
          setProgress({
            text: `${progressPrefix}: waiting ${timeLeft}s before next`,
          })
        );

        // Add random delay to simulate human behavior
        const randomDelay = Math.floor(Math.random() * 5000) + 2000; // 2-7 seconds
        await waitWithProgress(randomDelay, (timeLeft) =>
          setProgress({
            text: `${progressPrefix}: random delay ${timeLeft}s`,
          })
        );

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

      // Random pause before going to next page
      await waitRandom(3000, 6000);

      nextPageButton.click();
      await waitWithProgress(5000, (timeLeft) =>
        progressCallback(`${progressPrefix}: waiting ${timeLeft}s before next`)
      );
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
      await waitRandom(2000, 4000);
      
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
      progressCallback(`item ${i++} of ${itemRows.length}`);
      
      // Random pause before processing listing
      await waitRandom(2000, 4000);
      
      result.push(await parseRow(row));
      await waitWithProgress(4000, (timeLeft) =>
        progressCallback(`waiting ${timeLeft}s before next`)
      );
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
      e('div', {}, `filter results: ${filterResults ? 'enabled' : 'disabled'}`),
      e(
        'button',
        { disabled: !!progress, onClick: toggleFilterResults },
        filterResults ? 'disable' : 'enable'
      )
    ),
    progress && e('div', {}, progress.text)
  );
}
