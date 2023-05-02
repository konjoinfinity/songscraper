const pageScraper = require('./pageScraper');
var readlineSync = require('readline-sync');

async function scrapeAll(browserInstance){
	let browser;
	try{
		var ugUrl = readlineSync.question('Specify the Ultimate Guitar chord chart url: ');
		console.log('url = ' + ugUrl);
		console.log("Opening the browser......");
		browser = await browserInstance;
		await pageScraper.scraper(browser, ugUrl);	
		
	}
	catch(err){
		console.log("Could not resolve the browser instance => ", err);
	}
}

module.exports = (browserInstance) => scrapeAll(browserInstance)