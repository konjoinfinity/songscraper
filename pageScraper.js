const scraperObject = {
    url: 'https://tabs.ultimate-guitar.com/tab/vance-joy/riptide-chords-1237247',
    async scraper(browser){
        let page = await browser.newPage();
		console.log(`Navigating to ${this.url}...`);
		// Navigate to the selected page
		await page.goto(this.url);
		// Wait for the required DOM to be rendered
		await page.waitForSelector('.P8ReX');
		// Get the link to all the required books
		let first = await page.$$eval('pre > span', options => {
			return options.map(option => option.textContent);
		});
		console.log(first)
		// let second = await page.$$eval('span.fsG7q > span.y68er', options => {
		// 	return options.map(option => option.textContent);
		// });
		// console.log(second)
    }
}

module.exports = scraperObject;